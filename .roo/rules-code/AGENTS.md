# Code Mode — OmniRoute Bandit Proxy AGENTS.md

Non-obvious, project-specific guidance for code changes.

## Bandit Algorithm
- `DiscountedUCB1Bandit` uses **0.99 discount per event**; `_rankCache` 30s TTL.
- `_sanitizeModelId()` strips a duplicated provider prefix (e.g. `mistral/mistral-x` → `mistral-x`) only if the sanitized id exists in `catalog`; otherwise returns the original id so it can be tracked/banned.

## Error Classification & Punishment
- `config/bandit.json` maps `safeWrite|cannot access safeWrite|safeWrite before initialization|safeWrite is not initialized` to **cooldown-model** (transient error, scope: model).
- **5-strike system**: 5 consecutive critical failures (403, 429) → permanent ban. `consecutive_critical_failures` counter resets on success. `safeWrite` errors are NOT critical.
- Timeout errors are **transient (cooldown-model)**, NOT critical.
- `consecutive_5xx ≥ 3` triggers degraded mode.
- Exponential backoff cooldowns: 15s → 5m → 30m → 2h → permanent.
- Cascade ban guard: paid-group-ban UPDATE includes `AND permanent = 0` to prevent re-banning already permanently banned models.
- Emergency rejection countermeasure downgraded from `ban-model` to `cooldown-model` (300000ms) to prevent cascade auto-bans.

## Database
- `better-sqlite3`; migrations are additive-only (`ADD COLUMN` in `_migrateDB`).
- Isolated `models_train` table; production reads `models` + `0.3*models_train` (when `N < 1`).
- `models` and `provider_history` stay in sync on bans/cooldowns via `recordFeedback()`.

## Proxy & Sessions
- `SESSION_TTL_MS` = 30m; `STREAM_IDLE_MS` = 60s (resets on any chunk/heartbeat).
- Token estimation = 4 chars/token.
- Fallback chain in `config/bandit.json` **bypasses UCB1**.

## Profile Bias
- `profileMultiplier` applies to UCB1 score; multipliers stack.
