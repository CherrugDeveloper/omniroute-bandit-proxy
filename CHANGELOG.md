# Changelog

Tutte le modifiche rilevanti a OmniRoute Bandit Proxy.

## v1.1.60 — 2026-10-19
- **Dashboard Unified Persistent Component & Widget Collapse**:
  - Deeply merged active requests history and selection rejection spec sheet into a unified persistent component in [`public/dashboard.html`](public/dashboard.html:807).
  - Added collapsible widget toggle with `localStorage` persistence across sessions in [`public/dashboard.html`](public/dashboard.html:1405).

## v1.1.59 — 2026-10-19
- **Dashboard Redesign & Considerazioni Tab Removal**:
  - Removed the redundant `consideration` tab from [`public/dashboard.html`](public/dashboard.html:828) and integrated the model evaluation spec sheet and detailed evaluation table directly into the Live Logs & Scarti tab (`logs`).
  - Refined proxy error classification, retry loop resilience, and `/v1/metrics` stats reporting across [`src/bandit.mjs`](src/bandit.mjs:100) and [`src/index.mjs`](src/index.mjs:800).

## v1.1.58 — 2026-10-19
- **Chronological Discarded Models Spec Sheet, Top Panel Integration & Per-Group Provider Quota**:
  - Integrated the model evaluation specchietto and considerations directly into the top panel of [`public/dashboard.html`](public/dashboard.html:823) for real-time visibility of evaluated models, rejection reasons, and selection flows.
  - Added a chronological spec sheet in [`public/dashboard.html`](public/dashboard.html:823) displaying evaluated models, rejection reasons, and currently selected models.
  - Implemented per-provider per-group (`free`/`paid`) RPM/RPD rate limiting and tracking with 2:00 AM daily resets in [`src/provider-quota.mjs`](src/provider-quota.mjs:23) and [`config/provider-limits.json`](config/provider-limits.json:1).

## v1.1.57 — 2026-10-19
- **Dashboard 401 Unauthorized & Token Prompting Improvements**:
  - Added interactive `handleUnauthorized()` modal prompt in [`public/dashboard.html`](public/dashboard.html:1204) enabling users to input and save their `DASHBOARD_TOKEN` upon receiving a 401 response.
  - Enhanced 401 banner in [`public/dashboard.html`](public/dashboard.html:1229) with an inline "Inserisci Token" button for immediate token entry.

## v1.1.56 — 2026-10-19
- **Fix Dashboard Consideration Fetch via apiFetch & 401 Handling**:
  - Replaced raw `fetch('/v1/consideration')` with `apiFetch('/v1/consideration')` in [`public/dashboard.html`](public/dashboard.html:2561) to include authentication headers.
  - Added 401 status check (`show401Banner()`) when fetching consideration data in [`public/dashboard.html`](public/dashboard.html:2563).

## v1.1.55 — 2026-10-19
- **Fix Dashboard Metrics Remaining at 0 via Null-Coalescing and Logging**:
  - Added robust null-coalescing and default fallbacks (`d.avgReward || 0`, `d.avgLatencySec || 0`, `d.freeActive ?? 0`) in [`public/dashboard.html`](public/dashboard.html:2225) when rendering dashboard stats.
  - Added debug request/response logging for `/v1/dashboard/stats` and statistics service payloads in [`src/index.mjs`](src/index.mjs:840) and [`public/dashboard.html`](public/dashboard.html:2201).

## v1.1.54 — 2026-10-19
- **Fix sessionKey Assignment to Constant Variable Error**:
  - Changed `const sessionKey` to `let sessionKey` in [`src/index.mjs`](src/index.mjs:1285) to allow conditional reassignment and updates.

## v1.1.53 — 2026-10-19
- **Catalog Non-Chat Models Inclusion & Rank Cache Invalidation**:
  - Removed restrictive `isChatModel` check in [`src/bandit.mjs`](src/bandit.mjs:436) that previously skipped non-chat models during catalog sync.
  - Upgraded capability classification in [`src/bandit.mjs`](src/bandit.mjs:478) to correctly handle batch, rerank, embedding, audio, and image generation models.
  - Reset `_rankCache` and updated sync metadata (`catalogTotal`, `lastSyncTimestamp`) post-catalog sync in [`src/bandit.mjs`](src/bandit.mjs:505).

## v1.1.52 — 2026-10-19
- **Fix Telegram URL Mutation in Notifier**:
  - Introduced local `targetUrl` variable in [`src/notifier.mjs`](src/notifier.mjs:51) when processing Telegram webhook notifications, ensuring `chat_id` query parameter removal does not mutate the original url parameter across subsequent requests.

## v1.1.51 — 2026-10-19
- **Dashboard UI Improvements & Conditional Session Affinity Bypass**:
  - **Dashboard UI Improvements**:
    - Enhanced active requests panel height (`height: 250px`, `min-height: 250px`) and refined default active model filtering in [`public/dashboard.html`](public/dashboard.html:492).
    - Upgraded script execution output polling in [`public/dashboard.html`](public/dashboard.html:2988) from fixed 180s loop to continuous `while (!isStopped)` polling with 2s intervals, error idle count threshold, and handling of running/stopped/interrupted script states.
  - **Conditional Session Affinity Bypass**:
    - Added conditional session affinity bypass in [`src/index.mjs`](src/index.mjs:1501) (`sessionKey = null`) when monitored models count (`sessionModels.size`) is less than total catalog models count (`SELECT COUNT(*) FROM catalog`), ensuring robust routing initialization when fewer models are tracked.

## v1.1.50 — 2026-10-18
- **Fix Dashboard Tab Refresh 404 Errors via Hash-Based Routing**:
  - Switched dashboard tab routing in [`public/dashboard.html`](public/dashboard.html:1336) from pathname history state (`/tabName`) to URL hash-based routing (`#tabName`).
  - Added `hashchange` and `popstate` event listeners in [`public/dashboard.html`](public/dashboard.html:1371) to synchronize active tabs instantly, ensuring tab refreshes never produce 404 errors across any static hosting or backend server setup.

## v1.1.49 — 2026-10-18
- **Fix Streaming Retry Block and Upstream Error Handling**:
  - Eagerly read and inspect the first chunk of upstream response before sending response headers (`res.setHeader` / committing headers) in [`src/index.mjs`](src/index.mjs:1877).
  - Prevents `[RETRY BLOCKED] headers già inviati` and enables seamless model failover and retries when upstream providers return errors or rate limits right as streaming starts.

## v1.1.48 — 2026-10-18
- **Optimize Dashboard PWA RAM and CPU Performance**:
  - Reduced excessive 100ms polling intervals to efficient rates (1.5s - 5s) in [`public/dashboard.html`](public/dashboard.html:2536).
  - Added Page Visibility checks (`document.hidden`) to pause all background polling when the tab/PWA is inactive.
  - Capped raw log accumulation in [`public/dashboard.html`](public/dashboard.html:2326) to 500 entries (`d.slice(-500)`) to prevent unbounded RAM growth.

## v1.1.47 — 2026-10-18
- **Add SPA Server-Side Fallback Configurations & Client-Side Routing**:
  - Added hosting configurations for SPA fallbacks in [`vercel.json`](vercel.json:1), [`netlify.toml`](netlify.toml:1), [`firebase.json`](firebase.json:1), [`nginx.conf`](nginx.conf:1), and [`.htaccess`](.htaccess:1).
  - Enhanced client-side tab routing and synchronization in [`public/dashboard.html`](public/dashboard.html:1334) to support direct navigation and hard-reloading of non-root routes.

## v1.1.46 — 2026-10-18
- **Fix Image-Generation Model Fallback Loop in Chat Completions**:
  - Fixed infinite fallback loop in chat completions when image-generation models are encountered or excluded in [`src/index.mjs`](src/index.mjs:1).
  - Updated [`CHANGELOG.md`](CHANGELOG.md:1).

## v1.1.45 — 2026-10-18
- **Implement Round-Robin Exploration for Unvisited Models and Fix Capability/Image Filtering**:
  - Added unit tests in [`__tests__/capability-filtering.test.mjs`](__tests__/capability-filtering.test.mjs:114) for round-robin exploration of unvisited models ($N=0$).
  - Added test validation ensuring strict capability filtering excludes image-generation models during standard chat completions.

## v1.1.44 — 2026-10-18
- **Strict Image-Generation Model Filtering and 400 Capability Mismatch Banning**:
  - Added classification rule in [`_classifyError()`](src/bandit.mjs:879) for 400 errors with image generation / chat incompatibility messages to trigger `ban-model` with reason `model-incompatible`.
  - Updated [`CHANGELOG.md`](CHANGELOG.md:1).

## v1.1.43 — 2026-10-18
- **Add Model Capability Categorization and Strict Filtering**:
  - Added catalog schema support for `capability`, `supports_chat`, and `supports_audio_generation` in [`src/bandit.mjs`](src/bandit.mjs:97).
  - Implemented strict capability filtering in [`selectModel()`](src/bandit.mjs:1516) and fallback chains in [`src/index.mjs`](src/index.mjs:1619) to prevent non-chat models from being selected for text chat completions.
  - Added comprehensive test suite in [`__tests__/capability-filtering.test.mjs`](__tests__/capability-filtering.test.mjs:1).

## v1.1.42 — 2026-10-17
- **Add Test Coverage for Image-Generation Model Selection Loop & 400 Ban Handling**:
  - Added unit test in [`__tests__/image-generation.test.mjs`](__tests__/image-generation.test.mjs:532) ensuring image-generation models banned on 400 error are properly excluded from future chat completions.

## v1.1.41 — 2026-10-17
- **Add SPA Fallback for Non-API Routes**:
  - Added wildcard SPA fallback route in [`src/index.mjs`](src/index.mjs:2054) returning [`public/dashboard.html`](public/dashboard.html:1) with `no-store` cache headers for non `/v1/` routes to support direct navigation and tab refreshing.

## v1.1.40 — 2026-10-17
- **Fix Image-Generation Model Filtering for Chat Completions & Make Active Requests Panel Scrollable with Attempt Rows**:
  - Ensured correct filtering of image-generation models for chat completions in [`src/bandit.mjs`](src/bandit.mjs:1516) and [`src/index.mjs`](src/index.mjs:1601).
  - Enhanced active requests tracking with attempt keys (`trackRequestStart()`, [`trackRequestUpdate()`](src/request-tracker.mjs:15), and [`getRequest()`](src/request-tracker.mjs:57)) in [`src/request-tracker.mjs`](src/request-tracker.mjs:1).
  - Updated active requests panel in [`public/dashboard.html`](public/dashboard.html:492) with proper vertical scrolling and scrollbar styling (`max-height: 220px`, `overflow-y: auto`).

## v1.1.39 — 2026-10-17
- **Add Model Metrics (N, Reward, Latency, Score) to Selection History and Dashboard Consideration Panel**:
  - Included `N`, `sum_reward`, `avg_reward`, `avg_latency`, and `score` in model selection history and rejection logs within [`src/bandit.mjs`](src/bandit.mjs:1539).
  - Updated dashboard consideration table in [`public/dashboard.html`](public/dashboard.html:832) to display comprehensive model metrics instead of filter tier.

## v1.1.38 — 2026-10-17
- **Model Selection Refinements, Quality-to-Speed Metrics, Dashboard Vertical Consideration Panel & 100ms Polling Frequency**:
  - Removed $N \ge 3$ restriction in [`getModelRank()`](src/bandit.mjs:646) and prioritized untested models ($N = 0$) with optimistic UCB1 exploration bonus in [`selectModel()`](src/bandit.mjs:1610).
  - Incorporated composite Quality-to-Speed ratio metrics combining average reward and latency efficiency into UCB1 scoring.
  - Added vertical consideration panel in [`public/dashboard.html`](public/dashboard.html:817) with discard reasons and model selection history (`GET /v1/consideration`).
  - Accelerated dashboard polling frequency to 100ms (0.1s) for ultra-responsive real-time updates.

## v1.1.37 — 2026-10-17
- **Fix Image-Generation Model Exclusion in Emergency Last-Resort Fallback Selection**:
  - Updated absolute last-resort model selection in [`src/bandit.mjs`](src/bandit.mjs:1597) to correctly filter out image generation models (`isImageGenerationModel`) when `requireImageGeneration` is false, preventing accidental selection of image models for text chat completions.

## v1.1.36 — 2026-10-17
- **Exclude aihorde Image Models and Add Filtering/Relaxation Tests**:
  - Excluded `aihorde/*` image models from chat completions and tool usage in [`src/bandit.mjs`](src/bandit.mjs:1) and [`src/index.mjs`](src/index.mjs:1).
  - Added unit tests in [`__tests__/image-generation.test.mjs`](__tests__/image-generation.test.mjs:1) verifying `aihorde` model filtering.

## v1.1.35 — 2026-10-17
- **Relax Tool and Token Filtering Constraints During Model Selection Recovery**:
  - Allowed tool requirement constraint (`requireTools`) to be relaxed during relaxation / emergency fallback tiers in [`src/bandit.mjs`](src/bandit.mjs:1512).
  - Added unit test in [`tests/bandit-filtering-relaxation.test.mjs`](tests/bandit-filtering-relaxation.test.mjs:42) validating recovery when `requireTools=true` under tight token limits.

## v1.1.34 — 2026-10-17
- **Exclude Image-Generation Models from Chat Completions and Tool Usage**:
  - Prevented image-generation models (e.g. DALL-E, Imagen, Flux, Stable Diffusion) from being selected during chat completions and tool usage requests in [`src/bandit.mjs`](src/bandit.mjs:1516) and [`src/index.mjs`](src/index.mjs:1601).

## v1.1.33 — 2026-10-17
- **Add Image Generation Detection, Routing, and Support for `/v1/images/generations`**:
  - Implemented automatic image generation request detection (`isImageGenerationRequest`) and conversion (`convertImageGenerationToChatCompletion`) in [`src/index.mjs`](src/index.mjs:1).
  - Added support for `supports_image_generation` flag in catalog schema and model selection in [`src/bandit.mjs`](src/bandit.mjs:1).
  - Added comprehensive test suite in [`__tests__/image-generation.test.mjs`](__tests__/image-generation.test.mjs:1).
  - Added documentation in [`docs/image-generation.md`](docs/image-generation.md:1) and workflow plans in [`plans/`](plans/).

## v1.1.32 — 2026-10-17
- **Classify Playwright Browser Launch 502 Errors as Ban-Provider**:
  - Updated error classification in [`_classifyError()`](src/bandit.mjs:908) within [`src/bandit.mjs`](src/bandit.mjs:1) to classify 502 browser launch / executable missing errors as `ban-provider` (`provider-misconfigured`).
  - Updated test assertions in [`__tests__/error-handling-and-filtering.test.mjs`](__tests__/error-handling-and-filtering.test.mjs:24) accordingly.

## v1.1.31 — 2026-10-16
- **Add Script Arguments Input & Default Status in train-ctl**:
  - Added script arguments input field in [`public/dashboard.html`](public/dashboard.html:2794) for executing custom script arguments via the UI script manager.
  - Set default case to `status` in [`scripts/train-ctl.sh`](scripts/train-ctl.sh:18) for convenient status checks when run without arguments.

## v1.1.30 — 2026-10-16
- **Enhance Request Token Size Estimation**:
  - Improved [`estimateTokens()`](src/bandit.mjs:1319) in [`src/bandit.mjs`](src/bandit.mjs:1) to accurately account for system prompts, tools, functions, and assistant `tool_calls` alongside message contents.

## v1.1.29 — 2026-10-16
- **Improve Robust Handling and Cooldown for 413 ITPM / TPM Exceeded Errors**:
  - Ensured dynamic model token limits (`dynamic_max_tokens`) are correctly queried and enforced in [`src/bandit.mjs`](src/bandit.mjs:1370).
  - Improved provider quota and quota exhaustion handling in [`src/provider-quota.mjs`](src/provider-quota.mjs:56) with robust `provider_history` record insertion.
  - Updated test assertions in [`__tests__/itpm-quota.test.js`](__tests__/itpm-quota.test.js:98) for model selection and filtering.

## v1.1.28 — 2026-10-16
- **Enhanced Error Recognition & Live Request Inspection for Tried Models and Rejection Reasons**:
  - Improved error recognition in [`_classifyError()`](src/bandit.mjs:908) within [`src/bandit.mjs`](src/bandit.mjs:1) for 429 quota exhaustion and 503 queue timeout errors (`RATE_LIMIT_QUEUE_TIMEOUT`, `Request exceeded queue budget`).
  - Implemented backend tracking for tried models, selection history with rejection reasons for analyzed models, and current model in execution via [`src/request-tracker.mjs`](src/request-tracker.mjs:1) and [`src/index.mjs`](src/index.mjs:1).
  - Enhanced dashboard UI in [`public/dashboard.html`](public/dashboard.html:1) to display previously tried models, model selection history with rejection reasons, and current execution models.

## v1.1.27 — 2026-10-16
- **Exclude TTS, Audio, and Image Models During Sync & Enhance Logging Transparency**:
  - Excluded TTS, speech, audio-only, and image generation models (e.g. DALL-E, Whisper, Flux) during model synchronization and filtering in [`src/bandit.mjs`](src/bandit.mjs:387) unless marked as chat/omni/multimodal.
  - Guarded error classification console logs in [`src/bandit.mjs`](src/bandit.mjs:683) to run only under `training` source or `DEBUG_BANDIT=true`, reducing production log noise.
  - Added enhanced model selection logging in [`selectModel()`](src/bandit.mjs:1530) within [`src/bandit.mjs`](src/bandit.mjs:1) for better banner transparency when `DEBUG=true`.

## v1.1.26 — 2026-10-16
- **Fix Qwen Model Selection Loop on 413 / ITPM Errors**:
  - Prevented infinite selection loops on failing models exceeding ITPM/413 token limits in [`src/bandit.mjs`](src/bandit.mjs:696) by setting `dynamic_max_tokens` to `estimatedTokens - 1` when no explicit token limit is parsed from the error.

## v1.1.25 — 2026-10-16
- **Robust Error Classification for Queue Timeouts & High Demand 503 Errors**:
  - Added robust classification in [`_classifyError()`](src/bandit.mjs:908) within [`src/bandit.mjs`](src/bandit.mjs:1) for `RATE_LIMIT_QUEUE_TIMEOUT` and high-demand 503 errors, classifying them as `cooldown-model` (`queue-timeout` / `high-demand`).
  - Added unit tests in [`__tests__/error-handling-and-filtering.test.mjs`](__tests__/error-handling-and-filtering.test.mjs:73) validating correct handling of queue timeouts and high-demand 503 responses.

## v1.1.24 — 2026-10-16
- **Dynamic Token Limit Enforcement & Session Affinity Refinement**:
  - Enforced `dynamic_max_tokens` (runtime 413/TPM limits) in [`src/bandit.mjs`](src/bandit.mjs:1) even when `ignoreTokenLimit` is true.
  - Refined session blacklisting and pinning removal in [`src/index.mjs`](src/index.mjs:1) upon 413 / TPM quota errors.

## v1.1.23 — 2026-10-16
- **Input Tokens Per Minute (ITPM) Tracking & Quota Enforcement & Testing**:
  - Pre-filtered models exceeding provider ITPM quota before UCB1 selection in [`src/bandit.mjs`](src/bandit.mjs:1).
  - Added comprehensive unit tests in [`__tests__/itpm-quota.test.js`](__tests__/itpm-quota.test.js:1) validating 413 error parsing, limit extraction, rolling token/call windows, provider skipping, and dynamic max tokens model filtering.
  - Configured provider-specific ITPM limits in [`config/provider-limits.json`](config/provider-limits.json:1) for OpenRouter, Groq, NVIDIA, Gemini, and Mistral.

## v1.1.22 — 2026-10-16
- **Bandit & Error Classification Fixes**:
  - Prevented zero-cooldown loops on 500 / SSE streaming errors in [`src/bandit.mjs`](src/bandit.mjs:1).
  - Enforced strict tool support filtering in model selection in [`src/bandit.mjs`](src/bandit.mjs:1).
  - Ensured persistence of 404 / deprecated model bans in [`src/bandit.mjs`](src/bandit.mjs:1).

## v1.1.21 — 2026-10-16
- **Session Affinity & Error Handling**:
  - Invalidate session affinity and blacklist model on model errors and failures in [`src/index.mjs`](src/index.mjs:1).

## v1.1.20 — 2026-10-16
- **Codebase Cleanup & Test Suite Consolidation**:
  - Cleaned up unuseful scripts, obsolete test files, and obsolete markdown plan files from [`plans/`](plans/) and workspace root, leaving a streamlined, production-ready codebase.
  - Consolidated test suites across [`tests/`](tests/) and [`__tests__/`](__tests__/) with unified execution via [`package.json`](package.json:10).

## v1.1.19 — 2026-10-15
- **Model Selection & Filtering Bug Fixes**:
  - Refined model filtering and selection in [`selectModel()`](src/bandit.mjs:1339) within [`src/bandit.mjs`](src/bandit.mjs:1) to ensure cooling down, token-exceeded, and excluded models are correctly prevented from selection.

## v1.1.18 — 2026-10-15
- **Dynamic Model Token Limits & Persistence**:
  - Enhanced [`src/bandit.mjs`](src/bandit.mjs:1) to dynamically extract and persist model token limits from 413 errors and error responses.

## v1.1.17 — 2026-10-15
- **Feedback Recording & Session Affinity Testing**:
  - Ensured automatic model registration in the [`models`](CHANGELOG.md:1) table within [`recordFeedback()`](src/bandit.mjs:644) in [`src/bandit.mjs`](src/bandit.mjs:1) for catalog-only models or any model receiving feedback.
  - Added unit test in [`__tests__/session-affinity.test.mjs`](__tests__/session-affinity.test.mjs:142) verifying 413 / tpm-exceeded error invalidates session affinity pin and persists cooldown in models database.

## v1.1.16 — 2026-10-15
- **Dashboard Log Frequency, Top Panel Metrics & UI Unification**:
  - Increased `RingBuffer` capacity in [`src/index.mjs`](src/index.mjs:385) from 200 to 1000 log entries for expanded log history.
  - Optimized polling intervals in [`public/dashboard.html`](public/dashboard.html:2437) (`refreshAll` to 1s, `fetchLogs` to 1s, `fetchActive` to 0.5s, `fetchQuota` to 10s) for high-frequency dashboard updates.
  - Unified stats container styling and top panel metrics in [`public/dashboard.html`](public/dashboard.html:69) with a responsive CSS grid layout (`minmax(280px, 1fr)`).

## v1.1.15 — 2026-10-15
- **Token Limit & TPM Exceeded Handling**:
  - Enhanced [`recordFeedback()`](src/bandit.mjs:681) in [`src/bandit.mjs`](src/bandit.mjs:1) and upstream error handling in [`src/index.mjs`](src/index.mjs:1557) to pass estimated tokens (`estimatedTokens`) and dynamically track/adjust `dynamic_max_tokens` on TPM/token limit errors.
- **Dashboard Metrics & Quota Styling**:
  - Refined [`public/dashboard.html`](public/dashboard.html:759) with color-coded CSS classes (`ok`, `err`, `warn`, `muted`, status badges) for request stats, model performance metrics, fail counters, and provider RPM/RPD quota visualization.

## v1.1.14 — 2026-10-15
- **Error Handling & Model Filtering**:
  - Added robust error classification in [`_classifyError()`](src/bandit.mjs:100) within [`src/bandit.mjs`](src/bandit.mjs:1) for CFP browser environment execution errors (`browserType.launch: Executable doesn't exist`) and Antigravity catalog availability errors (`not available in the active live catalog`), classifying them as `ban-model` (`environment-error` and `model-not-found`).
  - Refined relaxation tiers in [`selectModel()`](src/bandit.mjs:1339) within [`src/bandit.mjs`](src/bandit.mjs:1) to keep token limit strictness during tool and policy relaxation tiers.
  - Added dedicated test suite in [`__tests__/error-handling-and-filtering.test.mjs`](__tests__/error-handling-and-filtering.test.mjs:1) covering CFP, Antigravity, and Groq TPM / token limit checks.

## v1.1.13 — 2026-10-15
- **Error Classification & Model Input Token Limits**:
  - Enhanced [`_classifyError()`](src/bandit.mjs:100) in [`src/bandit.mjs`](src/bandit.mjs:1) to classify spawn/ENOENT errors for the [`zc`](src/bandit.mjs:750) provider as `ban-provider` (`provider-misconfigured`).
  - Updated HTTP 402 billing / insufficient funds errors in [`src/bandit.mjs`](src/bandit.mjs:881) to trigger `ban-provider` (`quota-exhausted`) instead of model/provider cooldowns.
  - Refined token limit evaluation in [`selectModel()`](src/bandit.mjs:1339) within [`src/bandit.mjs`](src/bandit.mjs:1) using `getModelMaxInput()`.
  - Updated unit tests in [`tests/bandit.test.mjs`](tests/bandit.test.mjs:47) to assert correct provider-level ban actions.

## v1.1.12 — 2026-10-15
- **Bandit Error Classification & Testing**:
  - Added robust classification and permanent banning rules in [`src/bandit.mjs`](src/bandit.mjs:1) for environment and sandbox errors (`ENOENT`, missing browser executables like playwright chromium, 404, 410).
  - Added comprehensive unit tests in [`tests/bandit.test.mjs`](tests/bandit.test.mjs:1) covering environment error classification.

## v1.1.11 — 2026-10-15
- **Bandit & Error Classification**:
  - Enhanced error classification in [`src/bandit.mjs`](src/bandit.mjs:1) for tool-calling requirement failures (`no-tool-call-but-required`), catalog mismatches, and environment configuration errors.
  - Updated model selection in [`src/bandit.mjs`](src/bandit.mjs:1) to correctly skip degraded models (`degraded === 1`) alongside permanently banned models.

## v1.1.10 — 2026-10-15
- **Dashboard UI**:
  - Added modern color-coded badges in [`public/dashboard.html`](public/dashboard.html:82) for model statistics (monitorati, attivi, cooldown, bannati, degraded, config, catalog, free, raw) to improve readability and visual hierarchy.

## v1.1.9 — 2026-10-15
- **Error Classification & Session Affinity**:
  - Enhanced [`_classifyError()`](src/bandit.mjs:100) in [`src/bandit.mjs`](src/bandit.mjs:1) to correctly detect 413 and TPM / tokens per minute limit errors and classify them as model cooldown/ban.
  - Updated upstream request handling in [`src/index.mjs`](src/index.mjs:1) to automatically invalidate session pins and add models to `sessionBlacklist` (with `severe: true`) on 413, 429, and TPM errors, preventing infinite retry loops on pinned models.

## v1.1.8 — 2026-10-15
- **Scripts & Deployment Refactoring**:
  - Generalised installation paths in systemd service template [`omniroute-bandit-proxy.service`](omniroute-bandit-proxy.service:1) and [`README.md`](README.md:1) using generic placeholders (`%USER%`, `%INSTALL_DIR%`).
  - Improved dynamic installation directory resolution in operational scripts [`scripts/switch-mode.sh`](scripts/switch-mode.sh:1) and [`scripts/train-ctl.sh`](scripts/train-ctl.sh:1).
  - Cleaned up obsolete helper wrapper script [`.roo/commands/git-auto-commit.sh`](.roo/commands/git-auto-commit.sh:1).

## v1.1.7 — 2026-10-15
- **Bandit Algorithm**:
  - Implemented robust Discounted UCB1 scoring with optimistic exploration for unobserved and low-sample catalog models (`N = 0`, `N < 3`) in [`selectModel()`](src/bandit.mjs:1) within [`src/bandit.mjs`](src/bandit.mjs:1), preventing unobserved catalog models from being locked out.
  - Added unit test in [`tests/bandit.test.mjs`](tests/bandit.test.mjs:1) to verify unobserved catalog model exploration.

## v1.1.6 — 2026-10-15
- **Proxy Robustness**:
  - Fixed iterative reduction in [`compressBody()`](src/index.mjs:247) within [`src/index.mjs`](src/index.mjs:1) to prevent `Maximum call stack size exceeded` errors.

## v1.1.5 — 2026-10-14
- **Proxy & Bandit Enhancements**:
  - Improved dashboard interface and analytics views in [`public/dashboard.html`](public/dashboard.html:1).
  - Refined provider quota tracking and atomic checks in [`src/provider-quota.mjs`](src/provider-quota.mjs:1).
  - Optimized bandit ranking and model selection stability in [`src/bandit.mjs`](src/bandit.mjs:1).
  - Enhanced proxy routing and error handling in [`src/index.mjs`](src/index.mjs:1).
  - Updated operational helper scripts and `.gitignore` to exclude temporary script outputs (`.script-output-*.json`).

## v1.1.4 — 2026-10-14
- **Codebase Cleanup**: Removed temporary test files, leftover script output artifacts, and obsolete utility scripts to maintain a clean workspace.

## v1.1.3 — 2026-10-14
- **Changelog & Script Cleanup**: Cleaned up temporary test scripts, artifacts, and unused auto-git helper scripts.
- **Workflow Automation**: Refactored automation and utility scripts for robust git workflows.

## v1.0.12 — 2026-10-10
- Dashboard: filtri tab Modelli (provider, stato, N≥, avg≥, search)
- Dashboard: nuovo tab Train (mirror su models_train)
- API: /v1/models, /v1/models/summary, /v1/providers

## v1.1.0 — 2026-10-10
- **Provider Quota System**: Added dashboard tab with provider quota table showing RPM, RPD, quota reset countdown, and provider state
- **Bandit Algorithm Enhancement**: Added `needs_attention` filter in `selectModel()` to skip providers with `needs_attention=1` in `provider_history`
- **Dashboard UI**: Added "Provider Quota" tab with color-coded RPM/RPD display, relative countdown for quota reset, and state badges (attivo, quota-exhausted, cooldown, banned)
- **Provider Status Management**: Provider filtering now checks cooldown, permanent ban, and needs_attention flags

## v1.0.12 — 2026-10-06
- **HTTP 429 Rate Limit Handling**:
  - **Summary**: Implemented robust retry logic with exponential backoff to handle HTTP 429 rate limit errors. Added fallback mechanisms to alternative models (e.g., `mistral/ministral-8b-latest`, `groq/allam-2-7b`) and updated the Bandit algorithm to penalize or ban models that repeatedly hit rate limits.
  - **Changes Made**:
    - Retry logic with exponential backoff in [`src/bandit.mjs`](src/bandit.mjs:1) and [`src/index.mjs`](src/index.mjs:1).
    - Fallback mechanism to switch to alternative models.
    - Bandit algorithm updates to penalize or ban models that repeatedly hit rate limits.
    - Parsing and using `Retry-After` headers for API compliance.
    - Detailed logging for retries, failures, and fallback selections.
  - **Tests Added**: Added `tests/bandit.test.cjs` to validate retry logic, fallback behavior, and rate limit handling.

## v1.0.11 — 2026-10-06
- Fix critico: cooldown provider asimmetrico → i modelli restavano congelati
- `_forceProviderCooldown` aggiornava i modelli, ma lo sblocco azzerava solo `provider_history`
- Aggiunto `_unlockProvider(provider)`: azzera `cooldown_until` + `consecutive_5xx` su provider **e** modelli
- Sblocco (`selectModel` + fallback) ora usa `_unlockProvider`
- Soft/hard cooldown: solo `quota-exhausted`, `no-credit`, `key-quota-exceeded` congelano i modelli
- `cascade-fail` (5 min), 5xx transitori e rate-limit toccano solo `provider_history`
- Log: distingue `hard-cooldown (N modelli)` da `soft-cooldown (solo provider)`
- Risolve: 762 modelli openrouter bloccati 4h da un singolo cascade-fail
- Dopo il deploy: pulizia one-shot (`UPDATE models SET cooldown_until=0, consecutive_5xx=0 WHERE permanent=0` + idem su `provider_history`)

## v1.0.10 — 2026-10-05
- Dashboard "In corso": colonne a larghezza fissa (rank, N, avg, arrow)
- Sempre 4 valori per riga (anche per modelli nuovi/test)
- `try N` per attive, `Xs`/`Xm` per recenti, sempre presenti

## v1.0.9 — 2026-10-05
- Bandit: `dynamic_max_tokens` appreso dagli errori 413 (self-learning)
- Rimosso hardcode `LOW_TPM_MODELS` / `LOW_TPM_THRESHOLD`
- `selectModel` filtra con `effective_max_tokens = MIN(catalog, learned)`

## v1.0.8 — 2026-10-05
- Fix crash `provider is not defined` su STREAM INVALID

## v1.0.7 — 2026-10-05
- Fix ReferenceError `recentErrors` (variabile eliminata)

## v1.0.6 — 2026-10-05
- Affinity: struggling detection solo sull'ultimo tool_result

## v1.0.5 — 2026-10-05
- Affinity: penalizza + unpin su tool_call fallito

## v1.0.4 — 2026-10-05
- Training: accumulo fail-provider su 5xx E 429 rate-limit

## v1.0.3 — 2026-10-05
- Training: accumulo fail-provider su 5xx
- Bandit: classifica errori anche in training (ban/cooldown/flag provider)

## v1.0.2 — 2026-10-05
- Bandit: training non incrementa più Richieste/Osservazioni
- Session affinity: unpin automatico se la sessione è struggling

## v1.0.1 — 2026-10-05
- Dashboard: FAB con menu Developer/Changelog
- Badge rosso sul FAB quando c'è un changelog non letto
- Changelog formattato client-side
- Fix link dev-card (PayPal, Ko-fi, BMC)
- Fix scope `DEBUG_VERBOSE`, `forceProvider`, `excludedModels`

## v1.0.0 — 2026-10-04
- **Session Affinity**: pin modello per conversazione (TTL 30 min)
- **Mode/Profile system**: 14 modalità Zoo Code con soft bias
- **Training isolation**: tabella `models_train` separata
- **Priorità Zoo al training**: pausa se `/v1/inflight > 0`
- **Circuit breaker provider**: 3 fail in-request → cooldown 5 min
- **Hard cap contesto**: 150k token → 413
- **Timeout streaming**: idle content-based (60s) + hard cap (180s)
- **Health check**: include `degraded=1`
- **5xx transitori**: cooldown 1h invece di ban permanente
- **Dashboard**: tab Modalità, rank modelli, trend, debug toggle
- **Debug verbose**: attivabile senza restart
- **Classificatore errori**: 20+ pattern

## v0.9.0 — 2026-10-03
- Training daemon con priorità Zoo
- Esclusione FIM, audio, non-chat
- Notifier webhook (Slack/Discord/Telegram)
