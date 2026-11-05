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

<!-- Version History -->

## Version History

For complete version history prior to 1.19.0, see the [git history](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commits/main/CHANGELOG.md) or commit files.
