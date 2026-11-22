# Debug Mode — OmniRoute Bandit Proxy AGENTS.md

Non-obvious, project-specific guidance for debugging.

## Error Classification & Punishment
- `config/bandit.json` maps `safeWrite|cannot access safeWrite|safeWrite before initialization|safeWrite is not initialized` to **cooldown-model** (transient, scope: model) — NOT critical.
- **5-strike system**: 5 consecutive critical failures (403, 429) → permanent ban. Counter resets on success.
- Timeout errors are **transient (cooldown-model)**, NOT critical.
- `consecutive_5xx ≥ 5` triggers degraded mode (updated from 3 in v0.53.14).
- Exponential backoff cooldowns: 30s → 2min → 5min → 15min → 30min → 1hr → 2hr → 6hr → 12hr → permanent (10+).
- Training daemon: `TRAIN_MAX_TIMEOUT_SKIP` (default: 3) and `TRAIN_MAX_FAIL_SKIP` (default: 5) env vars control provider skip thresholds.
- Structured logger: `LOG_LEVEL` env var (alias of `STRUCTURED_LOG_LEVEL`) accepts `debug|info|warn|error`.

## Database & State
- `better-sqlite3`; migrations are additive-only (`ADD COLUMN` in `_migrateDB`).
- `models` and `provider_history` tables stay in sync on bans/cooldowns via `recordFeedback()`: model bans update `provider_history.needs_attention`/`permanent`; model cooldowns update `provider_history.cooldown_until`.
- `recordFeedback()` wraps non-object errorDetails into `{message, status}` so `_classifyError()` always runs.

## Proxy & Sessions
- `SESSION_TTL_MS` = 30m; `STREAM_IDLE_MS` = 60s (resets on any chunk/heartbeat).
- Fallback chain in `config/bandit.json` **bypasses UCB1**.

## Quota
- Provider-level quota with atomic minute+day window check; background roller runs every 60s even without requests.
