# Ask Mode - OmniRoute Bandit Proxy AGENTS.md

## Ask Mode Specific Instructions

When asking questions about this codebase, focus on **non-obvious, project-specific behaviors** that aren't documented elsewhere. The root AGENTS.md and mode-specific files contain the distilled knowledge.

### Key Non-Obvious Behaviors to Ask About

#### Bandit Algorithm (`src/bandit.mjs`)
- **Discount application**: `discountFactor=0.99` is applied *per feedback event*, not per timestep. This means reward history decays faster under load.
- **Rank cache TTL**: `_rankCache` is 30 seconds - model rankings are stale up to 30s after feedback.
- **Soft bias**: `profileMultiplier()` multiplies the *UCB1 score*, not the reward. Multipliers stack (e.g., a model matching both `isCode` and `isFast` gets product of both).
- **Training isolation**: `models_train` table is completely separate. Daemon writes there. Production `selectModel()` reads `models` + blends `models_train × 0.3` as prior *only when production N < 1*.
- **Fallback bypasses bandit**: When all ranked models fail, the 6-model fallback chain from `config/bandit.json` is used without any UCB1 scoring.

#### Error Classification (`_classifyError` in `src/bandit.mjs:100-300`)
Five distinct actions with different scopes:
| Action | Scope | Typical Triggers |
|--------|-------|------------------|
| `ban-provider` | provider | 401/403 auth, 404 deleted, 418 teapot, 429 org-quota, 5xx repeated |
| `ban-model` | model | 400 context-length, 404 model-not-found, 410 gone |
| `cooldown-provider` | provider | 429 rate-limit (respects `retry-after`), 5xx transient |
| `cooldown-model` | model | 429 model-specific, 503 overloaded |
| `flag-provider` | provider | 400 validation (non-context), 408 timeout, 422 unprocessable, 502/504 gateway |

**Key details**: Parses `retry-after` header (seconds or HTTP-date). `quota_exhausted` reason → permanent ban. `consecutive_5xx` counter on models table → degraded mode after 3.

#### Provider Quota (`src/provider-quota.mjs`)
- Rolling minute + day windows per provider (not per model)
- Limits in `config/provider-limits.json` (RPM/RPD)
- `canCall(provider)` checks both windows atomically
- `recordQuotaExhausted()` → triggers provider ban with `quota_exhausted` reason

#### Session Affinity (`src/index.mjs`)
- Key = MD5(systemPrompt + firstUserMessage)
- TTL = **30 minutes** (`SESSION_TTL_MS` default 1800000), not 24h
- Max 10k entries with LRU eviction
- Invalidated on model failure (non-2xx or validation fail)

#### Streaming Timeouts (Three Levels)
1. `UPSTREAM_TIMEOUT_MS` (20s): Connection + first byte
2. `STREAM_IDLE_MS` (60s): Content-based idle - **resets on ANY chunk** (including SSE comments/heartbeats)
3. `STREAM_MAX_MS` (180s): Hard cap (60s for summarizer profile)

#### Retry Loop
- `maxAttempts = Math.min(providerCount * 4 + 100, 500)`
- Per-request `excludedModels` Set tracks failed (model, provider) pairs
- Falls through to fallback chain after exhaustion
- Skips models where `estimateTokens() > max_input_tokens`

#### Context Compression
- Triggers at >80% of model's `max_input_tokens`
- Strategies: sliding window (keep system + last N), message truncation (largest first), drop tools
- Always preserves system prompt + last user message

#### Health Checker
- Runs every 5 min (configurable)
- Candidates: `permanent=1` OR `cooldown_until > 1 hour` OR `degraded=1`
- Batch size 20, 15s timeout per probe
- Probe: minimal `"ok"` with `max_tokens: 1`
- Revives via `bandit.reviveModel()`

#### Mode Detection (`src/modes-registry.mjs`)
- 3-tier: 1) MD5 signature cache (`modes.signatures.json`) → 2) Regex from `config/modes.json` (14 Zoo Code modes) → 3) Unknown → auto-discovered, persisted to `modes.discovered.json`
- Returns: `summarizer`, `code`, `reasoning`, `general`

### Common Non-Obvious Pitfalls

1. **Provider attention flags persist**: Must call `POST /v1/provider/retry/:p` or `clearProviderAttention()` to clear `needs_attention` - health checks don't auto-clear
2. **Migrations are additive only**: `_migrateDB()` only ADD COLUMN, never DROP/ALTER TYPE
3. **Session TTL is 30 min, not 24h**: `SESSION_TTL_MS` default 1800000
4. **Token estimation is approximate**: `estimateTokens()` uses 4 chars/token heuristic
5. **Fallback models bypass bandit**: Fallback chain used without UCB1 scoring
6. **Training mode isolates writes**: Daemon writes to `models_train`; production blends `models_train × 0.3` as prior only when `N < 1`
7. **Quota limits are per-provider, not per-model**
8. **Soft bias multipliers stack**: Multiple pattern matches = product of multipliers
9. **Stream idle timeout resets on ANY chunk**: SSE comments/heartbeats reset 60s timer
10. **Ring buffer deduplication**: Consecutive identical lines collapsed with count suffix

### Testing Patterns
- Tests use `node:test` framework
- Database is in-memory (`:memory:`) for tests
- Helper functions: `makeBandit()`, `seedCatalog()`
- Coverage: error classification, model selection, provider management

### Configuration
- All env vars in `.env.example`
- Critical: `OMNIROUTE_API_KEY`, `OMNIROUTE_BASE_URL`, `DASHBOARD_TOKEN`, `EXCLUDE_PAID`, `ONLY_FREE`, `EXCLUDE_THINKING`, `EXPLOIT_ONLY`
- Database path via `DATABASE_PATH`

### Debugging Tips
- Check `training.log` for training events
- Console logs are structured (already present in production)
- Database contains all interaction logs (`request_logs` table)
- Health check endpoint: `/v1/health-check/status`
- Ring buffer: `/v1/logs` (200 entries)