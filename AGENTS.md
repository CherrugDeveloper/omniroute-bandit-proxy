# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Critical Patterns
- **Port 8080 Conflicts**: Always run `./scripts/free-port-emergency.sh` before restarting if port 8080 is in use (service may be hung)
- **Service Restart**: Use `./scripts/restart-safe.sh -q` for silent restarts; `-f` to follow logs; `--no-refresh`/`-n` to skip dashboard refresh
- **Dashboard Initialization**: Must wait for WebSocket connection to establish before making API calls (see apiFetch implementation)
- **Token Management**: API tokens are stored in localStorage as 'omniroute_token' - must persist across reloads
- **Model Fetch**: All model sync operations must use the `fetchAndSyncModels` function from bandit.mjs (never make direct API calls)

## Security Requirements
- All user input must be sanitized through the bandit's `_sanitizeModelId()` function before API calls
- Never trust client-side validation - all security checks happen server-side in bandit.mjs
- The 5-strike ban system (403/429 errors) requires 5 consecutive critical failures before permanent ban

## Common Pitfalls
- AbortError occurs when switching dashboard tabs - previous model fetch requests get cancelled
- WebSocket connections fail if the backend service isn't running on 127.0.0.1:8080
- Database migrations are additive-only - cannot drop columns, only ADD COLUMN
- Health checks run every 15 minutes for model rehabilitation (not immediately after ban)

## Bandit Algorithm (Non-Obvious)
- `DiscountedUCB1Bandit` uses **0.99 discount per event**; `_rankCache` 30s TTL
- `_sanitizeModelId()` strips a duplicated provider prefix (e.g. `mistral/mistral-x` → `mistral-x`) only if the sanitized id exists in `catalog`; otherwise returns the original id so it can be tracked/banned
- Fallback chain in `config/bandit.json` **bypasses UCB1** entirely

## Error Classification & Punishment (Non-Obvious)
- `config/bandit.json` pattern order matters — first match wins; Playwright/Cloudflare 502/503 must precede generic `5xx|server-error`
- `safeWrite|cannot access safeWrite|safeWrite before initialization|safeWrite is not initialized` → **cooldown-model** (transient, scope: model) — NOT critical
- **5-strike system**: 5 consecutive critical failures (403, 429) → permanent ban. Counter resets on success. `safeWrite` errors are NOT critical
- Timeout errors are **transient (cooldown-model)**, NOT critical
- `consecutive_5xx ≥ 5` triggers degraded mode (updated from 3 in v0.53.14)
- Exponential backoff cooldowns: 30s → 2min → 5min → 15min → 30min → 1hr → 2hr → 6hr → 12hr → permanent (10+)
- Training daemon: `TRAIN_MAX_TIMEOUT_SKIP` (default: 3) and `TRAIN_MAX_FAIL_SKIP` (default: 5) env vars control provider skip thresholds
- Structured logger: `LOG_LEVEL` env var (alias of `STRUCTURED_LOG_LEVEL`) accepts `debug|info|warn|error`
- Cascade ban guard: paid-group-ban UPDATE includes `AND permanent = 0`
- Cascade guard skip list covers capability-based rejections (`non_chat_model_excluded`, `no_tools_support`, `max_input_tokens_exceeded`, `exclude_thinking`, `dynamic_max_tokens_exceeded`) so capability mismatches never trigger cooldowns
- Emergency rejection countermeasure downgraded from `ban-model` to `cooldown-model` (300000ms)

## Cascade Ban Prevention (v0.53.10)
- 5-strike paid-group-ban now sets only `needs_attention = 1` on provider_history (NOT `permanent = 1`) — ban isolated to individual model
- Escalation permanent-ban now sets only `needs_attention = 1` on provider_history (NOT `permanent = 1`) — prevents provider-wide cascade bans
- Model-not-found pattern no longer includes "not found" — bare 404 status alone does not trigger permanent ban
- 403 key-limit-exceeded pattern no longer includes bare "403|" — requires specific phrases (lifetime limit, total limit, never resets, etc.)
- Default `UPSTREAM_TIMEOUT_MS` increased from 20000ms to 60000ms for slower models

## Config State Cascade Fix (v0.53.13)
- Generic 502/503/504 errors now classified as `cooldown-model` with `upstream-error` reason (TRANSIENT) instead of `provider-misconfigured` (PERMANENT) — prevents cascade of config state across all provider models
- `cooldown-model` punishment no longer sets `needs_attention = 1` on provider_history; config state only triggered by genuine user-intervention errors (auth-expired, anti-abuse, safeWrite-init-error)
- New `resetUnifiedHistory()` method and `POST /v1/reset/history` endpoint to clear stuck punishment events and old request logs
- Dashboard now has "🗑️ Reset" button in Unified History panel
- `PROXY` removed from default log denylist; runtime override via `LOG_BUFFER_DENYLIST` env var
- Polling intervals increased (main loop 1s→2s, fetch intervals 5s→10s) with `requestIdleCallback` for DOM updates
- `recentRequests` RingBuffer increased from 5 to 50 entries

## Database (Non-Obvious)
- `better-sqlite3`; migrations are additive-only (`ADD COLUMN` in `_migrateDB`)
- Isolated `models_train` table; production reads `models` + `0.3*models_train` (when `N < 1`)
- `models` and `provider_history` stay in sync on bans/cooldowns via `recordFeedback()`
- `recordFeedback()` wraps non-object errorDetails into `{message, status}` so `_classifyError()` always runs

## Proxy & Sessions (Non-Obvious)
- `SESSION_TTL_MS` = 30m; `STREAM_IDLE_MS` = 60s (resets on any chunk/heartbeat)
- Token estimation = 4 chars/token
- Fallback chain in `config/bandit.json` **bypasses UCB1**

## Profile Bias
- `profileMultiplier` applies to UCB1 score; multipliers stack

## Dashboard Features
- **Copy All Button** (v0.53.15): "📋 Copia Tutti" exports metrics, model stats, provider stats, training status, and active tab data as TSV
- **Reset All Stats & Logs** (v0.53.23): Quick action button calls `/v1/reset/counters` + `/v1/reset/history` (includes unified history)
- **PWA Mode** (v0.53.23): Dashboard opens via Chrome `--app` flag for standalone window experience
- Toast notifications appear bottom-right (no confirmation dialogs for reset actions)

## Top Model Reset API (v0.53.19)
- Added `POST /v1/reset/top-model` endpoint to reset the top model (highest average reward)
- Added `getTopModelId()` method in bandit.mjs - returns model ID sorted by sum_reward/N DESC (N >= 1)
- Added `resetTopModel()` method - resets top model statistics and clears provider attention flags