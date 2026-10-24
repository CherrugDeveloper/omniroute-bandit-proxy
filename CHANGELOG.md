# Changelog

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

## v1.1.62 — 2026-10-19
