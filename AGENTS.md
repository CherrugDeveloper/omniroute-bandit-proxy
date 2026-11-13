# AGENTS.md

This file provides guidance to agents when working with code in this repository.

# OmniRoute Bandit Proxy — AGENTS.md

Non-obvious, project-specific guidance for this codebase.

## Commands
- `npm start` — runs `node src/index.mjs`
- `npm run dev` — runs `node --watch src/index.mjs`
- `npm run check` — syntax-checks `src/index.mjs` and `src/bandit.mjs` via `node --check`
- `npm test` — runs `node --test __tests__/*.test.js` (77 tests)

## Bandit Algorithm
- `DiscountedUCB1Bandit` applies a **0.99 discount per event**; `_rankCache` has a **30s TTL**.
- `_sanitizeModelId()` strips a duplicated provider prefix (e.g. `mistral/mistral-x` → `mistral-x`) only when the sanitized id exists in `catalog`; otherwise returns the original id so it can be tracked/banned.

## Error Classification & Punishment
- Error config in [`config/bandit.json`](config/bandit.json:1): `errorConfig.classification.transientErrors` and `permanentErrors` are pattern→action lists.
- `safeWrite|cannot access safeWrite|safeWrite before initialization|safeWrite is not initialized` maps to **cooldown-model** (transient, scope: model) — NOT critical.
- **5-strike system**: 5 consecutive critical failures (403, 429) → permanent ban. Counter resets on success.
- Timeout errors are **transient (cooldown-model)**, NOT critical.
- `consecutive_5xx ≥ 3` triggers degraded mode.
- Exponential backoff cooldowns: 15s → 5m → 30m → 2h → permanent.
- Cascade ban guard: paid-group-ban UPDATE includes `AND permanent = 0`.
- Emergency rejection countermeasure downgraded from `ban-model` to `cooldown-model` (300000ms).

## Database & Training
- [`better-sqlite3`](src/bandit.mjs:33); migrations are additive-only (`ADD COLUMN` in `_migrateDB`).
- Isolated `models_train` table; production reads `models` + `0.3*models_train` (when `N < 1`).
- Training daemon writes to `models_train` round-robin; controlled via [`scripts/train-ctl.sh`](scripts/train-ctl.sh:1).
- `models` and `provider_history` sync on bans/cooldowns via `recordFeedback()`.
- `resetProvider(provider)` now resets `provider_history` AND all models of that provider in `models` + `models_train` tables.

## Proxy & Sessions
- `SESSION_TTL_MS` = 30m; `STREAM_IDLE_MS` = 60s (resets on **any** chunk/heartbeat).
- Token estimation = 4 chars/token.
- Fallback chain in [`config/bandit.json`](config/bandit.json:2) **bypasses UCB1** entirely.

## Profile Bias
- `profileMultiplier` from [`src/modes-registry.mjs`](src/modes-registry.mjs:1) applies to UCB1 score; multipliers stack.

## Stats Aggregator
- `src/stats-aggregator.mjs`: `StatsAggregator` singleton maintains real-time punishment stats from event stream.
- `getStatsAggregator()` / `shutdownStatsAggregator()` manage singleton lifecycle.
- Maintains per-model and per-provider stats; event history in reverse chronological order; dashboard WebSocket updates.
