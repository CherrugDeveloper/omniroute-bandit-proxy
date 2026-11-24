# Ask Mode — OmniRoute Bandit Proxy AGENTS.md

Non-obvious, project-specific guidance for questions about this codebase.

## Bandit Algorithm
- `DiscountedUCB1Bandit` uses **0.99 discount per event**; `_rankCache` 30s TTL.
- `_sanitizeModelId()` strips a duplicated provider prefix only if the sanitized id exists in `catalog`; otherwise returns the original id.

## Error Classification & Punishment
- `config/bandit.json` maps `safeWrite|cannot access safeWrite|safeWrite before initialization|safeWrite is not initialized` to **cooldown-model** (transient, scope: model).
- **5-strike system**: 5 consecutive critical failures (403, 429) → permanent ban. Counter resets on success.
- Timeout errors are **transient (cooldown-model)**, NOT critical.
- `consecutive_5xx ≥ 5` triggers degraded mode (updated from 3 in v0.53.14).
- Exponential backoff cooldowns: 30s → 2min → 5min → 15min → 30min → 1hr → 2hr → 6hr → 12hr → permanent (10+).
- Training daemon: `TRAIN_MAX_TIMEOUT_SKIP` (default: 3) and `TRAIN_MAX_FAIL_SKIP` (default: 5) env vars control provider skip thresholds.
- Structured logger: `LOG_LEVEL` env var (alias of `STRUCTURED_LOG_LEVEL`) accepts `debug|info|warn|error`.

## Database & Training
- `better-sqlite3`; migrations are additive-only (`ADD COLUMN` in `_migrateDB`).
- Isolated `models_train` table; production reads `models` + `0.3*models_train` (when `N < 1`).
- `models` and `provider_history` stay in sync on bans/cooldowns via `recordFeedback()`.

## Proxy & Sessions
- `SESSION_TTL_MS` = 30m; `STREAM_IDLE_MS` = 60s (resets on any chunk/heartbeat).
- Token estimation = 4 chars/token.
- Fallback chain in `config/bandit.json` **bypasses UCB1**.