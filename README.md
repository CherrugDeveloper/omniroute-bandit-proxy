# OmniRoute Bandit Proxy

A high-performance, multi-armed bandit (MAB) reverse proxy for LLM traffic. This system optimizes model selection by balancing exploration (discovering better models) and exploitation (using the best-performing model) using the Discounted UCB1 algorithm.

## 🚀 Features

- **Discounted UCB1 Algorithm**: Dynamically ranks models based on success rates, with a discount factor to prioritize recent performance.
- **Dynamic Model Selection**: Automatically routes requests to the best available model while occasionally exploring others.
- **Automated Punishment System**:
  - **Exponential Backoff**: Models that fail are put on cooldown with increasing durations.
  - **5-Strike Rule**: 5 consecutive critical failures (403/429) lead to a permanent ban.
  - **Group Punishment**: Threshold-based punishment across free/paid model pools (below threshold punishes only the failing model, above threshold punishes the entire pool) with exponential backoff cooldowns.
  - **Cascade Guards**: Prevents simultaneous banning of entire provider groups; skips ALL punishment when a provider is already on cooldown/circuit/auth-expired or when rejection is due to capability mismatches (non-chat models, no tools support, token limits exceeded, thinking excluded, dynamic max tokens exceeded) to avoid cascade effects.
  - **Model-Not-Found Classification**: 400 errors indicating a model is not found in the active live catalog (including "invalid model", "does not exist", "no longer available") are classified as `ban-model` (PERMANENT) instead of `cooldown-model` (TRANSIENT), preventing repeated attempts on unavailable models.
- **Real-time Dashboard**: PWA-enabled interface for monitoring metrics, logs, provider health, and bandit rankings.
- **Comprehensive Data Export**: New "📋 Copia Tutti" button in the Unified History panel allows exporting all dashboard data (metrics, models, providers, logs, training status, and unified history) in structured TSV format for analysis and reporting.
- **Quick Action Reset**: "🗑️ Reset All Stats & Logs" button in the Quick Actions bar for resetting all counters, punishment events, and request history.
- **Toast Feedback**: All reset buttons execute immediately with centered toast notifications providing feedback (no confirmation dialogs).

### v0.53.23 - 2026-11-24
- **Added**: "🗑️ Reset All Stats & Logs" quick action button in Quick Actions bar
- **Changed**: `refresh_dashboard()` in restart-safe.sh now opens dashboard in PWA mode
- **Changed**: All reset buttons now execute immediately with centered toast feedback (no confirmation dialogs)

### v0.53.23-patch - 2026-11-25
- **Fixed**: Reset operations now fully sync catalog from OmniRoute after clearing provider_history, preventing "already_tried" model rejection after restart/reset

### v0.53.22 Definitive Restart & Refresh
- **Definitive F5 Refresh**: Improved `reloadAfterRestart()` with retry logic (3 attempts with increasing delays) and better health check handling to ensure the dashboard is definitively reloaded with F5 after service restart
- **Enhanced Script Refresh**: `refresh_dashboard()` in restart-safe.sh now retries up to 3 times with 2s delays, better window detection, and fallback to specific browsers (google-chrome, chromium, firefox) when wmctrl/xdg-open unavailable

### v0.53.21 Group Punishment & Free Model Recognition
- **Group Punishment**: Added threshold-based group-level punishment for free/paid model pools. When a model fails below the configured threshold (free: 5, paid: 3), only the individual model is punished. When failures exceed the threshold, the entire free or paid pool is punished with exponential backoff cooldowns (cooldown multiplier: 2.0, escalation step: 24h).
- **Group Cooldowns**: New database columns (`group_free_failures`, `group_paid_failures`, `group_free_cooldown_until`, `group_paid_cooldown_until`) track group-level punishment state; new methods `_getGroupCooldownMs()`, `_getGroupFreeCooldownMs()`, `_getGroupPaidCooldownMs()` compute escalating cooldowns.
- **Free Model Recognition**: Enhanced `isFreeModel()` with multiple naming patterns (`:free`, `-free`, `free-`, `free:`, `gratis`, `no-cost`, `trial`, `community`, `lite`, `basic`, `starter`, `hobby`, `dev`, `sandbox`, `test`, `demo`, `preview`, `beta`, `alpha`, `experimental`, `open`, `public`, `unlimited`) and provider-specific indicators (OpenRouter `is_free` flag, provider free tiers).
- **Improved Continuity**: Adjusted punishment thresholds (`consecutiveCriticalFailuresForBan: 5`, `circuitBreakerThreshold: 3`, `circuitBreakerCooldownMs: 120000`, `maxTotalFailuresBeforePermanentBan: 10`) to ensure smooth operation with 1000+ models and ~20 providers while maintaining coding agent continuity.

### v0.53.20 Bug Fixes & Improvements
- **Fixed `_sanitizeModelId()`**: Now returns null when model ID not found in catalog, preventing "model='b'" errors in logs and queries.
- **Fixed variable reference bug**: Removed premature `model` usage before assignment in timeout calculation (line 2157).
- **Exponential backoff for rate limit 413**: Added tracking columns `tpm_exceeded_count` and `tpm_last_exceeded` to database; cooldown increases progressively (30s → 1min → 2min → 4min → 8min → 16min → 32min → 64min → 128min → 256min).
- **Cache invalidation**: Added `invalidateRankCache()` method to clear rank cache when model state changes.
- **403 error classification**: Added specific pattern for "access denied", "permission denied", "forbidden", "insufficient permissions", "not authorized" with 60s cooldown.
- **Dynamic timeout**: Timeout now uses `UPSTREAM_TIMEOUT_MS` environment variable as base value instead of hardcoded 60000ms.
- **Enhanced fallback scoring**: `scoreFallbackModel()` now includes provider health metrics (fails, cooldown, needs_attention) in scoring calculation.

### v0.53.19 Top Model Reset API
- **Top Model Reset endpoint**: New `POST /v1/reset/top-model` endpoint allows resetting the top model (model with the highest average reward). Added `getTopModelId()` method that returns the model with highest `sum_reward / N` ratio (with `N >= 1`) among available models, and `resetTopModel()` method that resets the top model's statistics and clears provider attention flags.

### v0.53.17 Training Daemon & Debug Enhancements
- **Timeout tracking with exponential backoff**: Added `timeoutTrackingByProvider` and `retryAttemptsByProvider` objects for provider-level timeout monitoring. The `getProviderBackoffMs()` function implements exponential backoff (30s → 2min → 5min → 15min → 30min → 1hr → 2hr → 6hr → 12hr → permanent).
- **Abort/timeout logging**: New `logAbortInfo()` function provides structured logging for abort/timeout events in the training daemon.
- **Training daemon improvements**: Enhanced `testModel()` with timeout counter reset on success and better handling of timeout vs manual abort scenarios.
- **Model prefetch initialization**: Added `initializePrefetch()` import from `model-prefetch.mjs` for improved model loading.
- **Debug API endpoints**: New endpoints added: `/v1/debug/reset-model/:id`, `/v1/debug/reset-history`, `/v1/debug/providers` (with filters), `/v1/debug/models` (with filters).
- **Detailed log level**: Added new `detailed` log level (level 50) for detailed punishment/debug logging.
- **Request tracker timeout cleanup**: Added `MAX_TIMEOUT_MS = 60000` and improved `pushRecent()` to remove expired entries from the ring buffer.
- **Recent requests buffer**: Reduced `MAX_RECENT_REQUESTS` from 100 to 50.

### v0.53.16 Database Schema Alignment
- **Schema initialization fix**: Extended `_initDB()` schema to include all columns required by the test suite, ensuring test independence from migration scripts. Added 14 new columns to `provider_history` table (circuit_breaker_until, cooldown_until, needs_attention, attention_reason, attention_message, consecutive_failures, last_success_time, rpm_limit, rpd_limit, calls_last_minute, calls_minute_started, calls_today, calls_today_date, quota_resets_at) and 1 column to `models` table (dynamic_max_tokens).
- **Syntax fix in `_migrateDB()`**: Resolved missing closing brace `}` for `if (!hasConsecutiveCriticalFailures)` block and removed duplicate code that was causing potential runtime errors.

### v0.53.15 Dashboard Data Export
- **Error Classification**: Distinguishes between transient (retryable) and permanent errors via configurable patterns.
- **Training Mode**: Supports isolated training datasets to refine model rankings before production use.

## 🛠 Architecture

The proxy sits between the client and multiple LLM providers. It manages a local SQLite database to track model failures, success rates, and cooldowns.

- **Bandit Core**: Implements the UCB1 logic and manages the state of the `models` table.
- **Punishment Engine**: Monitors response status codes and applies cooldowns/bans.
- **Proxy Layer**: Handles HTTP requests, token estimation, and provider-specific API calls.
- **Event System**: Streams real-time punishment and status events to the dashboard via WebSockets.

### v0.53.14 Logging & Training Tuning
- **Cooldown comment fix**: Corrected `_getModelCooldownMs` comment to match the actual cooldown array (30s → 2min → 5min → 15min → 30min → 1hr → 2hr → 6hr → 12hr → permanent at 10+ failures).
- **Degradation threshold**: Increased `degradationThreshold` from 3 to 5 in `config/bandit.json` to prevent premature degradation on transient 5xx errors.
- **Training daemon env vars**: Added `TRAIN_MAX_TIMEOUT_SKIP` (default: 3) and `TRAIN_MAX_FAIL_SKIP` (default: 5) to configure provider skip thresholds during training cycles.
- **Log level control**: Added `LOG_LEVEL` env var (alias of `STRUCTURED_LOG_LEVEL`) accepting `debug|info|warn|error` to control the minimum log level emitted by the structured logger.

### v0.53.13 Unified History Reset & Config State Fix
- **Config state cascade fix**: Generic 502/503/504 errors are now classified as `cooldown-model` with `upstream-error` reason (TRANSIENT) instead of `provider-misconfigured` (PERMANENT). This prevents the cascade where all models of a provider were incorrectly pushed into "config" state.
- **Cooldown-model punishment refinement**: Regular cooldowns no longer set `needs_attention = 1` on provider_history. Config state is now only triggered by genuine user-intervention errors (auth-expired, anti-abuse, safeWrite-init-error).
- **Unified history reset**: New `resetUnifiedHistory()` method and `POST /v1/reset/history` endpoint to clear stuck punishment events and old request logs. Dashboard now has a "🗑️ Reset" button in the Unified History panel.
- **Log denylist fix**: Removed `PROXY` from default log denylist so real proxy access logs reach the dashboard Logs tab. Added runtime override via `LOG_BUFFER_DENYLIST` env var.
- **Dashboard responsiveness**: Increased polling intervals (main loop 1s→2s, fetchLogs/fetchActive/fetchConsideration 5s→10s) and added `requestIdleCallback` for DOM updates to keep UI responsive during polling.
- **Activity buffer**: Increased `recentRequests` RingBuffer from 5 to 50 entries for better activity visibility when idle.

### v0.53.12-0.53.11 Client Disconnect Handling
- **HTTP 499 status code**: Added proper handling for client disconnect during request processing. When a client disconnects (status 499), the proxy now returns a structured error response instead of crashing or leaving the request hanging.

### v0.53.10 Cascade Ban Prevention & Timeout Increase
- **5-strike paid-group-ban isolation**: The 5-strike rule for paid models now sets only `needs_attention = 1` on `provider_history` (not `permanent = 1`), isolating the ban to the individual model and preventing cascade bans across the entire provider group.
- **Permanent ban escalation isolation**: When a model escalates to permanent ban via `totalFailures`, the provider is now flagged with `needs_attention = 1` only (not `permanent = 1`), preventing provider-wide cascade bans.
- **Model-not-found classification refinement**: Removed `"not found"` from the model-not-found pattern — a 404 status alone no longer triggers a permanent ban; such errors fall through to transient classifications (cooldown-model).
- **403 key-limit-exceeded pattern fix**: Removed `"403|"` from the permanent error pattern for key-limit-exceeded — a bare 403 status is no longer a trigger for permanent `ban-provider`; the pattern now requires specific phrases (lifetime limit, total limit, never resets, etc.).
- **Upstream timeout increase**: Default `UPSTREAM_TIMEOUT_MS` increased from 20,000ms to 60,000ms to accommodate slower models (e.g., `qwen3-coder-next`).
- **Restart script `--no-refresh` flag**: New `--no-refresh` / `-n` option for `restart-safe.sh` to skip the automatic dashboard refresh.
- **Improved dashboard refresh**: `restart-safe.sh` now uses `wmctrl`/`xdotool`/`xdg-open` for a true browser refresh (F5 key press) instead of a simple `curl` call.

## 📊 API Endpoints

- `POST /v1/chat/completions`: The main proxy endpoint.
- `GET /v1/stats`: Returns aggregated bandit metrics.
- `GET /v1/models`: Returns current model rankings and status.
- `GET /v1/logs`: Retrieves proxy activity logs.

## 🧪 Testing

The project includes a comprehensive test suite covering the bandit logic and punishment system.

```bash
npm test
```

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

## 🚀 Quick Start

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure your environment:
   ```bash
   cp .env.example .env
   # Edit .env with your provider keys
   ```
4. Start the service:
   ```bash
   npm start