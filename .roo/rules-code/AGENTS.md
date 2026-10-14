# Code Mode - OmniRoute Bandit Proxy AGENTS.md

## Code Mode Specific Instructions

### Key Non-Obvious Code Patterns

#### Bandit Algorithm Implementation (`src/bandit.mjs`)
- **DiscountedUCB1Bandit** class: `discountFactor=0.99` applied *per feedback event* (not per timestep)
- **Rank Cache**: `_rankCache` with 30s TTL - `getModelRank()` returns cached rankings to avoid recalculation
- **Catalog/DB Merge**: `selectModel()` prefers database models over catalog when same provider+id; DB models carry `N`, `sum_reward`, `fails`, `cooldown_until`, `permanent`, `degraded`, `consecutive_5xx`
- **Soft Bias**: `profileMultiplier(profile, modelName)` from `modes-registry.mjs` multiplies *UCB1 score* (not reward) based on regex: `isCode`, `isThinking`, `isFast`, `isBig`, `isSmall`, `isFIM`, `isLowTPM` - multipliers stack
- **Training Isolation**: Separate `models_train` table; daemon writes there; `selectModel()` uses `models_train × 0.3` as prior when production `N < 1`
- **Fallback Chain**: 6 models from `config/bandit.json` used when no ranked models available; bypasses UCB1 entirely

#### Database Operations
- **better-sqlite3** for all operations (single connection, synchronous)
- **Schema Migrations**: `_migrateDB()` only ADD COLUMN, never DROP/ALTER TYPE - additive only
- **Tables**: `models`, `models_train`, `provider_history`, `catalog`, `meta`, `request_logs`
- **Connection**: Established in constructor with automatic initialization

#### Error Classification (`_classifyError` in `src/bandit.mjs:100-300`)
Five actions with scope/reason:
```javascript
// Returns: { action, scope, reason, cooldownMs?, retryAfterMs? }
ban-provider     // 401/403 auth, 404 deleted, 418 teapot, 429 org-quota, 5xx repeated
ban-model        // 400 context-length, 404 model-not-found, 410 gone
cooldown-provider // 429 rate-limit (respects retry-after), 5xx transient
cooldown-model   // 429 model-specific, 503 overloaded
flag-provider    // 400 validation (non-context), 408 timeout, 422 unprocessable, 502/504 gateway
```
- Parses `retry-after` header (seconds or HTTP-date)
- `quota_exhausted` reason → permanent ban
- `consecutive_5xx` counter on models table → degraded mode after 3

#### Provider Quota (`src/provider-quota.mjs`)
- Rolling minute + day windows per provider
- Limits from `config/provider-limits.json` (RPM/RPD)
- `canCall(provider)` checks both windows atomically
- `recordQuotaExhausted()` → provider ban with `quota_exhausted` reason

### Common Code Issues to Avoid

1. **Duplicate Methods**: Ensure `getModelRank()` appears only once in `bandit.mjs`
2. **Provider Attention Flags**: Must clear `needs_attention` via `clearProviderAttention()` or `POST /v1/provider/retry/:p` - health checks DON'T auto-clear
3. **Database Migrations**: New columns via ADD COLUMN in `_migrateDB()`, never direct schema changes
4. **Token Estimation**: Always use `estimateTokens()` (4 chars/token heuristic) for context window validation
5. **Session TTL**: `SESSION_TTL_MS` default 1800000 (30 min), not 24h - old docs are stale
6. **Fallback Bypasses Bandit**: Fallback chain from config used without UCB1 scoring
7. **Training Writes to models_train**: Daemon isolates writes; production reads `models` + blends `models_train × 0.3` only when `N < 1`
8. **Quota is Per-Provider**: `config/provider-limits.json` defines RPM/RPD at provider level, not model level
9. **Soft Bias Multipliers Stack**: Model matching multiple patterns gets product of multipliers
10. **Stream Idle Resets on ANY Chunk**: SSE comments/heartbeats reset 60s `STREAM_IDLE_MS` timer
11. **Ring Buffer Deduplication**: Consecutive identical log lines collapsed with count suffix

### Testing Best Practices

- Tests use `node:test` framework
- Database is in-memory (`:memory:`) for tests
- Helper functions: `makeBandit()`, `seedCatalog()`
- Coverage: error classification, model selection, provider management
- Run single test: `node --test tests/bandit.test.mjs`

### Configuration Management

- Environment variables drive behavior (see `.env.example`)
- Key variables: `EXCLUDE_PAID`, `ONLY_FREE`, `EXCLUDE_THINKING`, `EXPLOIT_ONLY`, `DASHBOARD_TOKEN`
- Database path via `DATABASE_PATH`
- Health check interval via `HEALTH_CHECK_INTERVAL_MS`
- Session TTL via `SESSION_TTL_MS` (default 1800000 = 30min)
- Timeout config: `UPSTREAM_TIMEOUT_MS` (20000), `STREAM_IDLE_MS` (60000), `STREAM_MAX_MS` (180000)

### Performance Considerations

- 30-second cache for model rankings (`_rankCache`)
- Health checks every 5 min (batch size 20, 15s timeout)
- Session cleanup every 5 min (max 10k entries, LRU)
- Efficient DB queries with proper indexing
- Single SQLite connection (better-sqlite3)

### Debugging Tips

- Check `training.log` for training-related events
- Console logs are structured (already present in production)
- Database contains all interaction logs (`request_logs` table)
- Health check endpoint: `/v1/health-check/status`
- Ring buffer: `/v1/logs` (200 entries with deduplication)
- Active requests: `/v1/active`, `/v1/inflight`
- Provider quota snapshot: `/v1/quota`

### Critical Code Locations

| Feature | File | Lines |
|---------|------|-------|
| Bandit core | `src/bandit.mjs` | 1-1630 |
| Error classification | `src/bandit.mjs` | ~100-300 |
| Model selection | `src/bandit.mjs` | `selectModel()` |
| Feedback recording | `src/bandit.mjs` | `recordFeedback()` |
| Proxy handler | `src/index.mjs` | ~800-1100 (retry loop) |
| Session affinity | `src/index.mjs` | `computeSessionKey()`, `sessionModelMap` |
| Streaming timeouts | `src/index.mjs` | `STREAM_IDLE_MS`, `STREAM_MAX_MS` |
| Context compression | `src/index.mjs` | `compressBody()`, `truncateBiggestMessage()` |
| Health checker | `src/health-check.mjs` | `HealthChecker` class |
| Mode detection | `src/modes-registry.mjs` | `detectProfile()`, `profileMultiplier()` |
| Provider quota | `src/provider-quota.mjs` | `ProviderQuota` class |
| Notifier | `src/notifier.mjs` | `Notifier` class |