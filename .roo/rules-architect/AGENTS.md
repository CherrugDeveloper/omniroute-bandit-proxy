# Architect Mode — OmniRoute Bandit Proxy AGENTS.md

Non-obvious, project-specific guidance for architectural decisions.

## Bandit Algorithm
- `DiscountedUCB1Bandit` uses **0.99 discount per event**; `_rankCache` 30s TTL.
- `_sanitizeModelId()` strips a duplicated provider prefix only if the sanitized id exists in `catalog`; otherwise returns the original id.
- Fallback chain in `config/bandit.json` **bypasses UCB1** entirely.

## Database & Training
- `better-sqlite3`; migrations are additive-only (`ADD COLUMN` in `_migrateDB`).
- Isolated `models_train` table; production reads `models` + `0.3*models_train` (when `N < 1`).
- `models` and `provider_history` stay in sync on bans/cooldowns via `recordFeedback()`: model bans update `provider_history.needs_attention`/`permanent`; model cooldowns update `provider_history.cooldown_until`.
- `recordFeedback()` wraps non-object errorDetails into `{message, status}` so `_classifyError()` always runs.

## Error Classification & Punishment
- `config/bandit.json` maps `safeWrite|cannot access safeWrite|safeWrite before initialization|safeWrite is not initialized` to **cooldown-model** (transient, scope: model).
- **5-strike system**: 5 consecutive critical failures (403, 429) → permanent ban. Counter resets on success.
- Timeout errors are **transient (cooldown-model)**, NOT critical.
- `consecutive_5xx ≥ 3` triggers degraded mode.
- Exponential backoff cooldowns: 15s → 5m → 30m → 2h → permanent.

## Quota
- Provider-level quota; atomic minute+day window check; background roller runs every 60s even without requests.
