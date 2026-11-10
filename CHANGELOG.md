# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog v1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

## [1.28.17] - 2026-11-10

### Fixed
- fix(dashboard): isolate filtered metrics from global dashboard stats
- fix(dashboard): synchronize global metrics across all dashboard tabs
- fix(log-filtering): correct regex patterns for log entry type detection
- fix(dashboard): refresh main metrics when switching tabs
- fix: database fallback for recent requests when in-memory buffer is empty

## [1.28.16] - 2026-11-09

### Fixed
- fix: correct typo in ESM __filename polyfill (__filename__ -> __filename)

### Changed
- chore(gitignore): retain raw_git_log.txt for workflow compliance

## [1.28.15] - 2026-11-09

### Fixed
- fix(bandit): correct totalObservations undefined error in getDashboardStats

## [1.28.14] - 2026-11-08

### Fixed
- fix(bandit): update log colors and emergency relaxation filter
- fix(dashboard): reduce unified chronology table height and remove bottom margin
- fix(dashboard): fix updateStat hoisting reference error in stats polling loop
- fix(dashboard): fix dashboard model metrics display and update version to 1.28.7

## [1.28.13] - 2026-11-08

### Added
- feat(punishment): add 3-strike rule, event system, and training feedback metrics

### Changed
- chore(changelog): format changelog entries for test suite compliance

## [1.28.10] - 2026-11-08

### Fixed
- fix(auto-git): execute workflow documentation and versioning updates for v1.28.11
- fix(train): automatically flag models returning 404 as permanent=1 in training daemon and update docs/changelog
- fix(training): track persistent 404 model errors and auto-mark permanent in train-daemon

### Changed
- chore(release): release v1.28.15 - update documentation, changelog and dashboard

## [1.28.9] - 2026-11-08

### Added
- feat(dashboard): optimize models & train tab layout and sanitize model names
- feat(proxy): enhance runtime error classification, fallback routing, and health check validation
- feat(dashboard): optimize frontend dashboard reactivity, debouncing, AbortController request management, and visibility checks

### Fixed
- fix(bandit): classify 503 Playwright and Cloudflare Playground errors as provider cooldown
- fix(dashboard): synchronize models view with dashboard metric boxes
- fix(dashboard): fix collapse behavior and metric filtering synchronization

## [1.28.8] - 2026-11-07

### Changed
- feat(dashboard): release v1.28.6 - collapsible train providers, helper text removal, script output visibility, model metrics fix
- feat(dashboard): release v1.28.5 - dashboard enhancements, changelog modal, unified history badges, and daemon stability

## [1.28.7] - 2026-11-07

### Fixed
- fix(training): keep status active during inter-cycle pauses and extend daemon liveness tolerance
- fix(bandit): improve error classification, timeout handling, and cleanup unused files
- fix(bandit,index): improve error classification and session affinity logic

## [1.28.6] - 2026-11-07

### Added
- feat(dashboard): implement comprehensive dashboard improvements and bug fixes

### Fixed
- fix(dashboard): fix provider expansion/collapse in Models tab
- fix(dashboard): correct flatMode variable usage in renderAll function
- fix(bandit): resolve SQL catalog insertion parameter mismatch and apply dashboard UI refinements

## [1.28.5] - 2026-11-07

### Added
- feat(dashboard): enhance Models tab capabilities and UI layout
- feat(dashboard): add real-time training status polling and scripts tab navigation

### Fixed
- fix(train-daemon): sync updateTrainingStatus() with proper error handling
- fix(sql): resolve parameter count mismatch in updateTrainingStatus()
- fix(bandit): add AbortController timeout and offline fallback to catalog sync

## [1.28.4] - 2026-11-06

### Changed
- fix(bandit): optimize error classification and fallback chain reliability
- feat(bandit): emergency relaxation and fallback chain improvements
- feat(bandit): implement exponential backoff cooldowns and total_failures tracking for consecutive 5xx errors

### Fixed
- fix(dashboard): fix syntax error in renderAll() if/else structure
- fix(dashboard): resolve 'page not responding' with chunked rendering and debounced polling
- fix(dashboard): synchronize global metrics across all dashboard tabs

## [1.28.3] - 2026-11-06

### Fixed
- fix(dashboard): correct indentation and syntax in public/dashboard.html
- fix(dashboard): resolve SyntaxError and ReferenceError in dashboard.html
- fix(proxy): prevent connection errors by adding try/catch to chat/completions route handler

### Changed
- chore(release): v1.28.3 - robust error handling, toast notifications, restart-safe improvements

## [1.28.2] - 2026-11-05

### Changed
- chore: bump version to 1.28.2 and suppress train models logging when inactive

## [1.28.1] - 2026-11-04

### Fixed
- fix(dashboard): fix timestamp display, consolidate error logging, optimize layout, remove unused scripts and plans

## [1.28.0] - 2026-11-02

### Fixed
- fix(proxy): resolve model double prefix parsing, timestamp/elapsed seconds formatting, trend indicators, degraded model count

## [1.27.2] - 2026-11-02

### Changed
- feat(release): bump version to v1.27.2, synchronize models_train during catalog sync, refine training daemon status and dashboard UI

## [1.27.1] - 2026-11-02

### Fixed
- feat(release): bump version to v1.27.1, synchronize models_train during catalog sync to fix GET /v1/models?source=train results=0

## [1.27.0] - 2026-11-01

### Changed
- feat(release): bump version to v1.27.0, fix training feedback for models_train and optimize scripts manager table column widths

## [1.26.0] - 2026-10-31

### Changed
- feat(release): bump version to v1.26.0 and update changelog and dashboard UI refinements

## [1.25.0] - 2026-10-30

### Changed
- chore: bump version to v1.25.0
- style(dashboard): refine Scripts Manager running badge logic

## [1.24.4] - 2026-10-30

### Added
- feat(dashboard): refactor Train tab, optimize filters, responsive scripts manager, and training status heartbeat timeout
- feat(dashboard): enhance Models tab capabilities and UI layout

### Fixed
- fix(dashboard): fix provider expansion/collapse in Models tab
- fix(dashboard): correct flatMode variable usage in renderAll function
- fix(models): resolve 5 UI/UX issues in Models tab

## [1.24.2] - 2026-10-29

### Added
- feat(dashboard): comprehensive dashboard improvements and bug fixes

### Fixed
- fix(dashboard): add tooltip to Quota reset column and standardize Reset Model button labels
- fix(dashboard): fix provider expand/collapse and half-screen responsive table columns
- fix(dashboard): resolve column overlap in Cronologia Unificata table

## [1.1.90] - 2026-10-30

### Fixed
- fix: model sanitization validation, error classification improvements, and provider cooldown fixes
- fix: clear cooldown_until on successful requests in recordFeedback()
- fix: remove duplicate isHardError variable declaration causing service startup crash
- fix: universal provider_cooldown rejections - fix noteProviderFail error type filtering, reduce maxAttempts, set EXPLOIT_ONLY=false, add provider cooldown reset via health check
- fix(proxy): fail fast on model-not-found errors and fix status reporting

## [1.1.85] - 2026-10-29

### Fixed
- fix(dashboard): remove try text from Cronologia Unificata timestamp to resolve column overlap
- fix(dashboard): prevent connection errors by adding try/catch to chat/completions route handler
- fix(dashboard): stop polling /v1/models when models tab is not active
- fix(dashboard): fix template literal syntax error in fmtRow return

### Added
- fix(bandit-proxy): add auto-git workflow and cleanup test files

## [1.1.80] - 2026-10-28

### Fixed
- fix(dashboard): align numbers, optimize columns, invert unified history order
- fix(dashboard): align metrics numbers, hide scrollbars, optimize half-screen view
- fix: resolve 'no such column: N' error in getDashboardStats()
- fix: CSS overlap fix for 'Osservazioni OK' in dashboard stats (display: inline-flex with gap)
- fix(dashboard): fix log streaming rendering and copy button

### Added
- feat(bandit-proxy): add robust error classification and metrics dashboard

## [1.1.75] - 2026-10-27

### Fixed
- fix(dashboard): correct indentation and syntax errors in public/dashboard.html
- fix(proxy): fix streaming retry block by eagerly reading first upstream chunk before sending headers
- fix(bandit): prevent image-generation models from being selected for text requests in isModelAvailable

## [1.1.70] - 2026-10-26

### Fixed
- fix(bandit): exclude image-generation models from chat completions and tool usage
- fix(bandit): strictly filter out image-generation models and permanently ban 400 capability mismatches
- fix(proxy): add SPA fallback route for non-API requests

### Added
- feat(bandit): implement model categorization and capability filtering
- feat(proxy): add image generation request detection and conversion helpers

## [1.1.60] - 2026-10-25

### Fixed
- fix(bandit): prevent infinite selection loop on models exceeding ITPM/413 token limits
- fix(bandit): dynamically extract and persist model token limits from 413 errors
- fix(bandit): prevent selection of cooling down and token-exceeded models

### Added
- feat(bandit): dynamic_max_tokens appreso dai 413 (self-learning)
- feat(itpm): configure provider ITPM limits and update changelog for 413 error handling

## [1.1.58] - 2026-10-24

### Added
- feat(dashboard): modelli raggruppati per provider con collapse/expand
- feat(dashboard): pannello richieste in-flight (modello, tentativo, tempo)
- feat(training): daemon round-robin con start/stop/status/logs

### Fixed
- fix(bandit): isModelAvailable filtra anche cooldown modello e provider
- fix(dashboard): avg tentativi invece di successo %; fix(bandit): vLLM tool_choice → ban-model

## [1.1.50] - 2026-10-23

### Added
- feat(dashboard): pulsante Blocca modello (permanent=1), cambia in Sblocca se già bannato
- feat(dashboard): modali custom in stile dark (no più alert/confirm nativi)
- feat(bandit): max_input_tokens in catalog, filtro token, x-force-model, auto-compress
- feat(notifier): supporto Telegram con chat_id configurabile
- feat(notifier): webhook Slack/Discord su eventi critici

### Fixed
- fix(bandit): 403 model-level non banna più l'intero provider; il daemon salta i modelli in timeout
- fix(training): rimuove filtro cooldown da loadModels; EXCLUDE_PROVIDERS e circuit-breaker 404

## [1.1.40] - 2026-10-22

### Fixed
- fix(bandit): ripristina hasCatalogIsFree + supports_tools popolato dal payload
- fix(bandit): rimuove graffa di troppo in _classifyError; riconosce prompt-too-long
- fix(proxy): rimuove else duplicato e righe irraggiungibili dopo continue

### Added
- feat(pwa): display_override per nascondere barra del titolo (window-controls-overlay)
- feat(dashboard): pulsante reset contatori globali (richieste + osservazioni)

## [1.1.35] - 2026-10-21

### Fixed
- fix(dashboard): log system non eredita source zoo/train
- fix(index): selectModel con 5 argomenti (rimosso null legacy)
- fix(bandit): getUnhealthyModels args, unlock reset needs_attention

### Added
- test: aggiunge suite di unit test per bandit.mjs (classifyError, selectModel, recordFeedback, meta)

## [1.1.30] - 2026-10-20

### Fixed
- fix(dashboard): aggiunge pulsante Aggiorna Dati mancante
- fix(bandit): 5xx su modello non uccide più l'intero provider; aggiunto pattern 402 payment
- fix(dashboard): rimuove "In corso" duplicato, colonne "In corso" più larghe

### Added
- feat(bandit): dynamic_max_tokens appreso dai 413 (self-learning)

## [1.1.25] - 2026-10-19

### Fixed
- fix(bandit,dashboard): migrazione dynamic_max_tokens fuori dal blocco is_paid
- fix(affinity): struggling detection solo sull'ultimo tool_result
- fix(dashboard): fmtInfo con colonne uniformi (avg=-, new)

### Added
- feat(dashboard): tabella In corso con header e colonne fisse

## [1.1.20] - 2026-10-18

### Fixed
- fix(dashboard): rimuove onclick inline residui, fetchLogs robusto a 401
- fix(bandit): esclude FIM models dal pool tool-capable (diff imprecisi)
- fix(proxy): rimuove reference a model out-of-scope in validateStreamAccumulated

### Added
- feat(proxy): auto-compress per-model invece di max-catalog

## [1.1.15] - 2026-10-17

### Fixed
- fix(proxy): rimuove tools dal body per summarization (no più tool_calls su condense)
- fix(proxy): non richiede tool_calls per richieste di summarization
- fix(bandit): classify Playwright browser launch 502 errors as ban-provider

### Added
- feat(dashboard): script completo pulito con renderAll unificata

## [1.1.10] - 2026-10-16

### Fixed
- fix(scripts): update restart, switch-mode, train-ctl, and train-daemon scripts
- fix(bandit): stima token ÷4 (JSON) per supportare contesti 100k+

### Changed
- chore(scripts): rende eseguibili tutti gli script (bit 755 tracciato in git)

## [1.1.5] - 2026-10-15

### Fixed
- fix(bandit): distingue demo-limit da input-too-long (cfp flag-provider)
- fix(proxy): rimuove if(stream) duplicato; fix accumulated->raw; log 503; auto-compress per-model

### Added
- feat(proxy): auto-compress per-model invece di max-catalog

## [1.1.0] - 2026-10-14

### Added
- feat(backend): endpoint /v1/changelog + file CHANGELOG.md
- feat(dashboard): changelog formattato + badge "nuovo" sul FAB
- feat(dashboard): CSS Grid per riquadro "In corso", badge "test" per N<1
- feat(bandit): add AbortController timeout, client disconnect handler (499), and immediate bandit fallback
- feat(telemetry): add granular real-time logging for UCB1 evaluation, scores, rewards, and feedback metrics

### Changed
- Migrazione a ES modules (.mjs), nuova dashboard e icon set PWA

## [1.0.0] - 2026-10-10

### Added
- Initial stable release
- Multi-Armed Bandit reverse proxy for LLM traffic
- Web-based dashboard for monitoring and control
- Provider and model health tracking
- Session affinity with configurable TTL
- WebSocket support for real-time script output streaming
- Service worker for PWA capabilities

## Version History

[1.28.17]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.16...v1.28.17
[1.28.16]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.15...v1.28.16
[1.28.15]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.14...v1.28.15
[1.28.14]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.13...v1.28.14
[1.28.13]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.12...v1.28.13
[1.28.12]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/1.28.9...v1.28.12
[1.28.11]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.10...v1.28.11
[1.28.10]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.9...v1.28.10
[1.28.9]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.8...v1.28.9
[1.28.8]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.7...v1.28.8
[1.28.7]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.6...v1.28.7