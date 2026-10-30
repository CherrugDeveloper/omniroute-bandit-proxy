## v1.1.90 — 2026-10-30
- **Auto-Git Command Enhancement**:
  - Added `# Skill: auto-git` directive to `.roo/commands/auto-git.md` to make the command executable via the skill system
- **Dashboard Log Filter Enhancement**:
  - Added `log-show-proxy` checkbox to dashboard log filter in `public/dashboard.html` for filtering proxy-related log entries
- **Health Check Improvements**:
  - Modified health check logic in `src/health-check.mjs` for improved reliability and error handling
- **Proxy Error Handling Improvements**:
  - Enhanced proxy error handling in `src/index.mjs` with better error classification and recovery mechanisms

## v1.1.89 — 2026-10-29
- **Fix Cronologia Unificata Timestamp Overlap**:
  - Removed orange "try N" text from active model timestamp cell in `fmtRow()` (was causing visual overflow into Provider column)
  - Active thinking models now show only timestamp + elapsed seconds, e.g. `19:57:05 (20.6s)`
  - Non-active rows show clean timestamp only, e.g. `19:55:24`
  - This eliminates the column overlap in the unified history table

## v1.1.91 — 2026-10-30
- **Fix Service Startup Crash (Duplicate Variable Declaration)**:
  - Removed duplicate `const isHardError` declaration at `src/index.mjs:1732` inside `noteProviderFail()`
  - The duplicate caused `SyntaxError: Identifier 'isHardError' has already been declared` at module load, preventing the server from binding port 8080
  - This was the root cause of `restart-safe.sh` failing with "Porta 127.0.0.1:8080 non si è bindata dopo 60s" — systemd's `Restart=on-failure` kept restarting the crashed process in a loop
  - Also ran `npm install` to restore missing `node_modules` (express and other dependencies were absent)
- **Fix Cronologia Unificata Timestamp Overlap**:
  - Removed orange "try N" text from active model timestamp cell in `fmtRow()` (was causing visual overflow into Provider column)
  - Active thinking models now show only timestamp + elapsed seconds, e.g. `19:57:05 (20.6s)`
  - Non-active rows show clean timestamp only, e.g. `19:55:24`
  - This eliminates the column overlap in the unified history table

## v1.1.88 — 2026-10-29
- **Fix Repeated Provider Errors in Bandit Model Selection**:
  - Fixed `isModelAvailable()` to actively check `needs_attention` flag with auto-reset on cooldown expiry (was commented-out)
  - Added `cooledDownThisRequest` filtering in `selectModel()` `filterModels()` to skip providers cooled down during current request, preventing cascade failures
  - Fixed `cooledDownThisRequest` default from `true` (boolean) to `new Set()` to resolve `TypeError: .has is not a function`
  - Removed `!ignoreDynamicMaxTokens` condition so runtime-discovered TPM limits (from 413 errors) are always enforced during relaxation tiers
  - Added `dynamic_max_tokens` check to absolute last resort fallback that previously bypassed all token filtering
  - All 5 tests in `__tests__/itpm-quota.test.js` now pass

- **Fix Connection Errors in Chrome Dashboard Client**:
  - Added top-level try/catch wrapper to `/v1/chat/completions` route handler to prevent uncaught exceptions from crashing the server process
  - Previously, exceptions in `compressBody()`, `estimateTokens()`, or model selection logic would trigger the uncaughtException handler, which immediately calls `process.exit(1)`
  - Now, unhandled exceptions are caught, logged, and a proper 500 JSON response is returned to the client instead of crashing the server
  - This resolves `ERR_CONNECTION_REFUSED` and `ERR_CONNECTION_RESET` errors in the Chrome dashboard client after successful API calls


## v1.1.87 — 2026-10-29
- **Dashboard Log Streaming Fix**: Fixed log table column alignment (tbody changed from `display: block` to `display: table-row-group` so `table-layout: fixed` works correctly), removed message truncation (messages now wrap instead of being cut off at 200px), and expanded log container to use all available vertical space (`flex: 1` instead of `max-height: 200px`)

## v1.1.86 — 2026-10-29
- **Dashboard Polling Fix**: `renderAll()` now checks the active tab before fetching `/v1/models` data, eliminating unnecessary polling when the models tab is not active. This resolves repeated `/v1/models` API calls every ~60-70 seconds with growing suppression counts in server logs.

## v1.1.85 — 2026-10-28
- **Workspace Cleanup & Auto-Git Workflow**:
  - Removed superfluous temporary files: `.train-daemon.pid`, `scripts/.script-output-*.json`
  - Removed obsolete test files from `__tests__/` and `tests/` directories
  - Removed `AGENTS.md` (superseded by `.roo/rules-code/AGENTS.md`)
  - Added auto-git command and skill definitions
  - Updated changelog and readme

## v1.1.84 — 2026-10-28
- **Dashboard Overhaul & Fixes**:
  - Comprehensive dashboard overhaul with enhanced metrics, logs, unified history, and controls (41c8882)
  - Fixed syntax error in public/dashboard.html (cbaf8c1)
  - Fixed structural issues in public/dashboard.html (85c7e5f)
  - Fixed 'source is not defined' unhandled rejection in selectModel function (2be83f7)
  - Fixed log buffer string entries rendering in dashboard (dcdbfe1)
  - Fixed log rendering in log streaming panel (8ee9901)
  - Fixed SyntaxError and ReferenceError in dashboard.html (afdf627)
  - Fixed log streaming tab showing empty rows (dashes) instead of actual log entries
  - Fixed "Copia Tutto" (Copy All) button throwing "Cannot read properties of null" error
  - **Dashboard UI Optimization**: aligned numbers in model/provider boxes with `tabular-nums`, optimized column widths in unified history and log streaming tables, reduced log streaming height from 300px to 200px, inverted unified history order (newest at top)
- **API & Endpoints**:
  - Fixed resetProvider endpoint to pass provider name correctly (774de70)
  - Fixed dashboard reset buttons to call correct API endpoints (edcc953)
  - Added separate reset endpoints for models and providers (2ca801c)

## v1.1.83 — 2026-10-26
- **Bug Fixes & Logic Improvements**:
  - Fixed `totalObservations` counter increment timing in `recordFeedback()`: counter now increments only on successful feedback, not on failures
  - Enhanced `resetGlobalCounters()` to clear `request_logs` history and reset model/provider learning state (N, sum_reward, fails, cooldown, permanent, degraded, consecutive_5xx, dynamic_max_tokens)
  - Refined model filtering logic in `selectModel()`: models with `supports_chat === 1` are now correctly treated as chat-capable even if they also support image generation (e.g., gpt-4o)
  - Added validation to token limit parsing: values < 1000 tokens are filtered out as spurious (error codes, HTTP status codes)
  - Removed redundant `/image/i` regex from non-chat model exclusion (now relies on `supports_chat` flag)

## v1.1.82 — 2026-10-26
- **Workspace Cleanup & Documentation Audit**:
  - Verified no superfluous files; plans directory absent
  - Confirmed tests/*.bak files absent
  - No build artifacts detected in workspace
  - Identified .gitignore validation issue: `bandit_state.db` tracked despite `*.db` ignore pattern
  - Untracked files identified: `docs/restart-procedure.md`, `scripts/free-port-emergency.sh`, `scripts/restart-safe.sh`
  - Workspace state documented for potential .gitignore refinement

## v1.1.81 — 2026-10-25
- **System Stability & Port Conflict Fix**:
  - Fixed EADDRINUSE port 8080 conflicts by removing duplicate user-level systemd service
  - Refactored `scripts/restart.sh` to hard-fail on port contention with 30s timeout
  - Added PID tracking and graceful termination with SIGTERM/SIGKILL escalation
  - Extended service polling to 30s with TCP connectivity verification
  - Prevented fallback local node start when systemd is managed
  - Wait for port release before active service check

## v1.1.80 — 2026-10-24
- **Dashboard UI**:
  - Fix: Removed incorrect `Math.min` capping of observations count in dashboard statistics to accurately display total observations.

## v1.1.79 — 2026-10-24
- **Dashboard UI**:
  - Fix: remove duplicate latency unit from dashboard observations/catalog

## v1.1.78 — 2026-10-24
- **Dashboard UI**:
  - Implemented fluid typography for dashboard statistics for better responsiveness.
  - Refined fluid typography scaling for stats boxes to ensure better readability and consistent layout.
  - Fix: Use viewport-based scaling for stats boxes in dashboard.

- Fix: Reset provider attention flags and cooldowns in `bandit.db`.
- Refactor: Allow attention flag relaxation in emergency filtering in `src/bandit.mjs`.

Tutte le modifiche rilevanti a OmniRoute Bandit Proxy.

## v1.1.77 — 2026-10-24
- **Systemd Path Fix**:
  - Corrected `WorkingDirectory` and `ExecStart` paths in `omniroute-bandit-proxy.service` and `~/.config/systemd/user/omniroute-bandit-proxy.service` to match the project root and resolve "No such file or directory" errors.

## v1.1.76 — 2026-10-24
- **Cleanup & Maintenance**:
  - Removed `.roo/commands/cleanup.md`
  - Updated `tests/bandit.test.mjs`

## v1.1.75 — 2026-10-23
- **Vision Support & Model Capability Detection**:
  - Added `supports_vision` column to catalog schema with migration in `src/bandit.mjs`
  - Extended `selectModel` signature with `requireVision` parameter and filtering logic for vision-capable models
  - Added image block detection in chat completions to route vision requests to appropriate models
  - Updated catalog and models queries to include vision capability flag

## v1.1.74 — 2026-10-23
- **Codebase Cleanup & Error Classification Enhancements**:
  - Enhanced 400 error classification: excluded image block format mismatches from "model-not-supported" to prevent false positives
  - Improved provider-level error detection for environment errors (ENOENT, spawn failures, CLI not found)
  - Removed unused diagnostic script and plan files
  - Cleaned up test-target.sh and obsolete plan files

## v1.1.73 — 2026-10-23
- **Enhanced Error Classification & Provider Expansion**:
  - Added new providers (`cfp`, `dva`, `xai-oauth`, `xao`) to `config/provider-limits.json` with rate limits and token estimation
  - Enhanced error classification in `src/bandit.mjs`:
    - Added Cloudflare Playground (cfp) 502 error handling: transient session failures trigger cooldown, permanent environment errors trigger ban
    - Improved 400 error classification: excluded image block format mismatches from "model-not-supported" to prevent false positives
    - Enhanced provider-level error detection for environment errors (ENOENT, spawn failures, CLI not found)
  - Fixed session affinity check in `src/index.mjs`: now uses database models count (`models` table) instead of sessionModels.size for accurate monitoring

## v1.1.72 — 2026-10-22
- **Dashboard UX Improvements & Codebase Cleanup**:
  - Fixed timestamp display in [`public/dashboard.html`](public/dashboard.html:2657) to use local time via `toLocaleTimeString()` instead of UTC ISO format
  - Streamlined request log stats: combined `reason` and `error` fields to avoid redundancy in [`public/dashboard.html`](public/dashboard.html:2718)
  - Added tooltip to "scarti" count showing "Modelli scartati per questa richiesta" in [`public/dashboard.html`](public/dashboard.html:2724)
  - Removed bordered table wrapper, optimized scrollbar styling, and added `vertical-align: middle` for cleaner layout in [`public/dashboard.html`](public/dashboard.html:190)
  - Removed unused diagnostic script `scripts/diag-tokenlimit.mjs`
  - Removed backup test file `tests/bandit.test.mjs.bak`
  - Removed obsolete plan files: `dashboard-specchietto-integration.md`, `image-generation-endpoint.md`, `model-categorization-and-filtering-spec.md`, `performance-analysis.md"

## v1.1.71 — 2026-10-22
- **Log Noise Reduction & Polling Efficiency**:
  - Added `src/log-throttle.mjs` with request throttling and log-noise filtering to reduce console spam and improve polling efficiency
  - Enhanced `src/index.mjs` with `DASHBOARD_STATS_LOG_INTERVAL_MS`, `MODELS_LOG_THROTTLE_MS`, `CORS_DEBUG`, `DEBUG_VERBOSE`, and `LOG_BUFFER_DENYLIST` config options in `.env.example`
  - Added `tests/log-noise.test.mjs` with 271 test cases validating throttling behavior, log buffer denylist, and polling efficiency metrics
  - Updated `.env.example` with new logging/debug noise control parameters

## v1.1.70 — 2026-10-22
- **Rewrite Image Generation Detection with Strict Three-Rule Strategy**:
  - Rewrote `isImageGenerationRequest()` in [`src/index.mjs`](src/index.mjs:50) around three explicit rules (R1/R2/R3) to eliminate the recurring `400 Image generation requests are not supported` errors returned to Zoo Code on every request.
  - **R1 — image model id**: extracted `IMAGE_MODEL_PATTERNS` in [`src/index.mjs`](src/index.mjs:34); a model id matching `dall-e`, `stable-diffusion`, `midjourney`, `flux`, `imagen`, `sdxl`, `sd-xl`, `playground`, `aihorde` (or the `aihorde/` prefix) is always an image request.
  - **R2 — payload shape**: a `prompt` without `messages` is only an image request when image-specific params (`n`, `size`, `response_format`) are present or no `model` was supplied. A chat model such as `gpt-4o` carrying a `prompt` field is now correctly treated as a regular chat completion.
  - **R3 — explicit intent**: kept the explicit phrase list and replaced the old "any ambiguous verb + any image noun anywhere" heuristic with the `STRICT_IMAGE_INTENT_RE` adjacency regex in [`src/index.mjs`](src/index.mjs:47), requiring the image noun to directly follow the verb (optional article + up to 2 adjectives).
  - Added diagnostic logging of the offending payload shape in the `POST /v1/chat/completions` handler in [`src/index.mjs`](src/index.mjs:1336) to pinpoint future false positives.
  - Full test suite green: 140/140 tests passing (`node --test tests/*.test.mjs __tests__/*.test.mjs`).

## v1.1.69 — 2026-10-22
- **Fix False-Positive Image Generation Detection**:
  - Removed overly aggressive regex pattern in [`src/index.mjs`](src/index.mjs:33) that was causing false-positive image generation errors for normal chat completions.
  - Cleaned up debug logging in [`src/index.mjs`](src/index.mjs:92).

## v1.1.68 — 2026-10-21
- **Dashboard Stats Layout & Request Log Parameter Fix**:
  - Refactored `.stats-container` in [`public/dashboard.html`](public/dashboard.html:69) to horizontal flex row with overflow-x scrolling and fixed stats item widths.
  - Streamlined counter reset action in [`public/dashboard.html`](public/dashboard.html:2359) by removing redundant confirmation dialog.
  - Updated model and provider update query parameters in [`src/bandit.mjs`](src/bandit.mjs:850) for robust request log tracking.

## v1.1.67 — 2026-10-20
- **Fix Dashboard Floating Action Button & Developer Handlers**:
  - Replaced direct element queries with robust event delegation for `.dev-menu-item`, `.dev-modal-overlay`, `.dev-modal-close`, and `#dev-share-btn` in [`public/dashboard.html`](public/dashboard.html:1) to ensure changelog, developer modal, and share actions work reliably.

## v1.1.66 — 2026-10-20
- **Dashboard Performance & Security Optimizations**:
  - Implemented DOM reflow batching and virtualized rendering updates in [`public/dashboard.html`](public/dashboard.html:1).
  - Added robust input/event debouncing to eliminate redundant calls and reduce CPU overhead in [`public/dashboard.html`](public/dashboard.html:1).
  - Enhanced memory leak prevention and interval lifecycle/cleanup management in [`public/dashboard.html`](public/dashboard.html:1).
  - Added strict string sanitization and XSS prevention for user-facing telemetry and log output in [`public/dashboard.html`](public/dashboard.html:1).

## v1.1.65 — 2026-10-20
- **Optimize Dashboard RAM and CPU via Consolidated Polling and DOM Patching**:
  - Consolidated multiple `setInterval` polling timers into a single coordinated interval with `document.hidden` pause checks and drift protection in [`public/dashboard.html`](public/dashboard.html:2716).
  - Replaced heavy `innerHTML` template string concatenation with `DocumentFragment` and `replaceChildren()` DOM patching in [`renderProviderQuota()`](public/dashboard.html:2386) and [`fetchLogs()`](public/dashboard.html:2506) to minimize memory allocations and layout thrashing.
  - Fixed tab switching lag and requests tab bugs by capturing open accordion states and ensuring stable row identifiers in [`fetchActive()`](public/dashboard.html:2569) within [`public/dashboard.html`](public/dashboard.html:1).

## v1.1.64 — 2026-10-20
- **Fix Syntax Errors in Dashboard**:
  - Corrected minor syntax errors and ensured clean structure in [`public/dashboard.html`](public/dashboard.html:1).

## v1.1.63 — 2026-10-20
- **Refactor Dashboard UI**:
  - Improved UI efficiency by removing unnecessary `document.hidden` checks in [`public/dashboard.html`](public/dashboard.html:1).
  - Reorganized event handlers for better maintainability in [`public/dashboard.html`](public/dashboard.html:1).
- **Refine Model Selection Relaxation Tiers and Optimize Logging**:
  - Updated relaxation tiers in `selectModel` for clearer progression (Tiers 1-4) in [`src/bandit.mjs`](src/bandit.mjs:1).
  - Conditionalized verbose debug logs using `debugVerbose` in [`src/index.mjs`](src/index.mjs:1) and [`src/bandit.mjs`](src/bandit.mjs:1).
  - Enhanced image generation detection heuristics with additional keywords ('visualize', 'render') and regex patterns in [`src/index.mjs`](src/index.mjs:1).
## 2026-10-29

fix(dashboard): align numbers, optimize columns, invert unified history order (600bccd) 2026-10-28
fix(dashboard): align metrics numbers, hide scrollbars, optimize half-screen view (94e5779) 2026-10-28
fix: resolve 'no such column: N' error in getDashboardStats() (46260d1) 2026-10-28
fix: CSS overlap fix for 'Osservazioni OK' in dashboard stats (display: inline-flex with gap) (e8afce7) 2026-10-28
fix(dashboard): fix log streaming rendering and copy button (93e7a41) 2026-10-28
chore: add auto-git command and skill definitions, update changelog and readme (feb12d1) 2026-10-28
fix(dashboard): resolve syntax error in public/dashboard.html (cbaf8c1) 2026-10-28
fix(dashboard): resolve structural issues in public/dashboard.html (85c7e5f) 2026-10-28
feat(dashboard): comprehensive dashboard overhaul with enhanced metrics, logs, unified history, and controls (41c8882) 2026-10-28
fix: resolve 'source is not defined' unhandled rejection in selectModel function (2be83f7) 2026-10-27
## 2026-10-30

fix(proxy): fail fast on model-not-found errors and fix status reporting (0d09d07) 2026-10-30
fix: enforce cooldown in bandit emergency relaxation tiers (1fa82d2) 2026-10-30
fix: prevent model re-selection loop in bandit emergency relaxation (7137d7e) 2026-10-30
fix: revert incorrect ZOO mode addition; fix dashboard CSS alignment and filter overflow (af0293d) 2026-10-30
chore: v1.1.90 — 2026-10-30 (f88bb76) 2026-10-30
fix(dashboard): remove try text from Cronologia Unificata timestamp to resolve column overlap (67e3a8f) 2026-10-29
fix(dashboard): prevent connection errors by adding try/catch to chat/completions route handler (21a11b3) 2026-10-29
fix: prevent repeated provider errors in bandit model selection (aa4a7ab) 2026-10-29
fix(dashboard): fix log streaming column alignment, message truncation, and container height (54591e0) 2026-10-29
fix(dashboard): stop polling /v1/models when models tab is not active (118c37a) 2026-10-29
## v1.1.62 — 2026-10-19
