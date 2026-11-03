# OmniRoute Bandit Proxy Technical Guidelines

- **Bandit**: `DiscountedUCB1Bandit` uses 0.99 discount/event; `_rankCache` (30s TTL).
- **DB**: `better-sqlite3`; schema migrations only `ADD COLUMN`.
- **Training**: Isolated `models_train` table; production reads `models` + `0.3*models_train` (if `N < 1`).
- **Error Handling**: 5 classification scopes (ban, cooldown, flag, etc.); `consecutive_5xx` triggers degraded mode.
- **Quota**: Provider-level (not model), atomic checks of minute/day windows.
- **Proxy/Sessions**: `SESSION_TTL_MS` = 30m; `STREAM_IDLE_MS` = 60s (reset on any chunk/heartbeat).
- **Soft Bias**: `profileMultiplier` (multipliers stack) applies to UCB1 score.
- **Testing**: `node:test` + in-memory `:memory:` DB.
- **Gotcha**: Fallback chain in `config/bandit.json` bypasses UCB1.
