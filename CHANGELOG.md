## [1.19.0] - 2026-11-05

### Feat

- **Bandit**: Add SSE stream error handling as critical failures
  - SSE errors (stream errors indicate persistent issues with the model provider) now classified as critical failures in `_isCriticalFailure()` [src/bandit.mjs:1601]
  - Added error pattern `SSE contains error|SSE chunk error|stream error` to permanent error classifications for ban-model scope [config/bandit.json:39]
- **Config**: Refine stream/connection error patterns
  - Removed generic `chunk` from keepalive pattern to avoid false positives [config/bandit.json:28]

## [1.18.0] - 2026-11-05
### Feat
- implement aggressive 3-strike punishment system and exponential backoff
- implement 3-strike aggressive punishment system for critical failures
- implement exponential backoff cooldown system with punishment tracking
- implemented exponential backoff cooldowns and total_failures tracking for consecutive 5xx errors
- enhance Unified Chronology with per-model selection history
- emergency relaxation and fallback chain improvements
- add dynamic non-active stats and colorize badges
- stop failure spiral for exhausted provider credentials
- add log message expansion to dashboard
- move provider metrics to provider box, add color-coded log filters, fix session dedup and TDZ errors
- move provider metrics to providers tab, quantize unified history, fix session deduplication, fix ITPM emergency tier
- active events display, metric percentages, unified history row height, and train-daemon functionality
- merge training status into top model card
- update bandit logic
- fix error classification
- automated commit
- add auto-git workflow and cleanup test files
- comprehensive dashboard overhaul with enhanced metrics, logs, unified history, and controls
- separate reset endpoints for models and providers
- implement fluid typography for dashboard stats
- implement vision capability support and catalog migration
- implement 5 enhancements - auto-clear needs_attention after health checks, provider circuit breaker, improved token estimation, fallback model scoring, per-provider health check frequency
c6bff9d docs: update CHANGELOG.md and README.md for log-noise reduction feature
- add request throttling and log-noise filtering to reduce console spam and improve polling efficiency
- implement POST /v1/images/generations endpoint
- capture failing models and 400 errors explicitly in request logs and dashboard specchietto
- enhance model selection candidate tracking and consideration history buffer across relaxation tiers
- fix syntax errors in public/dashboard.html and update changelog
- perform true structural fusion of active requests and selection rejection spec sheet
- deeply merge active requests history and selection rejection spec sheet into unified persistent component
- refine metrics fix and dashboard UI refactoring
- remove Considerazioni tab and integrate selection/discard timeline into Live Logs tab, fix proxy error classification & retry loop, and fix /v1/metrics bug
- integrate model evaluation specchietto into top panel
- add chronological discarded models spec sheet and per-group provider quota handling
- update dashboard UI polling/timeout logic and conditional session affinity bypass, update changelog
- enforce strict capability filtering for tool requests and image generation models
- implement round-robin exploration for unvisited models and fix image-generation filtering
- implement model categorization and capability filtering
- add SPA fallback route for non-API requests and update changelog
- add model metrics (N, reward, latency, score) to consideration history and dashboard
- refine model selection with N=0 prioritization and quality-to-speed metrics, add vertical consideration panel and 100ms polling
- add image generation request detection and conversion helpers
- add image generation detection, routing, and support for /v1/images/generations
- add script arguments input and default status in train-ctl
- enhance request token size estimation for system prompts, tools, and tool calls
- exclude tts/audio/image models during sync and enhance selection banner logging transparency
- enforce dynamic token limits and refine session affinity TPM blacklisting
- configure provider ITPM limits and update changelog for 413 error handling and session affinity fixes
- ensure model existence in feedback recording and add 413/tpm session invalidation test
- optimize log frequency, top panel metrics & UI style unification
- add color-coded badges to model statistics
- clean up unused skill scripts, add update_changelog custom tool, and update CHANGELOG.md
- enhance bandit routing, health checks, retry handling, and add comprehensive test suite
- enhance multi-armed bandit proxy routing, error classification, and metrics dashboard
- provider quota system - dashboard table, needs_attention filter, CHANGELOG v1.1.0
- provider quota system - dashboard table, needs_attention filter, CHANGELOG v1.1.0
- handles 429 retries with fallback
- reward per tool, loop detection, orchestrator→reasoning
- tabella In corso con header e colonne fisse
- dynamic_max_tokens appreso dai 413 (self-learning)
- endpoint /v1/changelog + file CHANGELOG.md
- low TPM filter, unpin 413, new models badge, training exclude
- rank modello, trend, esclusione health check
- session affinity, mode routing, training isolation, debug toggle
- auto-compress per-model invece di max-catalog
- requireTools penalizza modelli che non chiamano tools
- pulsante Blocca modello (permanent=1), cambia in Sblocca se già bannato
- pannello attività sempre visibile (attive + ultime richieste)
- pannello richieste in-flight (modello, tentativo, tempo)
- EXCLUDE_THINKING + EXPLOIT_ONLY + switch-mode.sh per prod/train
- EXPLOIT_ONLY (solo modelli N>=3) per uso produttivo <2s
- summary aggregato (attivi, reward, latenza, free, topModel); fix cooldown provider spurio
- display_override per nascondere barra del titolo (window-controls-overlay)
- pulsante reset contatori globali (richieste + osservazioni)
- timeout non skippa provider, soglia 5 fail, esclude pattern openrouter problematici
- free/paid detection, filtri ONLY_FREE/EXCLUDE_PAID, is_paid su 402, catalogRawCount
- supporto Telegram con chat_id configurabile
- webhook Slack/Discord su eventi critici
- pulsante Cosa fare sui provider needs_attention con istruzioni contestuali
- degraded mode (score*0.3), auto-riabilitazione, catalogRawCount in metrics
- degraded mode - modelli con 5xx mantengono priorita ridotta (score*0.3) e si riabilitano al primo successo
- max_input_tokens in catalog, filtro token, x-force-model, auto-compress
- max_input_tokens in catalog, filtro token in selectModel, x-force-model, auto-compress opt-in
- add context compression and force model
- add utility methods & error handling
- add estimated tokens to model
- add max_input_tokens column
- cooldown proporzionati (24h misconfig, 6h anti-abuse), riconosce bug upstream e reset_seconds, safety provider 30m
- catalog chat-only, lazy registration, provider cooldown su quota o fail ripetuti; fix abort spurio
- auth token su API di controllo e dashboard
- trasforma la dashboard in PWA con service worker, manifest e pulsante di installazione
- aggiunta sincronizzazione dinamica dei modelli da OmniRoute via /v1/models e ottimizzazione selezione bandit
- add granular real-time logging for UCB1 evaluation, scores, rewards, and feedback metrics
- integrate DiscountedUCB1Bandit engine with Zoo Code compatible Zod metadata and Express proxy
### Fix
- update CHANGELOG.md line references to match actual source
- add supports_vision checks in fallback model selection
- use sanitizedModelId for proper error punishment
- improve error pattern matching for model errors
- resolve safeWrite initialization order error
- update log colors and emergency relaxation filter
- add safeWrite helper for client disconnect handling and buffer management
- improve continuity with exponential backoff and emergency relaxation
- optimize error classification and fallback chain reliability
- re-evaluate error classification and punishment system
- update log colors and emergency relaxation filter
- resolve syntax error in dashboard logs
c3805b9 feat(dashboard,proxy): move provider metrics to provider box, add color-coded log filters, fix session dedup and TDZ errors
ceb474e feat: move provider metrics to providers tab, quantize unified history, fix session deduplication, fix ITPM emergency tier
- resolve emergency cooldown relaxation and vision filtering
- recalculate version numbers and format changelog
- enhanced restart-safe.sh with sudo and facial recognition support
- respect ignoreTokenLimit flag in dynamic_max_tokens check
- fix check-nvidia.mjs double database connection bug
- emergency relaxation ignores already_tried and non_chat_model_excluded
ded55a2 feat(src): fix error classification
- correggi priorità systemd system prima di user in restart-safe.sh
- model sanitization validation, error classification improvements, and provider cooldown fixes
- clear cooldown_until on successful requests in recordFeedback()
- remove duplicate isHardError variable declaration causing service startup crash
- universal provider_cooldown rejections - fix noteProviderFail error type filtering, reduce maxAttempts, set EXPLOIT_ONLY=false, add provider cooldown reset via health check
- fail fast on model-not-found errors and fix status reporting
- enforce cooldown in bandit emergency relaxation tiers
- prevent model re-selection loop in bandit emergency relaxation
- remove try text from Cronologia Unificata timestamp to resolve column overlap
- prevent connection errors by adding try/catch to chat/completions route handler
- prevent repeated provider errors in bandit model selection
- fix log streaming column alignment, message truncation, and container height
- stop polling /v1/models when models tab is not active
- align numbers, optimize columns, invert unified history order
- align metrics numbers, hide scrollbars, optimize half-screen view
- resolve 'no such column: N' error in getDashboardStats()
- fix log streaming rendering and copy button
- resolve 'source is not defined' unhandled rejection in selectModel function
- resetProvider endpoint now passes provider name correctly
- fix proxy error handling for cfp 502, antigravity 429, and stream retry blocking
- fix totalObservations counter timing and enhance resetGlobalCounters
- resolve model filtering, duplication, and sync issues
- move SO_REUSEPORT option before socket bind to prevent EADDRINUSE on restart
- resolve port 8080 conflicts and improve restart safety
- correct syntax error in src/index.mjs after graceful shutdown changes
- prevent auto-git from skipping production scripts during cleanup
- resolve EADDRINUSE on port 8080 during service restarts
- add ignoreDegraded support to emergency relaxation tier
- reset provider flags to resolve ban/cooldown issues
- correct observations/catalog stats rendering in dashboard
- remove duplicate latency unit from dashboard observations/catalog
- use viewport-based scaling for stats boxes in dashboard
- refine fluid typography scaling for stats boxes
- reset attention flags and add emergency relaxation to bandit logic
- update systemd service paths and update changelog
- ignore vision constraints in emergency relaxation and update catalog vision capabilities
- reset provider cooldown, permanent ban and attention flags for no-think, cfp, xao, xai-oauth, openrouter
- improve error classification, timeout handling, and cleanup unused files
- improve error classification and session affinity logic
- clean duplicate HTML blocks, add top model cooldown/N metrics, expand scrollbar hiding rules
- resolve 6 dashboard issues and restore backward compatibility
- fix timestamp display, consolidate error logging, optimize layout, remove unused scripts and plans
- resolve model double prefix parsing, timestamp/elapsed seconds formatting, trend indicators, degraded model count, session affinity persistence, and observation counting
- resolve false-positive image generation detection
- fix Chat Catalogo and Totali Grezzi statistics discrepancy
- refactor stats container layout and streamline request logging
- add CORS headers and OPTIONS preflight support to resolve Firefox network fetch error
- update nginx static root path and bump service worker cache version for dashboard visibility
- update service worker to use network-first strategy for dashboard and HTML assets
- record and log HTTP 400 errors in middleware and request handler for Zoo proxy
- fix floating action button changelog and developer handlers
- optimize RAM usage, fix tab switching lag and requests tab bugs in public/dashboard.html
9193c6f feat(dashboard): fix syntax errors in public/dashboard.html and update changelog
- harden getMetrics and getDashboardStats with robust try/catch and ignore placeholder tokens for REQUIRE_AUTH
- fix auth placeholder bypass and dashboard stats database resilience
- bypass service worker caching and installation for /v1/ API endpoints
- refine error handling and ranking in src/bandit.mjs
- resolve dashboard regressions in version display, metrics, logs, and conditional auth
- resolve silent 401 failures and improve token prompting in dashboard
- fix log buffer pointer corruption in ring buffer and restore log streaming
- resolve application version, metrics panel, and log viewer issues
- fix TypeError assignment to constant variable API_TOKEN restoring dashboard functionality
44d5499 feat(dashboard): refine metrics fix and dashboard UI refactoring
9bd064b feat(dashboard): remove Considerazioni tab and integrate selection/discard timeline into Live Logs tab, fix proxy error classification & retry loop, and fix /v1/metrics bug
- handle 401 unauthorized and token prompting for metrics polling
- fix consideration fetch via apiFetch and add 401 handling
- fix dashboard metrics remaining at 0 with null-coalescing and debug logging
- fix sessionKey assignment to constant variable error in src/index.mjs
- include non-chat models in catalog sync, update capability classification, reset rank cache and update metadata
- prevent telegram url parameter mutation and update changelog
- prevent 404 on tab refresh using hash-based routing
- fix streaming retry block by eagerly reading first upstream chunk before sending headers
- optimize RAM and CPU usage by reducing polling frequency and capping log size
- add server-side SPA fallbacks and enhance client-side route synchronization
- prevent image-generation models from being selected for text requests in isModelAvailable
- correct parameter order in selectModel call to prevent image-generation model selection for text requests
- fix image-generation model fallback loop in chat completions
2bad266 feat(bandit): implement round-robin exploration for unvisited models and fix image-generation filtering
- strictly filter out image-generation models and permanently ban 400 capability mismatches
- exclude image-generation models from chat completions and handle 400 bans
- filter out image-generation models for chat completions and make active requests panel scrollable with attempt rows
- exclude image-generation models in emergency last-resort fallback selection and update changelog
- improve model filtering relaxation tiers and fallback passes
- relax tool and token filtering constraints during model selection recovery
- exclude image-generation models from chat completions and tool usage
- classify Playwright browser launch 502 errors as ban-provider
- improve robust handling and cooldown for 413 ITPM / TPM exceeded errors
- improve error recognition for 429 quota and 503 queue timeouts, and enhance dashboard model selection UI
- prevent infinite selection loop on models exceeding ITPM/413 token limits
- robust classification for rate-limit queue timeouts and high-demand 503 errors
d22f56a feat(itpm): configure provider ITPM limits and update changelog for 413 error handling and session affinity fixes
- pre-filter models exceeding provider ITPM quota before UCB1 selection
- prevent zero-cooldown loops on 500 errors and enforce strict tool filtering
- invalidate session affinity on model errors and failures
- prevent selection of cooling down and token-exceeded models
- dynamically extract and persist model token limits from 413 errors
- handle TPM/token limit errors and refine dashboard metrics styling
- resolve CFP browser, Antigravity catalog, and Groq TPM token limit errors
- refine error classification and token limit validation & update docs
- permanent ban and proactive filtering for environment and missing model errors
- fix metrics display, reset buttons, and upstream error classification
- fix session affinity blacklist check and 413/TPM error handling
- improve error classification and session affinity handling for TPM and 413/429 limits
- enable optimistic exploration for unobserved catalog models in selectModel()
- replace recursive compressBody with iterative loop and update changelog
f8ef4f7 chore: fix git-auto-commit command metadata
fc5d495 v1.1.1: API modelli/provider, fix HTML dashboard, CHANGELOG
- migrazione quota + rimuovi needs_attention dal filter
- strip reasoning_details/reasoning_content/reasoning dalle richieste
- 403 Key limit exceeded → cooldown-provider con reset time
- ban-model con UPSERT su models
- fallback non loopa se già tentato o non disponibile
- fallback non loopa se già tentato o non disponibile
- fallback non loopa se già tentato o non disponibile
- selectModel carica anche i modelli permanent=1
- isModelAvailable controlla permanent e degraded
- estrai la riga data: che contiene "error" (non il keepalive)
- 410 model-shutdown ban + SSE error propaga status
- _classifyError riconosce 502 'CLI not found' / 'not configured'
- log raw SSE error per diagnosi gemini/mistral
- _classifyError riconosce 'unknown provider' e 'no longer available'
- needs_attention non blocca, solo cooldown_until
- getModelMaxInput usa dynamic_max_tokens per models
- selectModel con 5 argomenti (rimosso null legacy)
- getUnhealthyModels args, unlock reset needs_attention
- improves affinity loop diagnostics
- ignores failed write calls
- compresses oversized requests
- cooldown simmetrico provider+modelli, soft/hard, no loop unlock
- unlock simmetrico provider+modelli, soft/hard cooldown
- migrazione dynamic_max_tokens fuori dal blocco is_paid
- struggling detection solo sull'ultimo tool_result
- aggiunto header x-source: training
- gestione errori provider saturi, timeout proporzionale, summarizer TPM
- esclude FIM models dal pool tool-capable (diff imprecisi)
- rimuove tools dal body per summarization (no più tool_calls su condense)
- non richiede tool_calls per richieste di summarization
- rimosso reference a model out-of-scope in validateStreamAccumulated
- rimuove if(stream) duplicato; fix accumulated->raw; log 503; auto-compress per-model
- stima token ÷4 (JSON) per supportare contesti 100k+
- distingue demo-limit da input-too-long (cfp flag-provider)
- ripristina hasCatalogIsFree + supports_tools popolato dal payload
- rimuove graffa di troppo in _classifyError; riconosce prompt-too-long
- riconosce 'run out of usage' come errore (non premia la risposta)
- rimuove else duplicato e righe irraggiungibili dopo continue
- success rate invece di avg tentativi; top model mostra avg
- avg tentativi invece di successo %; fix(bandit): vLLM tool_choice → ban-model
- key-quota-exceeded → cooldown solo paid, free restano attivi
- Key limit exceeded → flag-provider (non banna ogni modello)
893406c feat(metrics): summary aggregato (attivi, reward, latenza, free, topModel); fix cooldown provider spurio
- theme-color coerente + fix training (timeout no-skip-provider, exclude pattern)
- rimuove filtro cooldown da loadModels (il proxy lo gestisce); EXCLUDE_PROVIDERS e circuit-breaker 404
- 403 model-level non banna più l'intero provider; il daemon salta i modelli in timeout nel ciclo corrente
- validation error → ban-model invece di rate-limit
- _flagProviderAttention ora imposta correttamente il flag (era invertito)
- isModelAvailable filtra anche cooldown modello e provider
- daemon salta tutti i modelli di un provider dopo primo 404
- provider granulare per ID senza slash (evita che un modello rotto banni l'intero gruppo default)
- hard-fail su x-force-model non disponibile, skip :batch/tts/lyria nel daemon
6c4a774 chore: forza LF, fix auto-registrazione modelli forzati, script eseguibili
- recordFeedback auto-registra modelli non presenti (fix training daemon via x-force-model)
- ban permanente modello dopo 3 errori transitori consecutivi (soglia 5xx)
- isModelAvailable accetta un solo parametro SQL
- 5xx su modello non uccide più l'intero provider; aggiunto pattern 402 payment
- script completo, valori numerici normalizzati, banner 401 non distruttivo
1628691 feat(bandit): catalog chat-only, lazy registration, provider cooldown su quota o fail ripetuti; fix abort spurio
- no-cache HTML, rimozione onclick inline residui, fetchLogs robusto a 401
- add AbortController timeout, client disconnect handler (499), and immediate bandit fallback
### Changed
899966a Remove project-local auto-git.md (moved to global)
- hard-exclude dva for vision, change 402/403 non-resetting quota to 24h cooldown
8fc2c3b Fix dynamic_max_tokens bug and dashboard polling; reset corrupted model limits
d46244d Refine image generation detection in src/index.mjs to eliminate false positives on chat completions
4063f15 Fix dashboard reset button, request logging, and 400 validation errors
- optimize DOM reflow, debouncing, memory management, and sanitization
- optimize RAM usage via consolidated polling and DOM patching
- refine model selection relaxation tiers and optimize debug logging
b40ec94 Add image generation request check and NULL capability guard
- generalize installation paths and improve script path resolution
- enhance dashboard, quota checks, bandit reliability and operational scripts
- reorganize git-auto-commit skill and command files
- API modelli/provider, fix HTML dashboard, CHANGELOG
- abbozzo sistema quota provider (non integrato)
- c6483bd di nuovo rotto, ripristino 57697e2
- 98a9fe5 rompeva la sintassi
- info N/avg/trend, ranking, distinzione zoo/training
b9486e7 Migrazione a ES modules (.mjs), nuova dashboard e icon set PWA
83d200f Add provider-level health tracking, exponential cooldown, and n+1 rotation pointer with updated dashboard UI
a090a6e Add live proxy logs and precise cooldown countdown to the dashboard
a9250ec Fix dashboard binding on 127.0.0.1 and stabilize Bandit proxy error handling


# Changelog

All notable changes to OmniRoute Bandit Proxy will be documented in this file.

The format is based on [Keep a Changelog v1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.16.0] - 2026-11-04

### Added

- **Bandit**: Aggressive 3-strike punishment system for critical failures
  - Added `consecutive_critical_failures` column for tracking critical error sequences
  - New `_isCriticalFailure()` method classifies 403, 429, timeout, and safeWrite errors as critical
  - Permanent ban after 3 consecutive critical failures
  - Counter resets to 0 on successful requests
  - Database migration for existing schema

- **Bandit**: Exponential backoff for consecutive failures
  - Cooldown progression: 15s → 5m → 30m → 2h → permanent ban after 5+ failures
  - Added `total_failures` tracking per model with cap at 50
  - Emergency relaxation now respects cooldown bans
  - Consecutive 5xx counter resets on successful request

- **Bandit**: SafeWrite initialization error pattern mapping
  - Pattern matches: "safeWrite|cannot access safeWrite|safeWrite before initialization|safeWrite is not initialized" → ban-model scope

### Changed

- **Proxy**: Added `supports_vision` checks in fallback model selection paths
  - Session affinity pinning checks vision support before using pinned models
  - Fallback Pass 1: Filters non-vision models when vision required
  - Fallback Pass 2: Maintains vision check while relaxing tool requirements
  - Fallback Pass 3: Vision check in emergency tier
  - Fallback Pass 4: Vision check in absolute last resort
  - Updated error logging to include `requireVision` flag

- **Dashboard**: Adjusted table dimensions and column widths
  - Unified Chronology table height: 110px → 114px with line-height: 1.2 for improved readability
  - Column widths: Error Type 8%→12%, Countermeasure 8%→14%, Reason 40%→30%
  - Removed provider prefix from model names in selection history for cleaner display

### Fixed

- Various bug fixes and improvements as documented in previous versions

## [1.14.10] - 2026-11-03

### Added

- **Dashboard**: Enhanced Unified Chronology panel with per-model selection history
  - Each model considered during bandit selection has its own row with timestamp, provider, model, status, error type, countermeasure, and reason
  - Table height increased from 84px to 280px with scrollbar to remove empty space
  - Added "Show selection history" checkbox for toggle visibility
  - Real-time active model info shows duration (e.g., "🟢 ACTIVE 12.3s") with green background
  - Historical rows show discarded models with rejection reasons (tier_min_score, health, max_retries, etc.) with red background

- **Bandit**: Added `bypassCooldown` parameter to `isModelAvailable()` for fallback chain reliability
  - Fallback chain now bypasses cooldown checks while respecting permanent bans and degraded models
  - Emergency relaxation preserves `ignorePermanent: false` and `ignoreDegraded: false` to avoid routing to broken models
  - Last resort no longer filters by cooldown since emergency mode has already attempted

- **Bandit**: Implemented exponential backoff for 5xx/SSE errors
  - Cooldown formula: `min(15s * 2^fails, 5m)`

### Fixed

- **Bandit**: Improved error classification for stream/keepalive/connection in `_classifyError()`
  - Extended 5xx handling to include stream/chunk/keepalive/connection related errors
  - Reduced cooldown from 30s to 15s for stream/server transient errors
  - Added null guard for error classification to prevent crashes
  - Relaxed emergency mode for improved service continuity
  - Enabled provider-level quota checking in emergency mode

- **Dashboard**: Adjusted table dimensions and column widths

## [1.15.0] - 2026-11-04

### Added

- First release with 3-strike system and exponential backoff

## [1.14.0] - 2026-10-XX

### Changed

- Version update via auto-git workflow

## [1.13.0] - 2026-10-XX

### Changed

- Cleanup, standardization, version bump

## [1.12.0] - 2026-10-XX

### Changed

- Version update and documentation

## [1.11.0] - 2026-10-XX

### Changed

- Version update and documentation

## [1.1.0] - 2026-10-XX

### Added

- First release with model/api endpoints and provider quota system

### Changed

- Provider-level quota system implemented

## [1.0.0] - 2026-10-30

### Added

- Initial main release

---

## Version History

For complete version history prior to v1.0.0, see the [git history](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commits/main/CHANGELOG.md) or commit files.

## Contributing

This changelog is automatically generated by the `auto-git` workflow. For significant changes, consult the [git history](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commits/main/CHANGELOG.md) or commit files.
