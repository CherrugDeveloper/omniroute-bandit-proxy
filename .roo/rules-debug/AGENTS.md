# Debug Mode — OmniRoute Bandit Proxy AGENTS.md

Non-obvious, project-specific guidance for debugging.

## Error Classification & Punishment
- `config/bandit.json` maps `safeWrite|cannot access safeWrite|safeWrite before initialization|safeWrite is not initialized` to **ban-model**.
- **3-strike system**: 3 consecutive critical failures (403, 429, safeWrite errors) → permanent ban. `consecutive_critical_failures` counter resets on success.
- Timeout errors are **transient (cooldown-model)**, NOT critical.
- `consecutive_5xx ≥ 3` triggers degraded mode.
- Exponential backoff cooldowns: 15s → 5m → 30m → 2h → permanent.

## Database & State
- `better-sqlite3`; migrations are additive-only (`ADD COLUMN` in `_migrateDB`).
- `models` and `provider_history` tables stay in sync on bans/cooldowns via `recordFeedback()`: model bans update `provider_history.needs_attention`/`permanent`; model cooldowns update `provider_history.cooldown_until`.

## Proxy & Sessions
- `SESSION_TTL_MS` = 30m; `STREAM_IDLE_MS` = 60s (resets on any chunk/heartbeat).
- Fallback chain in `config/bandit.json` **bypasses UCB1**.

## Quota
- Provider-level quota with atomic minute+day window check; background roller runs every 60s even without requests.
