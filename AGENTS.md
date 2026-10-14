# OmniRoute Bandit Proxy - AGENTS.md

## Overview
Multi-Armed Bandit reverse proxy router for dynamic LLM traffic distribution. Routes requests to different LLM providers based on performance metrics and feedback using Discounted UCB1.

## Build/Lint/Test Commands

### Build
- `npm start` - Start the proxy server on 127.0.0.1:8080
- `npm run dev` - Start with file watching (`--watch`)
- `npm run check` - Validate TypeScript and JavaScript syntax (`node --check`)

### Testing
- `npm test` - Run all tests via `node --test tests/*.test.mjs`
- `node --test tests/bandit.test.mjs` - Run single test file

## Critical Non-Obvious Patterns

### Bandit Algorithm (`src/bandit.mjs`)
- **Discounted UCB1**: Uses `discountFactor=0.99` applied per feedback event, not per timestep. The `_rankCache` (30s TTL) stores precomputed rankings to avoid recalculation on every request.
- **Catalog vs Database merge**: `selectModel()` prefers database models over catalog when conflicts exist (same provider+id). Database models carry learned `N`, `sum_reward`, `fails`, `cooldown_until`, `permanent`, `degraded`, `consecutive_5xx`.
- **Soft bias via modes**: `profileMultiplier(profile, modelName)` from `modes-registry.mjs` applies runtime multipliers based on regex detection: `isCode`, `isThinking`, `isFast`, `isBig`, `isSmall`, `isFIM`, `isLowTPM`. These multiply the UCB1 score, not the reward.
- **Training isolation**: Separate `models_train` table. Daemon writes there. `selectModel()` uses `models_train` × 0.3 as prior when production `N < 1`. See `train-daemon.mjs`.
- **Fallback chain**: 6-model chain in `config/bandit.json` used when no models available after filtering. Returns first that passes token limit check.

### Error Classification (`_classifyError` in `src/bandit.mjs:100-300`)
Five actions with scope (provider/model) and reason:
| Action | Typical Triggers |
|--------|------------------|
| `ban-provider` | 401/403 auth, 404 deleted, 418 teapot, 429 org-quota, 5xx repeated |
| `ban-model` | 400 context-length, 404 model-not-found, 410 gone |
| `cooldown-provider` | 429 rate-limit (respects `retry-after`), 5xx transient |
| `cooldown-model` | 429 model-specific, 503 overloaded |
| `flag-provider` | 400 validation (non-context), 408 timeout, 422 unprocessable, 502/504 gateway |

Key: parses `retry-after` header (seconds or HTTP-date). `quota_exhausted` reason triggers permanent ban. `consecutive_5xx` counter on models table triggers degraded mode after 3.

### Provider Quota Tracking (`src/provider-quota.mjs`)
Rolling minute/day windows per provider. Limits in `config/provider-limits.json` (RPM/RPD). `canCall(provider)` checks both windows. Quota exhaustion recorded via `recordQuotaExhausted()` → triggers provider ban with reason `quota_exhausted`.

### Session Affinity (`src/index.mjs`)
Key = MD5(systemPrompt + firstUserMessage). Stored in `sessionModelMap` with 30-min TTL (not 24h - that's for cleanup). Invalidated on model failure (non-2xx or validation fail). Max 10k entries with LRU eviction.

### Three-Level Streaming Timeouts
1. `UPSTREAM_TIMEOUT_MS` (20s): Connection + first byte
2. `STREAM_IDLE_MS` (60s): Content-based idle timeout (resets on each chunk)
3. `STREAM_MAX_MS` (180s): Hard cap per request (60s for summarizer profile)

### Retry Loop (`src/index.mjs:800-1100`)
`maxAttempts = Math.min(providerCount * 4 + 100, 500)`. Per-request `excludedModels` Set tracks failed (model, provider) pairs. Falls through to `fallbackModels` chain after exhaustion. Skips models exceeding `max_input_tokens` (estimated via `estimateTokens()`).

### Context Compression (`compressBody`, `truncateBiggestMessage`)
Auto-triggers when estimated tokens > 80% of model's `max_input_tokens`. Strategies: sliding window (keep system + last N), message truncation (largest first), drop tools. Preserves system prompt and last user message.

### Health Checker (`src/health-check.mjs`)
Runs every 5 min (configurable). Candidates: `permanent=1` OR `cooldown_until > 1 hour` OR `degraded=1`. Batch size 20, 15s timeout per probe. Probe request: `"ok"` with `max_tokens: 1`. Revives via `bandit.reviveModel()`.

### Mode Detection (`src/modes-registry.mjs`)
3-tier: 1) MD5 signature cache (`modes.signatures.json`) → 2) Regex patterns from `config/modes.json` (14 Zoo Code modes) → 3) Unknown → auto-discovered, persisted to `modes.discovered.json`. `detectProfile()` returns one of: `summarizer`, `code`, `reasoning`, `general`.

### Notifier (`src/notifier.mjs`)
Webhooks: Slack, Discord, Telegram, generic. Throttling: same `event+subject` max 1 per 5 min (configurable). Emoji mapping per event type.

### Database Schema (6 tables, auto-migrated in `_migrateDB`)
| Table | Key Columns |
|-------|-------------|
| `models` | id, provider, N, sum_reward, fails, cooldown_until, permanent, last_used_index, consecutive_5xx, degraded, degraded_since, is_paid |
| `models_train` | id, provider, N, sum_reward, last_used_index |
| `provider_history` | provider, fails, cooldown_until, pointer, permanent, needs_attention, attention_reason, attention_message |
| `catalog` | id, provider, max_input_tokens, is_free, supports_tools |
| `meta` | key, value (counters: total_requests, total_errors, etc.) |
| `request_logs` | timestamp, model, provider, status, latency_ms, tokens_in, tokens_out, error_type |

### Environment Variables (see `.env.example`)
Critical: `OMNIROUTE_API_KEY`, `OMNIROUTE_BASE_URL`, `DASHBOARD_TOKEN` (for `/v1/metrics`, `/v1/scripts/*`), `EXCLUDE_PAID`, `ONLY_FREE`, `EXCLUDE_THINKING`, `EXPLOIT_ONLY`, `HEALTH_CHECK_INTERVAL_MS`, `SESSION_TTL_MS` (default 1800000 = 30min), `UPSTREAM_TIMEOUT_MS` (20000), `STREAM_IDLE_MS` (60000), `STREAM_MAX_MS` (180000).

### API Endpoints
- `POST /v1/chat/completions` - Main proxy
- `GET /v1/metrics` - Auth required (x-api-token header or ?token=)
- `POST /v1/reset/provider/:provider` - Clear provider bans/cooldowns
- `POST /v1/provider/retry/:provider` - Clear `needs_attention` flag
- `GET /v1/models` - All models with status
- `GET /v1/providers` - Provider status
- `GET /v1/sessions` - Active sessions
- `GET /v1/health-check/status` - Health checker status
- `GET /v1/logs` - Ring buffer (200 entries)
- `GET /v1/inflight` - In-flight requests
- `GET /v1/active` - Active request count
- `GET /v1/scripts/*` - Script manager (list/run/status/kill/logs)
- `GET /v1/quota` - Provider quota snapshot

### Monitoring
- Dashboard: `http://127.0.0.1:8080` (single-file `public/dashboard.html` with 6 tabs)
- Health checks every 5 min, metrics via `/v1/metrics`
- Logs: console (structured), `training.log` (daemon), SQLite `request_logs`
- Ring buffer: 200 log entries with deduplication

### Systemd Service
Production deployment via `omniroute-bandit-proxy.service` (reads `.env`). See `scripts/switch-mode.sh` for mode transitions (prod/train-gentle/train/stop).

### Common Pitfalls (Non-Obvious)
1. **Provider attention flags persist**: Must call `POST /v1/provider/retry/:p` or `clearProviderAttention()` to clear `needs_attention` - health checks don't auto-clear.
2. **Migrations are additive only**: `_migrateDB()` only ADD COLUMN, never DROP/ALTER TYPE. New columns added per release.
3. **Session TTL is 30 min, not 24h**: `SESSION_TTL_MS` default 1800000. The 24h in old docs is stale.
4. **Token estimation is approximate**: `estimateTokens()` uses 4 chars/token heuristic. For precise limits, rely on upstream 413 errors.
5. **Fallback models bypass bandit**: When all ranked models fail, fallback chain from config is used without UCB1 scoring.
6. **Training mode isolates writes**: Daemon writes to `models_train`. Production reads from `models` + blends `models_train × 0.3` as prior only when `N < 1`.
7. **Quota limits are per-provider, not per-model**: `config/provider-limits.json` defines RPM/RPD at provider level.
8. **Soft bias multipliers stack**: A model matching multiple patterns (e.g., `isCode` + `isFast`) gets product of multipliers.
9. **Stream idle timeout resets on ANY chunk**: Not just content chunks - SSE comments/heartbeats also reset the 60s timer.
10. **Ring buffer deduplication**: Consecutive identical log lines are collapsed with count suffix.