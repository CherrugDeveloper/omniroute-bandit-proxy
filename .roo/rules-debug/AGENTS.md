# Debug Mode - OmniRoute Bandit Proxy AGENTS.md

- **Bandit**: `DiscountedUCB1Bandit` uses 0.99 discount/event; `_rankCache` (30s TTL).
- **DB**: `better-sqlite3`; additive-only migrations (`ADD COLUMN` in `_migrateDB`).
- **Training**: Isolated `models_train` table; production reads `models` + `0.3*models_train` (if `N < 1`).
- **Error Handling**: 5 scopes (ban/cooldown/flag provider/model); `consecutive_5xx ≥ 3` → degraded.
- **Quota**: Provider-level (RPM/RPD); atomic minute+day window check.
- **Proxy/Sessions**: `SESSION_TTL_MS`=30m; `STREAM_IDLE_MS`=60s (resets on ANY chunk/heartbeat).
- **Soft Bias**: `profileMultiplier` applies to UCB1 score; multipliers stack.
- **Testing**: `node:test` + in-memory `:memory:` DB; helpers: `makeBandit()`, `seedCatalog()`.
- **Gotchas**: Fallback chain (`config/bandit.json`) bypasses UCB1; token est. = 4 chars/token.
- **Recent Changes**: Exponential backoff cooldowns (15s->5m->30m->2h->permanent); `total_failures` tracking; emergency relaxation now respects cooldowns; consecutive fails reset on success; 3-strike aggressive punishment for critical failures
- **Error Pattern**: `config/bandit.json` now maps `safeWrite|cannot access safeWrite|safeWrite before initialization|safeWrite is not initialized` to ban-model
- **3-Strike System**: Aggressive punishment for critical failures (403 forbidden, 429 rate limit, timeout, safeWrite errors) - permanent ban after 3 consecutive critical failures; `consecutive_critical_failures` counter tracks the streak and resets on success
