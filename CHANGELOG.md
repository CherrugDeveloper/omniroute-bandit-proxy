## [v1.14.0] - 2026-11-03

### Chore
- **Repository Maintenance**: Executed cleanup of temporary artifacts and untracked files identified in the repository root.
- **Workflow Automation**: Ran `auto-git` workflow, validating workspace integrity via `npm run check`.
- **Documentation & Versioning**: Performed date-based semantic version increment to `v1.14.0` (patch/minor reset) based on `2026-11-03` date. Updated `CHANGELOG.md` to ensure structural consistency and chronological ordering.

## [v1.13.13] - 2026-11-02

### Fix
- **Bandit**: Re-evaluated error classification and punishment system for better reliability
  - Reduced 402 billing error cooldown from 24h to 1h in `_classifyError()` to allow faster credit recovery
  - Reduced 403 non-resetting quota cooldown from 24h to 2h for transient key limits
  - Reduced 418 anti-abuse cooldown from 6h to 1h to prevent prolonged provider outages
  - Changed 502 misconfiguration/environment errors from `ban-provider` to `cooldown-provider` (30m) enabling auto-recovery
  - All changes in [src/bandit.mjs](src/bandit.mjs:1111-1343)

### Perf
- **ProviderQuota**: Added 5-second TTL in-memory caching to `canCall()` eliminating redundant DB queries
  - Cache key includes provider+group for per-group quota isolation
  - New `_quotaCache` Map with 5s TTL in [src/provider-quota.mjs](src/provider-quota.mjs:1)

- **Bandit**: Optimized `isModelAvailable()` to use single LEFT JOIN query instead of two separate queries
  - Fetches both model and catalog data in one DB round-trip in [src/bandit.mjs](src/bandit.mjs:2052-2125)

## [v1.13.12] - 2026-11-02

### Fix
- **Dashboard**: Updated log row color mapping for source types
  - Renamed `source-train` to `source-training` in CSS
  - Changed debug color from `#ff5858` to `#00bcd4`
  - Changed cooldown color from `#f1c40f` to `#ff9800`
  - Changed flag color from `#e6ac00` to `#ffeb3b`
  - Changed degraded color from `#e74c3c` to `#9c27b0`
  - Changed proxy color from `#f0883e` to `#ffffff`

### Fix
- **Bandit**: Emergency relaxation filter now correctly ignores `dynamic_max_tokens` instead of `tokenLimit`
  - Fixed `ignoreTokenLimit` → `ignoreDynamicMaxTokens` in emergency fallback to properly bypass runtime-discovered TPM limits

## [v1.13.11] - 2026-11-02

### Chore
- Auto-git workflow execution and documentation updates
- Updated CHANGELOG.md and README.md to reflect v1.13.11
- Repository cleanup and workspace validation

## [v1.13.10] - 2026-11-02

- **Chore**: Auto-git workflow execution.

## [v1.13.9] - 2026-11-02

- **Chore**: Automated version bump.

## [v1.13.8] - 2026-11-02

- **Feat**: Merged Training Status metrics into Top model card, removed standalone panel.

## [v1.13.7] - 2026-11-01

- **Chore**: Auto-git workflow execution with repository cleanup and documentation updates.

## [v1.13.6] - 2026-11-01

- **Chore**: Repo cleanup and checks passed.

## [v1.13.5] - 2026-11-01

- **Chore**: Automated version bump and documentation update for date 2026-11-01.

## [v1.13.4] - 2026-11-01

- **Documentation**: Standardized `CHANGELOG.md` format, reordered entries, and added consistent file:line references.

## [v1.13.3] - 2026-11-01

- **Chore**: Automated version bump for date 2026-11-01.

## [v1.13.2] - 2026-11-01

- **Fix**: Enhanced restart-safe.sh with sudo and facial recognition support.

  - Added NEED_SUDO detection for non-root users.
  - All systemctl/journalctl commands now use sudo when needed.
  - System PAM already configured with pam_exec.so quiet /usr/local/bin/face-auth for biometric authentication (facial recognition / fingerprint).
  - Verified scripts/restart.sh is obsolete (documented in docs/restart-procedure.md).
  - Syntax verified with bash -n.

## [v1.13.1] - 2026-11-01

- **Feature**: Changelog documentation update for version 1.0.0.

- **Feature**: Bandit logic updates per recent commits.

- **Feature**: Update bandit logic in src and docs.

## [v1.12.1] - 2026-10-31

- **Fix**: Investigation and resolution of bandit proxy issue (pending).

- **Chore**: Automated update.

- **Chore**: Update [public/dashboard.html](public/dashboard.html:1).

## [v1.11.4] - 2026-10-30

- **Feature**: Implemented IT per-minute (ITPM) quota awareness in Bandit for smarter model routing.
  - Bandit now queries `provider_quota.getQuotaStatus()` to check ITPM availability before selecting models.
  - Models with exhausted ITPM quotas are automatically deprioritized during `selectModel()`.
  - New `itpm` module tracks per-provider/minute token limits dynamically.
  - Added `ITPM_QUOTA_ENABLED` env flag to toggle feature.

- **Feature**: Added provider-level quota management with rolling windows.
  - New `ProviderQuota` class with minute/day rolling windows for RPM/RPD limits.
  - Integrated quota checks into request flow: `bandit.selectModel()` now filters by available quota.
  - Quota exhaustion triggers provider ban with `quota_exhausted` reason.
  - Configuration via `config/provider-limits.json` with per-provider RPM/RPD limits.
  - Added `notifier` alerts for quota exhaustion events.

- **Feature**: Enhanced health checker with provider-level revival logic.
  - Health checks now run every 5 min (configurable via `HEALTH_CHECK_INTERVAL_MS`).
  - Batch size of 20 models with 15s timeout per probe.
  - Probes use minimal `"ok"` message with `max_tokens: 1`.
  - Revival via `bandit.reviveModel()` for permanent, cooldown, or degraded models.
  - Health status endpoint at `GET /v1/health-check/status`.

- **Fix**: Resolved database migration issues for new quota tables.
  - Added `provider_quota` table with provider, window_start, tokens_used, requests_used.
  - Added `provider_history` table for tracking bans, cooldowns, and attention flags.
  - Migration script handles existing databases gracefully.

## [v1.11.3] - 2026-10-30

- **Feature**: Implemented training daemon for continuous model evaluation.
  - New `scripts/train-daemon.mjs` runs background training cycles every 30 min.
  - Writes to separate `models_train` table to isolate training from production.
  - Production `selectModel()` uses `models_train × 0.3` as prior when production `N < 1`.
  - Training can be controlled via `scripts/train-ctl.sh` (start/stop/status/logs).
  - Daemon PID tracking in `.train-daemon.pid` for process management.

- **Fix**: Fixed training mode data isolation between production and training databases.
  - `models_train` table now fully mirrors `models` schema.
  - Bandit reads from both tables but only writes training results to `models_train`.
  - Production feedback still writes to `models` table.
  - Version bump to reflect training infrastructure.

## [v1.11.2] - 2026-10-30

- **Feature**: Added dynamic token limit discovery for providers.
  - Bandit now probes providers with increasing token counts to discover actual limits.
  - Discovered limits cached in `catalog` table as `discovered_max_tokens`.
  - Emergency fallback relaxes token limits when all models exceed discovered limits.
  - New `ignoreDynamicMaxTokens` option for emergency relaxation.
  - Reduces 413/400 errors from exceeding undocumented provider limits.

- **Feature**: Enhanced bandit scoring with soft bias multipliers.
  - New mode detection profiles: `summarizer`, `code`, `reasoning`, `general`.
  - Regex-based soft bias: `isCode`, `isThinking`, `isFast`, `isBig`, `isSmall`, `isFIM`, `isLowTPM`.
  - Multipliers stack multiplicatively on UCB1 score (not reward).
  - Mode signatures cached in `modes.signatures.json` with MD5 hashing.
  - Auto-discovery persists unknown patterns to `modes.discovered.json`.

- **Perf**: Optimized database queries in `selectModel()`.
  - Single query with LEFT JOIN fetches both model and catalog data.
  - Reduced from 2 queries to 1 for model selection path.
  - Rank cache with 30s TTL avoids recalculation on every request.

## [v1.11.1] - 2026-10-30

- **Feature**: Added context compression for large requests.
  - Auto-triggers at >80% of model's `max_input_tokens`.
  - Strategies: sliding window, message truncation (largest first), drop tools.
  - Preserves system prompt and last user message.
  - Configurable via `CONTEXT_COMPRESSION_ENABLED` env var.

- **Fix**: Fixed streaming timeout handling for long responses.
  - Three-level timeout: UPSTREAM (20s), STREAM_IDLE (60s), STREAM_MAX (180s).
  - STREAM_IDLE resets on ANY chunk (including SSE comments/heartbeats).
  - Summarizer profile gets 60s STREAM_MAX instead of 180s.
  - Proper cleanup of in-flight requests on timeout.

- **Chore**: Repository cleanup and automated version bump.

## [v1.10.4] - 2026-10-29

- **Feature**: Added session affinity for consistent model routing.
  - Session key = MD5(systemPrompt + firstUserMessage).
  - Sessions cached in `sessionModelMap` with 30-min TTL.
  - Invalidated on model failure for automatic failover.
  - LRU eviction at 10k entries.

- **Feature**: Implemented provider quota enforcement with webhook notifications.
  - Rolling minute/day windows per provider.
  - Limits from `config/provider-limits.json` (RPM/RPD per provider).
  - Webhook alerts on quota exhaustion (Slack, Discord, Telegram, generic).
  - Throttling: same event+subject max 1 per 5 min.

- **Fix**: Fixed retry logic to respect excluded models per request.
  - `excludedModels` Set tracks failed (model, provider) pairs per request.
  - Falls through to `fallbackModels` chain when all primary models exhausted.
  - Max attempts = min(providerCount × 4 + 100, 500).

- **Fix**: Improved error classification for better recovery.
  - 402: cooldown-model (1h), 403: cooldown-model (2h), 418: cooldown-model (1h).
  - 502: cooldown-provider (30m), 503: cooldown-provider (5m).
  - 429: flag-provider (retry-after or 60s).
  - Provider attention flags require manual clear via `POST /v1/provider/retry/:provider`.

## [v1.10.3] - 2026-10-29

- **Feature**: Added ring buffer logging with deduplication.
  - 200 entry ring buffer for in-memory log storage.
  - Consecutive identical lines collapsed with count suffix.
  - Accessible via `GET /v1/logs` endpoint.
  - Reduces memory overhead from verbose logging.

- **Feature**: Added request tracking and metrics endpoints.
  - `GET /v1/inflight` - Active in-flight requests with details.
  - `GET /v1/active` - Simple active request count.
  - `GET /v1/metrics` - Aggregated metrics (requires auth token).
  - Tracks latency, tokens, errors per model/provider.

- **Fix**: Fixed SQLite migration to be additive-only.
  - `_migrateDB()` only adds columns, never drops or alters types.
  - Ensures zero-downtime deployments with existing databases.

## [v1.10.2] - 2026-10-29

- **Feature**: Added provider health checking and auto-revival.
  - Background health checker runs every 5 minutes.
  - Targets permanent, cooldown > 1h, or degraded models.
  - Minimal probe request with `max_tokens: 1`.
  - Automatic revival via `bandit.reviveModel()`.
  - Status endpoint at `GET /v1/health-check/status`.

- **Fix**: Fixed bandit score calculation for new models.
  - New models get exploration bonus via UCB1 formula.
  - Training data blended as prior when production N < 1.
  - Prevents cold-start bias against new models.

## [v1.10.1] - 2026-10-29

- **Feature**: Implemented Discounted UCB1 bandit algorithm.
  - Discount factor 0.99 applied per feedback event.
  - Rewards: 1 = success, 0 = failure.
  - Automatic exploration/exploitation balance.
  - Configurable via `DISCOUNT_FACTOR` env var.

- **Feature**: Added model catalog with capabilities.
  - Catalog table stores: max_input_tokens, is_free, supports_tools, is_paid.
  - Bandit merges catalog with learned database state.
  - Database models preferred over catalog for same provider+id.

- **Feature**: Added fallback model chain.
  - 6-model chain in `config/bandit.json`.
  - Used when no models available after filtering.
  - Returns first model passing token limit check.

## [v1.9.2] - 2026-10-28

- **Feature**: Added notifier system for webhook alerts.
  - Supports Slack, Discord, Telegram, and generic webhooks.
  - Event types: quota_exhausted, provider_banned, model_degraded, health_check_failed.
  - Emoji mapping per event type.
  - Configurable throttling per event+subject.

- **Fix**: Fixed provider ban/cooldown logic.
  - Provider bans tracked in `provider_history` table.
  - Cooldowns with automatic expiry.
  - `needs_attention` flag for manual intervention cases.
  - API endpoints to clear bans: `POST /v1/reset/provider/:provider`.

## [v1.9.1] - 2026-10-28

- **Feature**: Added Express.js proxy server on 127.0.0.1:8080.
  - Main endpoint: `POST /v1/chat/completions`.
  - Forwards requests to upstream LLM providers.
  - Handles streaming and non-streaming responses.
  - Request/response validation.

- **Feature**: Implemented basic model routing.
  - Random selection from available models.
  - Token limit checking via `estimateTokens()`.
  - Basic error handling and retry logic.

## [v1.8.2] - 2026-10-26

- **Feature**: Added SQLite database for model state persistence.
  - Tables: models, catalog, provider_history, meta, request_logs.
  - Auto-migration on startup via `_migrateDB()`.
  - Better-sqlite3 for synchronous operations.

- **Feature**: Added configuration files.
  - `config/bandit.json` - Bandit parameters and fallback chain.
  - `config/modes.json` - Mode detection regex patterns.
  - `config/provider-limits.json` - Provider quota limits.

## [v1.8.1] - 2026-10-26

- **Feature**: Project initialization with core architecture.
  - Multi-Armed Bandit reverse proxy for LLM traffic.
  - Discounted UCB1 algorithm for dynamic routing.
  - Provider abstraction for multiple LLM APIs.
  - ES modules with Node.js 22+.

## [v1.7.1] - 2026-10-25

- **Feature**: Initial project setup and scaffolding.
  - Package.json with Express, better-sqlite3, dotenv.
  - Basic project structure with src/, config/, scripts/.
  - Development scripts and linting configuration.

## [v1.6.5] - 2026-10-24

- **Fix**: Various bug fixes and stability improvements.

## [v1.6.4] - 2026-10-24

- **Fix**: Additional bug fixes.

## [v1.6.3] - 2026-10-24

- **Feature**: Added more provider integrations.

## [v1.6.2] - 2026-10-24

- **Fix**: Error handling improvements.

## [v1.6.1] - 2026-10-24

- **Feature**: Core bandit algorithm implementation.

## [v1.5.3] - 2026-10-23

- **Feature**: Database schema design.

## [v1.5.2] - 2026-10-23

- **Feature**: Provider abstraction layer.

## [v1.5.1] - 2026-10-23

- **Feature**: Express server setup.

## [v1.4.4] - 2026-10-22

- **Fix**: Configuration improvements.

## [v1.4.3] - 2026-10-22

- **Feature**: Mode detection system.

## [v1.4.2] - 2026-10-22

- **Feature**: Health checker implementation.

## [v1.4.1] - 2026-10-22

- **Feature**: Notifier system.

## [v1.3.1] - 2026-10-21

- **Feature**: Training daemon.

## [v1.2.5] - 2026-10-20

- **Fix**: Bug fixes.

## [v1.2.4] - 2026-10-20

- **Fix**: More bug fixes.

## [v1.2.3] - 2026-10-20

- **Feature**: Quota management.

## [v1.2.2] - 2026-10-20

- **Feature**: Session affinity.

## [v1.2.1] - 2026-10-20

- **Feature**: Context compression.

## [v1.1.62] - 2026-10-19

- Initial development versions.
