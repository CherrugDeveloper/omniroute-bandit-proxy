# Architect Mode - OmniRoute Bandit Proxy AGENTS.md

## System Architecture Overview

The OmniRoute Bandit Proxy is a Multi-Armed Bandit reverse proxy router for dynamic LLM traffic distribution. It intelligently routes requests to different LLM providers based on performance metrics and feedback using Discounted UCB1.

## Core Components - Non-Obvious Details

### 1. Bandit Algorithm (`src/bandit.mjs`)
- **DiscountedUCB1Bandit** class: `discountFactor=0.99` applied per feedback event (not per timestep)
- **Rank Cache**: `_rankCache` with 30s TTL stores precomputed rankings to avoid recalculation on every request
- **Catalog vs Database Merge**: `selectModel()` prefers database models over catalog when same provider+id conflict; DB models carry learned `N`, `sum_reward`, `fails`, `cooldown_until`, `permanent`, `degraded`, `consecutive_5xx`
- **Soft Bias via Modes**: `profileMultiplier(profile, modelName)` from `modes-registry.mjs` applies runtime multipliers based on regex detection: `isCode`, `isThinking`, `isFast`, `isBig`, `isSmall`, `isFIM`, `isLowTPM` - multiplies UCB1 score, not reward
- **Training Isolation**: Separate `models_train` table; daemon writes there; `selectModel()` uses `models_train × 0.3` as prior when production `N < 1`
- **Fallback Chain**: 6-model chain in `config/bandit.json` used when no models available after filtering; returns first passing token limit check

### 2. Main Server (`src/index.mjs`)
- **Express.js** on 127.0.0.1:8080 with ES modules
- **Retry Loop**: `maxAttempts = Math.min(providerCount * 4 + 100, 500)`; per-request `excludedModels` Set tracks failed (model, provider) pairs; falls through to fallbackModels
- **Session Affinity**: Key = MD5(systemPrompt + firstUserMessage); `sessionModelMap` with 30-min TTL (not 24h); invalidated on model failure; max 10k entries with LRU eviction
- **Three-Level Streaming Timeouts**: `UPSTREAM_TIMEOUT_MS`=20s (connection+first byte), `STREAM_IDLE_MS`=60s (content-based idle, resets on ANY chunk), `STREAM_MAX_MS`=180s (60s for summarizer profile)
- **Context Compression**: Auto-triggers at >80% of `max_input_tokens`; strategies: sliding window, message truncation (largest first), drop tools; preserves system prompt + last user message
- **Ring Buffer**: 200 log entries with deduplication (consecutive identical lines collapsed with count suffix)

### 3. Health Checker (`src/health-check.mjs`)
- **Interval**: Default 5 min (configurable via `HEALTH_CHECK_INTERVAL_MS`)
- **Candidates**: `permanent=1` OR `cooldown_until > 1 hour` OR `degraded=1`
- **Batch Size**: 20 models, 15s timeout per probe
- **Probe Request**: Minimal `"ok"` message with `max_tokens: 1`
- **Revival**: Via `bandit.reviveModel()`

### 4. Mode Detection (`src/modes-registry.mjs`)
- **3-Tier Detection**: 1) MD5 signature cache (`modes.signatures.json`) → 2) Regex patterns from `config/modes.json` (14 Zoo Code modes) → 3) Unknown → auto-discovered, persisted to `modes.discovered.json`
- **Profiles**: Returns `summarizer`, `code`, `reasoning`, `general`
- **Soft Bias**: Regex patterns for `isCode`, `isThinking`, `isFast`, `isBig`, `isSmall`, `isFIM`, `isLowTPM` stack multiplicatively

### 5. Provider Quota (`src/provider-quota.mjs`)
- **Rolling Windows**: Minute + day per provider
- **Limits**: From `config/provider-limits.json` (RPM/RPD per provider)
- **Exhaustion**: `recordQuotaExhausted()` → provider ban with `quota_exhausted` reason

### 6. Notifier (`src/notifier.mjs`)
- **Webhooks**: Slack, Discord, Telegram, generic
- **Throttling**: Same `event+subject` max 1 per 5 min (configurable)
- **Emoji Mapping**: Per event type

## Data Flow - Critical Non-Obvious Patterns

1. **Request** → `POST /v1/chat/completions`
2. **Model Selection** → `bandit.selectModel()` with session affinity + soft bias multipliers
3. **Token Check** → `estimateTokens()` (4 chars/token heuristic) vs `max_input_tokens`
4. **Upstream Request** → Forward to provider with 3-level timeout handling
5. **Validation** → `validateNonStreamResponse()` / `validateStreamAccumulated()`
6. **Feedback** → `bandit.recordFeedback()` with reward (1=success, 0=fail)
7. **Error Classification** → `_classifyError()` determines: ban-provider, ban-model, cooldown-provider, cooldown-model, flag-provider
8. **Provider Management** → Updates `provider_history` and `models` tables

## Database Schema - 6 Tables (Auto-Migrated in `_migrateDB`)

| Table | Key Columns |
|-------|-------------|
| `models` | id, provider, N, sum_reward, fails, cooldown_until, permanent, last_used_index, consecutive_5xx, degraded, degraded_since, is_paid |
| `models_train` | id, provider, N, sum_reward, last_used_index |
| `provider_history` | provider, fails, cooldown_until, pointer, permanent, needs_attention, attention_reason, attention_message |
| `catalog` | id, provider, max_input_tokens, is_free, supports_tools |
| `meta` | key, value (counters: total_requests, total_errors, etc.) |
| `request_logs` | timestamp, model, provider, status, latency_ms, tokens_in, tokens_out, error_type |

## Configuration - Critical Environment Variables

Critical: `OMNIROUTE_API_KEY`, `OMNIROUTE_BASE_URL`, `DASHBOARD_TOKEN` (for `/v1/metrics`, `/v1/scripts/*`), `EXCLUDE_PAID`, `ONLY_FREE`, `EXCLUDE_THINKING`, `EXPLOIT_ONLY`, `HEALTH_CHECK_INTERVAL_MS`, `SESSION_TTL_MS` (default 1800000 = **30min**), `UPSTREAM_TIMEOUT_MS` (20000), `STREAM_IDLE_MS` (60000), `STREAM_MAX_MS` (180000).

## API Endpoints

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

## Common Pitfalls (Non-Obvious)

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

## Performance Considerations

- 30-second rank cache (`_rankCache`)
- Health checks every 5 min (batch 20)
- Session cleanup every 5 min
- Single SQLite connection (better-sqlite3)
- Proper indexing on frequently queried columns

## Scalability Constraints

- **Single instance design**: SQLite file-based, in-memory session state
- **Horizontal scaling**: Would require shared database + Redis for sessions
- **Connection pooling**: Not applicable (single SQLite connection)