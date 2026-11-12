# OmniRoute Bandit Proxy — AGENTS.md

Non-obvious, project-specific guidance for this codebase.

## Bandit Algorithm
- `DiscountedUCB1Bandit` applies a **0.99 discount per event**; `_rankCache` has a **30s TTL**.
- `_sanitizeModelId()` strips a duplicated provider prefix (e.g. `mistral/mistral-x` → `mistral-x`) only when the sanitized id exists in `catalog`; otherwise returns the original id so it can be tracked/banned.

## Error Classification & Punishment
- Error config lives in [`config/bandit.json`](config/bandit.json:1): `errorConfig.classification.transientErrors` and `permanentErrors` are pattern→action lists.
- `safeWrite|cannot access safeWrite|safeWrite before initialization|safeWrite is not initialized` maps to **ban-model** (scope: model).
- **3-strike system**: 3 consecutive critical failures (403, 429, safeWrite errors) → permanent ban. `consecutive_critical_failures` counter resets on success.
- Timeout errors are classified as **transient (cooldown-model)**, NOT critical.
- `consecutive_5xx ≥ 3` triggers degraded mode.
- Exponential backoff cooldowns: 15s → 5m → 30m → 2h → permanent.

## Database & Training
- [`better-sqlite3`](src/bandit.mjs:33); migrations are additive-only (`ADD COLUMN` in `_migrateDB`).
- Isolated `models_train` table; production reads `models` + `0.3*models_train` (when `N < 1`).
- Training daemon runs in isolated round-robin writes to `models_train`; controlled via [`scripts/train-ctl.sh`](scripts/train-ctl.sh:1).
- `models` and `provider_history` tables stay in sync on bans/cooldowns via `recordFeedback()`: model bans update `provider_history.needs_attention`/`permanent`; model cooldowns update `provider_history.cooldown_until`.

## Quota
- Provider-level (not model) quota; atomic minute+day window check.
- Background roller (`_startBackgroundRoller`) rolls quota windows every **60s** even without incoming requests, so providers recover from rate-limit exhaustion without a new request.

## Proxy & Sessions
- `SESSION_TTL_MS` = 30m; `STREAM_IDLE_MS` = 60s (resets on **any** chunk/heartbeat).
- Token estimation = 4 chars/token.
- Fallback chain in [`config/bandit.json`](config/bandit.json:2) **bypasses UCB1** entirely.

## Profile Bias
- `profileMultiplier` from [`src/modes-registry.mjs`](src/modes-registry.mjs:1) applies to UCB1 score; multipliers stack.
