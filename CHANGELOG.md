# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/)
and this project adheres to [Semantic Versioning](https://semver.org/) 2.0.0.

## Version History

## [1.28.16] - 2026-11-09

### Added
- Add 3-strike aggressive punishment system for critical failures (403 forbidden, 429 rate limit, timeout, safeWrite errors)
- Add `src/events.mjs` event system module for punishment events
- Add training feedback and metrics test suite

### Changed
- Improve runtime error classification, fallback routing, and health check validation
- Optimize frontend dashboard reactivity, debouncing, AbortController request management, and visibility checks

## [1.28.15] - 2026-11-09

### Changed
- chore(changelog): format changelog entries for test suite compliance
- chore(release): release v1.28.15 - update documentation, changelog and dashboard
- feat(dashboard): optimize models & train tab layout and sanitize model names
- feat(proxy): enhance runtime error classification, fallback routing, and health check validation
- feat(dashboard): optimize frontend dashboard reactivity, debouncing, AbortController request management, and visibility checks
- fix(auto-git): execute workflow documentation and versioning updates for v1.28.11
- fix(train): automatically flag models returning 404 as permanent=1 in training daemon and update docs/changelog
- fix(training): track persistent 404 model errors and auto-mark permanent in train-daemon

## [1.28.14] - 2026-11-08

### Changed
- fix(dashboard): optimize scripts manager table width and auto-activate quick action panel when running

## [1.28.13] - 2026-11-07

### Changed
- chore(release): release v1.28.9 - update changelog, README and system configurations
- fix(bandit): classify 503 Playwright and Cloudflare Playground errors as provider cooldown
- fix(dashboard): synchronize models view with dashboard metric boxes
- fix(dashboard): fix collapse behavior and metric filtering synchronization
- fix(dashboard): fix updateStat hoisting reference error in stats polling loop
- fix(dashboard): fix dashboard model metrics display and update version to 1.28.7

## [1.28.12] - 2026-11-07

### Changed
- feat(dashboard): release v1.28.6 - collapsible train providers, helper text removal, script output visibility, model metrics fix
- feat(dashboard): release v1.28.5 - dashboard enhancements, changelog modal, unified history badges, and daemon stability

## [1.28.11] - 2026-11-07

### Changed
- fix(training): keep status active during inter-cycle pauses and extend daemon liveness tolerance
- chore(git): update .gitignore and include raw git log

## [1.28.10] - 2026-11-07

### Changed
- feat(training): Add live log streaming and fix training status cumulative metrics

## [1.28.9] - 2026-11-07

### Changed
- chore(release): v1.28.3 - robust error handling, toast notifications, restart-safe improvements

## [1.28.8] - 2026-11-07

### Changed
- chore: bump version to 1.28.2 and suppress train models logging when inactive

## [1.28.7] - 2026-11-07

### Changed
- fix(dashboard): add tooltip to Quota reset column and standardize Reset Model button labels

## [1.28.6] - 2026-11-07

### Changed
- fix(dashboard): add tooltip to Quota reset column and standardize Reset Model button labels

## [1.28.5] - 2026-11-07

### Changed
- feat(release): bump version to v1.28.0, update changelog and README, refine dashboard UI and model/provider reset actions

## [1.28.4] - 2026-11-07

### Changed
- feat(release): bump version to v1.27.2, synchronize models_train during catalog sync, refine training daemon status and dashboard UI

## [1.28.3] - 2026-11-07

### Changed
- feat(release): bump version to v1.27.1, synchronize models_train during catalog sync to fix GET /v1/models?source=train results=0

## [1.28.2] - 2026-11-07

### Changed
- feat(release): bump version to v1.27.0, fix training feedback for models_train and optimize scripts manager table column widths

## [1.28.1] - 2026-11-07

### Changed
- feat(release): bump version to v1.27.0, fix training feedback for models_train and optimize scripts manager table column widths

## [1.28.0] - 2026-11-07

### Changed
- feat(dashboard): comprehensive dashboard improvements and bug fixes v1.24.2

## [1.24.4] - 2026-10-31

### Changed
- docs(change): update CHANGELOG.md with dashboard real-time updates
- feat(dashboard): add real-time training status polling and scripts tab navigation

## [1.24.3] - 2026-10-31

### Changed
- chore(release): v1.28.3 - robust error handling, toast notifications, restart-safe improvements

## [1.24.2] - 2026-10-31

### Changed
- docs: normalize CHANGELOG.md formatting and add fix entry

## [1.24.1] - 2026-10-31

### Changed
- fix(bandit): resolve totalObservations undefined error in getDashboardStats

## [1.24.0] - 2026-10-31

### Changed
- chore: update CHANGELOG, README, and version according to Keep a Changelog 1.1.0

## [1.23.0] - 2026-10-31

### Changed
- chore: update CHANGELOG, README, and version to v1.22.0

## [1.22.0] - 2026-10-31

### Changed
- chore: update CHANGELOG, README, and version to v1.21.0

## [1.21.0] - 2026-10-31

### Changed
- fix: update README.md version header to v1.20.0 with proper formatting
- fix: correct version to 1.20.0 for WebSocket feature release
- feat: add WebSocket support for real-time script output streaming

## [1.19.8] - 2026-10-31

### Changed
- chore: update CHANGELOG, README, and version to v1.19.8

## [1.19.7] - 2026-10-31

### Changed
- chore: update CHANGELOG, README, and version to v1.19.7

## [1.19.6] - 2026-10-31

### Changed
- chore: update CHANGELOG, README, and version to v1.19.6

## [1.19.5] - 2026-10-31

### Changed
- chore: update CHANGELOG, README, and version to v1.19.5

## [1.19.4] - 2026-10-31

### Changed
- refactor(auto-git): improve changelog generation to follow Keep a Changelog v1.1.0

## [1.19.3] - 2026-10-30

### Changed
- chore: update CHANGELOG, README, and version to v1.19.3

## [1.19.2] - 2026-10-30

### Changed
- chore: update CHANGELOG, README, and version to 1.19.2

## [1.19.1] - 2026-10-30

### Changed
- chore: update CHANGELOG, README, and version to 1.19.1

## [1.19.0] - 2026-10-30

### Changed
- chore: update CHANGELOG, README, and version to 1.19.0

## [1.18.0] - 2026-10-30

### Changed
- chore: remove project-level auto-git.md, use global version

## [1.17.0] - 2026-10-24

### Changed
- fix(docs): update CHANGELOG.md line references to match actual source

## [1.16.0] - 2026-10-24

### Changed
- feat(bandit): implement aggressive 3-strike punishment system and exponential backoff
- docs: update all mode-specific AGENTS.md with 3-strike system documentation
- docs: update README and AGENTS.md with v1.16.0 and 3-strike system

## [1.15.0] - 2026-10-24

### Changed
- chore(repo): cleanup and documentation update for v1.15.0

## [1.14.10] - 2026-11-03

### Changed
- chore(version): bump to v1.14.10 and update documentation

## [1.14.9] - 2026-11-03

### Changed
- chore(repo): auto-git workflow execution v1.13.14 Repository cleanup, version bump, documentation updates, and project utilities tracking

## [1.14.8] - 2026-11-03

### Changed
- chore: optimize git history and consolidate automation commits - Squash consecutive generic/automated commits (v1.13.6 to v1.13.7 workflow) - Update documentation structure and changelog formatting - Consolidate auto-git workflow updates and version bumps - Update dashboard configuration and project rules - Clean up temporary files and planning artifacts - Update bandit model pruning and README references - Consolidate provider metrics and documentation updates

## [1.14.7] - 2026-11-03

### Changed
- chore(repo): auto-git workflow execution v1.13.14 Repository cleanup, version bump, documentation updates, and project utilities tracking

## [1.14.6] - 2026-11-02

### Changed
- fix(dashboard,bandit): update log colors and emergency relaxation filter

## [1.14.5] - 2026-11-02

### Changed
- fix(dashboard,bandit): update log colors and emergency relaxation filter

## [1.14.4] - 2026-11-02

### Changed
- fix(ui): resolve syntax error in dashboard logs

## [1.14.3] - 2026-11-02

### Changed
- fix(ui): resolve syntax error in dashboard logs

## [1.14.2] - 2026-11-02

### Changed
- feat(ui): add log message expansion to dashboard

## [1.14.1] - 2026-11-02

### Changed
- feat(dashboard,proxy): move provider metrics to provider box, add color-coded log filters, fix session dedup and TDZ errors

## [1.14.0] - 2026-11-02

### Changed
- feat: active events display, metric percentages, unified history row height, and train-daemon functionality

## [1.13.9] - 2026-11-02

### Changed
- chore: bump version to 1.13.9 and update changelog

## [1.13.8] - 2026-11-01

### Changed
- feat: merge training status into top model card

## [1.13.7] - 2026-10-31

### Changed
- chore(docs): auto-git workflow v1.13.7 - cleanup, changelog standardization, version bump

## [1.13.6] - 2026-10-31

### Changed
- chore: bump version to v1.13.6 and update docs

## [1.13.5] - 2026-10-31

### Changed
- docs: update version to v1.13.5 and documentation

## [1.13.4] - 2026-10-30

### Changed
- docs(CHANGELOG,README): update for log-noise reduction feature

## [1.13.3] - 2026-10-30

### Changed
- feat(log-noise): add request throttling and log-noise filtering to reduce console spam and improve polling efficiency
- fix(src): resolve false-positive image generation detection

## [1.13.2] - 2026-10-30

### Changed
- feat(api): implement POST /v1/images/generations endpoint
- fix(dashboard): fix Chat Catalogo and Totali Grezzi statistics discrepancy

## [1.13.1] - 2026-10-29

### Changed
- fix(dashboard,bandit): refactor stats container layout and streamline request logging
- Fix dashboard layout, log table columns, reset counters button, and stats text format
- fix(cors): add CORS headers and OPTIONS preflight support to resolve Firefox network fetch error

## [1.13.0] - 2026-10-29

### Changed
- feat(dashboard): redesign unified panel cronologia operativa & stato ucb1 table
- Refactor dashboard unified panel: flat header, single scrollable row list without double titles or collapsible toggles
- feat(dashboard): unify active requests and ucb1 specchietto into compact scrollable panel
- feat: enhance model selection candidate tracking and consideration history buffer across relaxation tiers
- fix(dashboard): fix floating action button changelog and developer handlers

## [1.12.0] - 2026-10-21

### Changed
- feat(dashboard): capture failing models and 400 errors explicitly in request logs and dashboard specchietto
- Refactor dashboard unified panel: flat header, single scrollable row list without double titles or collapsible toggles
- feat(dashboard): redesign unified panel cronologia operativa & stato ucb1 table
- feat(dashboard): unify active requests and ucb1 specchietto into compact scrollable panel
- feat: enhance model selection candidate tracking and consideration history buffer across relaxation tiers
- fix(dashboard): fix floating action button changelog and developer handlers

## [1.11.0] - 2026-10-21

### Changed
- perf(dashboard): optimize DOM reflow, debouncing, memory management, and sanitization
- fix(dashboard): optimize RAM usage, fix tab switching lag and requests tab bugs in public/dashboard.html
- perf(dashboard): optimize RAM usage via consolidated polling and DOM patching

## [1.10.0] - 2026-10-20

### Changed
- fix(dashboard): correct indentation and syntax in public/dashboard.html
- feat(dashboard): fix syntax errors in public/dashboard.html and update changelog
- docs(changelog): update for dashboard refactor
- refactor(dashboard): improve UI efficiency and event handling

## [1.9.0] - 2026-10-20

### Changed
- feat(dashboard): fix syntax errors in public/dashboard.html and update changelog
- docs: update CHANGELOG.md for v1.1.63
- refactor(bandit): refine model selection relaxation tiers and optimize debug logging
- fix(bandit): harden getMetrics and getDashboardStats with robust try/catch and ignore placeholder tokens for REQUIRE_AUTH
- fix(dashboard): bypass service worker caching and installation for /v1/ API endpoints
- fix(dashboard): enhance JSON safety and data rendering in public/dashboard.html
- fix(dashboard): resolve dashboard regressions in version display, metrics, logs, and conditional auth
- fix(dashboard): resolve silent 401 failures and improve token prompting in dashboard
- fix(dashboard): handle authentication 401 errors, token persistence, and auth prompts
- fix(logging): fix log buffer pointer corruption in ring buffer and restore log streaming
- fix(dashboard): resolve application version, metrics panel, and log viewer issues
- fix(dashboard): fix TypeError assignment to constant variable API_TOKEN restoring dashboard functionality

## [1.8.0] - 2026-10-19

### Changed
- feat(dashboard): perform true structural fusion of active requests and selection rejection spec sheet
- feat(dashboard): deeply merge active requests history and selection rejection spec sheet into unified persistent component
- feat(dashboard): refine metrics fix and dashboard UI refactoring

## [1.7.0] - 2026-10-19

### Changed
- feat(dashboard): refine metrics fix and dashboard UI refactoring
- feat(dashboard): deeply merge active requests history and selection rejection spec sheet into unified persistent component
- feat(dashboard): embed chronological selection & discard spec sheet directly inside ⚡ In corso tab
- feat(dashboard): remove Considerazioni tab and integrate selection/discard timeline into Live Logs tab, fix proxy error classification & retry loop, and fix /v1/metrics bug
- feat(dashboard): integrate model evaluation specchietto into top panel

## [1.6.0] - 2026-10-19

### Changed
- feat(dashboard): add color-coded badges to model statistics

## [1.5.0] - 2026-10-18

### Changed
- feat(dashboard): add color-coded badges to model statistics
- feat(dashboard): move Monitorati metric to the left of dashboard summary

## [1.4.0] - 2026-10-17

### Changed
- feat(dashboard): add color-coded badges to model statistics
- feat(dashboard): move Monitorati metric to the left of dashboard summary

## [1.3.0] - 2026-10-15

### Changed
- docs: update CHANGELOG.md for v1.1.8
- refactor: generalize installation paths and improve script path resolution
- fix(bandit): enable optimistic exploration for unobserved catalog models in selectModel()

## [1.2.0] - 2026-10-14

### Changed
- feat: enhance multi-armed bandit proxy routing, error classification, and metrics dashboard
- chore: clean up temporary test scripts, artifacts and auto-git script

## [1.1.90] - 2026-10-14

### Changed
- chore: clean up artifacts, update dashboard stats verification, and update changelog
- feat: clean up unused skill scripts, add update_changelog custom tool, and update CHANGELOG.md
- feat: enhance bandit routing, health checks, retry handling, and add comprehensive test suite

## [1.1.89] - 2026-10-13

### Changed
- fix: resolve git-utils.sh merge conflicts and syntax errors
- test: add test file for git-auto-commit
- ci(scripts): git-utils.sh

## [1.1.88] - 2026-10-13

### Changed
- Merge branch 'main' of https://github.com/CherrugDeveloper/omniroute-bandit-proxy
- ci(scripts): git-utils.sh
- test(test_debug.txt ): test_debug.txt
- test: message

## [1.1.87] - 2026-10-12

### Changed
- ci:scripts: fix auto-squash unbound variable error
- ci:git-auto-commit: git-auto-commit.sh
- docs:git-utils.sh scripts: wrapper-test.sh

## [1.1.86] - 2026-10-12

### Changed
- ci:scripts: git-utils.sh

## [1.1.85] - 2026-10-12

### Changed
- ci:scripts: git-utils.sh

## [1.1.84] - 2026-10-12

### Changed
- ci:scripts: git-utils.sh

## [1.1.83] - 2026-10-12

### Changed
- ci:scripts: git-utils.sh

## [1.1.82] - 2026-10-12

### Changed
- ci:scripts: git-utils.sh

## [1.1.81] - 2026-10-12

### Changed
- ci:git-auto-commit: git-auto-commit.sh

## [1.1.80] - 2026-10-11

### Changed
- chore(git-auto-commit): add GIT_AUTO_COMMIT_WSL_EXEC environment variable support
- chore: optimize git-auto-commit script

## [1.1.79] - 2026-10-11

### Changed
- docs:.roo: .env.example

## [1.1.78] - 2026-10-10

### Changed
- chore: add GIT_AUTO_COMMIT_WSL_EXEC to documentation
- chore: fix git-auto-commit command metadata

## [1.1.77] - 2026-10-10

### Changed
- ci:scripts: git-auto-commit.sh

## [1.1.76] - 2026-10-10

### Changed
- chore: sync local branch with remote and cleanup files

## [1.1.75] - 2026-10-10

### Changed
- v1.1.1: API modelli/provider, fix HTML dashboard, CHANGELOG
- feat: provider quota system - dashboard table, needs_attention filter, CHANGELOG v1.1.0
- feat: provider quota system - dashboard table, needs_attention filter, CHANGELOG v1.1.0
- fix(bandit): migrazione quota + rimuovi needs_attention dal filter
- fix(index): strip reasoning_details/reasoning_content/reasoning dalle richieste
- fix(bandit): 403 Key limit exceeded → cooldown-provider con reset time
- wip(quota): abbozzo sistema quota provider (non integrato)
- chore(scripts): train-ctl.sh eseguibile
- fix(bandit): ban-model con UPSERT su models
- fix(index): fallback non loopa se già tentato o non disponibile
- revert(index): c6483bd di nuovo rotto, ripristino 57697e2
- fix(index): fallback non loopa se già tentato o non disponibile
- revert(index): 98a9fe5 rompeva la sintassi
- fix(index): fallback non loopa se già tentato o non disponibile

## [1.1.1] - 2026-10-10

### Changed
- fix(bandit): _classifyError riconosce 502 'CLI not found' / 'not configured'
- fix(index): log raw SSE error per diagnosi gemini/mistral
- fix(bandit): _classifyError riconosce 'unknown provider' e 'no longer available'
- fix(bandit): needs_attention non blocca, solo cooldown_until
- fix(bandit): getModelMaxInput usa dynamic_max_tokens per models
- docs: AGENTS.md per agenti AI (Roo, Zoo, ecc.)
- chore(gitignore): ignore training.log.old, analysis reports
- chore: Roo rules + utility scripts (check-db, clean-cjs, verify-server)
- fix(index): selectModel con 5 argomenti (rimosso null legacy)
- fix(bandit): getUnhealthyModels args, unlock reset needs_attention
- test: final verification
- test:scripts: git-utils.sh
- test:test13.txt: git-auto-commit.sh
- test:test12.txt: git-auto-commit.sh
- test:test11.txt: git-auto-commit.sh
- test:test9.txt: git-auto-commit.sh
- test:test7.txt: git-auto-commit.sh
- test:test6.txt: git-auto-commit.sh
- test:test5.txt: git-auto-commit.sh
- test:test4.txt: git-auto-commit.sh
- test:test3.txt: git-auto-commit.sh
- test:test2.txt: git-auto-commit.sh
- test:test.txt: test.txt
- ci:scripts: git-utils.sh
- ci:scripts: git-utils.sh
- docs:.roo: git-auto-commit.md

## [1.1.0] - 2026-10-06

### Added
- chore(.gitignore): add venv/ to gitignore and update linting rules
- test(bandit): adds rate-limit fallback coverage
- fix(index): improves affinity loop diagnostics

### Changed
- feat(bandit): handles 429 retries with fallback
- feat(dashboard): adds debug log filtering
- fix(tools): ignores failed write calls
- fix(context): compresses oversized requests
- chore(scripts): updates control scripts
- fix(bandit): cooldown simmetrico provider+modelli, soft/hard, no loop unlock
- fix(bandit): unlock simmetrico provider+modelli, soft/hard cooldown
- feat(bandit+dashboard): reward per tool, loop detection, orchestrator→reasoning
- feat(dashboard): checkbox ZOO/TRAIN unificate (log + In corso)
- fix(dashboard): rimuove "In corso" duplicato, colonne "In corso" più larghe
- feat(bandit): dynamic_max_tokens appreso dai 413 (self-learning)
- fix(affinity): struggling detection solo sull'ultimo tool_result
- fix(dashboard): fmtInfo con colonne uniformi (avg=-, new)
- feat(dashboard): tabella In corso con header e colonne fisse
- feat(bandit): dynamic_max_tokens appreso dai 413 (self-learning)
- fix(dashboard): rimuove "In corso" duplicato, colonne "In corso" più larghe
- feat(dashboard): tabella In corso con header e colonne fisse
- feat: low TPM filter, unpin 413, new models badge, training exclude
- fix(dashboard): padding-top per PWA window-controls-overlay
- feat(dashboard+bandit): rank modello, trend, esclusione health check
- wip: info N/avg/trend, ranking, distinzione zoo/training
- fix: gestione errori provider saturi, timeout proporzionale, summarizer TPM
- feat: session affinity, mode routing, training isolation, debug toggle
- chore(scripts): rende eseguibili tutti gli script (bit 755 tracciato in git)
- chore(scripts): update restart, switch-mode, train-ctl, and train-daemon scripts
- fix(bandit): esclude FIM models dal pool tool-capable (diff imprecisi)
- fix(proxy): rimuove tools dal body per summarization (no più tool_calls su condense)
- fix(proxy): non richiede tool_calls per richieste di summarization
- fix(proxy): rimosso reference a model out-of-scope in validateStreamAccumulated
- fix(proxy): rimuove if(stream) duplicato; fix accumulated->raw; log 503; auto-compress per-model
- feat(proxy): auto-compress per-model invece di max-catalog
- chore(scripts): restart.sh con feedback log su stdout
- feat(bandit): stima token ÷4 (JSON) per supportare contesti 100k+
- fix(bandit): distingue demo-limit da input-too-long (cfp flag-provider)
- feat(bandit): ripristina hasCatalogIsFree + supports_tools popolato dal payload
- fix(bandit): rimuove graffa di troppo in _classifyError; riconosce prompt-too-long
- feat(dashboard): pulsante Blocca modello (permanent=1), cambia in Sblocca se già bannato
- feat(dashboard): modali custom in stile dark (no più alert/confirm nativi)
- fix(proxy): riconosce 'run out of usage' come errore (non premia la risposta)
- fix(dashboard): script completo pulito con renderAll unificata
- feat(dashboard): modelli raggruppati per provider con collapse/expand
- feat(dashboard): modelli raggruppati per provider con collapse/expand
- fix(proxy): rimuove else duplicato e righe irraggiungibili dopo continue
- feat(dashboard): pannello attività sempre visibile (attive + ultime richieste)
- feat(dashboard): successo rate invece di avg tentativi; top model mostra avg
- feat(dashboard): pannello richieste in-flight (modello, tentativo, tempo)
- fix(dashboard): avg tentativi invece di successo %; fix(bandit): vLLM tool_choice → ban-model
- feat(bandit): key-quota-exceeded → cooldown solo paid, free restano attivi
- feat(bandit): Key limit exceeded → flag-provider (non banna ogni modello)
- feat(scripts): modalità train-gentle per training in parallelo all'uso reale
- feat(bandit): EXCLUDE_THINKING + EXPLOIT_ONLY + switch-mode.sh per prod/train
- feat(scripts): switch-mode.sh per alternare prod/train con un comando
- feat(bandit): EXPLOIT_ONLY (solo modelli N>=3) per uso produttivo <2s

## [1.0.0] - 2026-10-01

### Added
- feat(dashboard): indicatore tasso di successo accanto a Osservazioni
- feat(dashboard): colore distinto (viola) per needs_attention vs cooldown (giallo)
- feat(dashboard): auto-refresh 2.5s, layout full-height senza scroll, rimozione colonna cooldown ridondante

### Changed
- test: aggiunge suite di unit test per bandit.mjs (classifyError, selectModel, recordFeedback, meta)
- docs: riscrive README allineata al codice attuale, aggiunge licenza MIT
- fix(bandit): 5xx su modello non uccide più l'intero provider; aggiunto pattern 402 payment
- fix(dashboard): aggiunge pulsante Aggiorna Dati mancante
- chore(log): rimuove middleware access-log duplicato
- fix(dashboard): script completo, valori numerici normalizzati, banner 401 non distruttivo
- feat(bandit): cooldown proporzionati (24h misconfig, 6h anti-abuse), riconosce bug upstream e reset_seconds, safety provider 30m
- feat(bandit): catalog chat-only, lazy registration, provider cooldown su quota o fail ripetuti; fix abort spurio
- feat(telemetry): add granular real-time logging for UCB1 evaluation, scores, rewards, and feedback metrics
- chore: ensure .env and proxy.log are excluded from git
- feat: integrate DiscountedUCB1Bandit engine with Zoo Code compatible Zod metadata and Express proxy