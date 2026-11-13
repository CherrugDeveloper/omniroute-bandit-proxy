# AGENTS.md

This file provides guidance to agents when working with code in this repository.

# OmniRoute Bandit Proxy — AGENTS.md

Non-obvious, project-specific guidance for this codebase.

## Bandit Algorithm
- `DiscountedUCB1Bandit` applies a **0.99 discount per event**; `_rankCache` has a **30s TTL**.
- `_sanitizeModelId()` strips a duplicated provider prefix (e.g. `mistral/mistral-x` → `mistral-x`) only when the sanitized id exists in `catalog`; otherwise returns the original id so it can be tracked/banned.

## Error Classification & Punishment
- `config/bandit.json`: `errorConfig.classification.transientErrors` and `permanentErrors` are pattern→action lists; order matters — first match wins.
- `safeWrite|cannot access safeWrite|safeWrite before initialization|safeWrite is not initialized` → **cooldown-model** (transient, scope: model) — NOT critical.
- **5-strike system**: 5 consecutive critical failures (403, 429) → permanent ban. Counter resets on success. `safeWrite` errors are NOT critical.
- Timeout errors are **transient (cooldown-model)**, NOT critical.
- `consecutive_5xx ≥ 3` triggers degraded mode.
- Exponential backoff cooldowns: 15s → 5m → 30m → 2h → permanent.
- Cascade ban guard: paid-group-ban UPDATE includes `AND permanent = 0`.
- Emergency rejection countermeasure downgraded from `ban-model` to `cooldown-model` (300000ms).
- `reviveModel(modelId)` clears `permanent = 0`, `banned_since = 0`, `cooldown_until = 0`, `degraded = 0` on `models` and `provider_history`.
- `_checkRehabilitation()` auto-rehabilitates permanent bans after the rehab period.
- Timeout errors are **transient (cooldown-model)**, NOT critical — they never count toward the 5-strike permanent ban.
- `safeWrite` errors are **cooldown-model** (transient), NOT critical — they never count toward strikes.

## Database & Training
- `better-sqlite3`; migrations are additive-only (`ADD COLUMN` in `_migrateDB`).
- Isolated `models_train` table; production reads `models` + `0.3*models_train` (when `N < 1`).
- `models` and `provider_history` stay in sync on bans/cooldowns via `recordFeedback()`.
- `resetProvider(provider)` resets `provider_history` only (cooldowns, bans, failures). Models and `models_train` tables are NOT touched — use `/v1/reset/model` for model-scoped resets.
- `recordFeedback()` wraps non-object errorDetails into `{message, status}` so `_classifyError()` always runs.
- `punishment_events` table stores all punishment/cooldown/ban events for ring buffer persistence.

## Proxy & Sessions
- `SESSION_TTL_MS` = 30m; `STREAM_IDLE_MS` = 60s (resets on **any** chunk/heartbeat).
- Token estimation = 4 chars/token.
- Fallback chain in `config/bandit.json` **bypasses UCB1** entirely.
- Session affinity: pinned model availability re-validated via `bandit.isModelAvailable()` before routing.
- Emergency relaxation passes 3 & 4 pre-check model availability before selecting fallback candidates.
- Health probe requires `data.choices && Array.isArray(data.choices)` — empty/truthy-but-invalid responses are NOT considered healthy.
- `STREAM_DRAIN_MS` env var (default 30000ms) sets drain timeout in `safeWrite()` — writes that exceed this are aborted with `'drain-timeout'`.
- Stream backpressure: `safeWrite()` uses `res.on('drain', ...)` with a `setTimeout` guard to prevent indefinite hangs.

## Profile Bias
- `profileMultiplier` from `src/modes-registry.mjs:1` applies to UCB1 score; multipliers stack.

## Logging
- `STRUCTURED_LOG` env var enables JSON-structured logging via `src/structured-logger.mjs`.
- Ring buffer (max 1000 events) persists across restarts via `initializeEventBuffer(bandit)` which loads from `punishment_events` table on startup.
- `isLowValueNoise()` (from `src/log-throttle.mjs`) gates ring-buffer writes: low-value noise lines (CORS/DEBUG, debug auth, polling paths) are skipped.
- `console.log/error/warn` overrides use `serializeArgs()` + `consoleThrottler.decide()`; only non-throttled, non-low-value-noise lines are pushed to the ring buffer.
- Debug tags `[SESSION]`, `[MSGS]`, `[MODE]`, `[FORCE]`, `[BANDIT]` are gated behind `isDebugVerbose()` (TTL-controlled flag, default 15min).
- `sanitizeErrorBody()` (maxLength default 300) redacts API keys/JWTs/Bearer tokens and truncates upstream error bodies before logging at `[UPSTREAM]`, `[STREAM ERR]` sites.
- Unhandled rejection handler no longer calls `process.exit(1)`; counter resets after >20 rejections to allow continued operation.

## Stats Aggregator
- `src/stats-aggregator.mjs`: `StatsAggregator` singleton maintains real-time punishment stats from event stream.
- `getStatsAggregator()` / `shutdownStatsAggregator()` manage singleton lifecycle.
- Maintains per-model and per-provider stats; event history in reverse chronological order; dashboard WebSocket updates.

## Provider Quota
- `src/provider-quota.mjs`: `_startBackgroundRoller()` checks `_hasPendingQuota(provider, isPaid)` before rolling windows — only rolls when quota is actually exhausted.
- `_hasPendingQuota()` verifies a provider has quota exhausted before triggering a background rollover.

## Commands (non-obvious)
- `npm run check` — syntax-checks `src/index.mjs` and `src/bandit.mjs` via `node --check`.
- `npm test` — runs `node --test __tests__/*.test.js` (77 tests).
