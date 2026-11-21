# Changelog
## Keep a Changelog

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Version History

## [0.53.8] - 2026-11-21
### Removed
- chore(scripts): eliminato `scripts/restart.sh` (obsoleto, race condition su porta 8080)
- chore(scripts): eliminato `scripts/restart-restart.sh` (ridondante, chiama `restart-safe.sh`)

### Fixed
- fix(scripts): `restart-safe.sh` ora effettua un refresh automatico della dashboard dopo il riavvio del backend (curl a `/v1/dashboard/stats`)

### Added
- feat(vscode): creato `.vscode/settings.json` con quick actions per restart, free-port, switch-mode e training
- docs: aggiornato `docs/restart-procedure.md` con note su script rimossi, refresh dashboard e quick actions VS Code

## [0.53.7] - 2026-11-21
### Fixed
- fix(bandit): refined `_classifyError()` to distinguish real "not supported" errors from false positives; added `cascadeGuardSkipCount`/`cascadeGuardApplyCount` counters for monitoring
- fix(bandit): cascade guard logging downgraded from INFO to DEBUG level to reduce log spam
- fix(config): added transient 400 error patterns (validation, bad request, invalid parameter) classified as `cooldown-model` (30s) instead of permanent ban
- fix(test): added structured log capture (STRUCTURED_LOG_LEVEL=debug), console.log spy, and cascade guard counter tests

### Added
- feat(bandit): cascade guard monitoring counters accessible via `bandit.cascadeGuardSkipCount` and `bandit.cascadeGuardApplyCount`
- docs: new `docs/model-not-found-classification-changes.md` documenting the classification refinements

## [0.53.6] - 2026-11-20
### Fixed
- fix(bandit): added _unflagProviderAttention() method to remove needs_attention flag from providers
- fix(bandit): extended _checkRehabilitation() to reset needs_attention after rehabilitation period (48h)
- fix(bandit): added automatic cooldown→config transition for errors requiring user intervention (auth-expired, provider-misconfigured, anti-abuse, safeWrite-init-error, tpm-exceeded)
- fix(health-check): models in config state (needs_attention=1) are now excluded from automatic health check probes
- fix(bandit): added attention_timestamp column to provider_history for tracking config state entry time
### Added
- feat(api): new POST /v1/reset/config endpoint to manually clear config state for all providers
- feat(bandit): _unflagProviderAttention() method for programmatic config state removal

## [0.53.5] - 2026-11-20
### Fixed
- fix(bandit): cascade guard extended with 5 capability-based rejection reasons (non_chat_model_excluded, no_tools_support, max_input_tokens_exceeded, exclude_thinking, dynamic_max_tokens_exceeded) to prevent unnecessary model cooldowns for capability mismatches
### Performance
- perf(dashboard): reduced polling intervals — training status 3s→15s, refreshAll 5s→10s, fetchLogs/fetchActive 2s→5s
- perf(api): added in-memory caching (5s TTL) for /v1/config/status, /v1/training/status, /v1/training/daemon-status endpoints

## [0.53.3] - 2026-11-19
### Fixed
- fix(bandit): "Model not found in active live catalog" 400 errors now classified as ban-model (PERMANENT) instead of cooldown-model (TRANSIENT); added new pattern to config/bandit.json and made model-not-found errors critical in _isCriticalFailure()
- fix(bandit): cascade guard now skips ALL punishment when provider is already on cooldown/circuit/auth-expired to prevent cascade effect
- fix(bandit): selectModel provider_history query now includes circuit_breaker_until so the circuit breaker cascade guard correctly rejects providers with an open circuit breaker
- fix(dashboard): removed flex-direction: column from #logs-container to fix text disappearing on scroll; verified reverse chronological order already correct

## [0.53.4] - 2026-11-19
### Fixed
- fix(bandit): cascade guard extended to include provider_quota_exhausted and provider_needs_attention to prevent cascade punishments after restart
- fix(bandit): 403 "Key limit exceeded (total limit)" now classified as ban-provider (PERMANENT) instead of cooldown-model (TRANSIENT); added "|total limit" pattern to config/bandit.json permanentErrors
- fix(bandit): fetchAndSyncModels timeout increased from 15s to 30s for initial startup reliability

## [0.53.3] - 2026-09-30
### Fixed
- fix(proxy): add AbortController timeout, client disconnect handler (499), and immediate bandit fallback
- feat: trasforma la dashboard in PWA con service worker, manifest e pulsante di installazione
- feat: aggiunta sincronizzazione dinamica dei modelli da OmniRoute via /v1/models e ottimizzazione selezione bandit
- Add provider-level health tracking, exponential cooldown, and n+1 rotation pointer with updated dashboard UI
- Add live proxy logs and precise cooldown countdown to the dashboard
- Fix dashboard binding on 127.0.0.1 and stabilize Bandit proxy error handling
- chore: ignore sqlite wal and shm files
- feat(telemetry): add granular real-time logging for UCB1 evaluation, scores, rewards, and feedback metrics
- chore: ensure .env and proxy.log are excluded from git
- feat: integrate DiscountedUCB1Bandit engine with Zoo Code compatible Zod metadata and Express proxy

## [0.53.4] - 2026-10-01
### Fixed
- feat(dashboard): indicatore tasso di successo accanto a Osservazioni
- feat(dashboard): colore distinto (viola) per needs_attention vs cooldown (giallo)
- feat(dashboard): auto-refresh 2.5s, layout full-height senza scroll, rimozione colonna cooldown ridondante
- test: aggiunge suite di unit test per bandit.mjs (classifyError, selectModel, recordFeedback, meta)
- docs: riscrive README allineata al codice attuale, aggiunge licenza MIT
- fix(bandit): 5xx su modello non uccide più l'intero provider; aggiunto pattern 402 payment
- fix(dashboard): aggiunge pulsante Aggiorna Dati mancante
- chore(log): rimuove middleware access-log duplicato
- fix(dashboard): script completo, valori numerici normalizzati, banner 401 non distruttivo
- feat(bandit): cooldown proporzionati (24h misconfig, 6h anti-abuse), riconosce bug upstream e reset_seconds, safety provider 30m
- feat(bandit): catalog chat-only, lazy registration, provider cooldown su quota o fail ripetuti; fix abort spurio
- chore(icons): sostituisce icon set con RealFaviconGenerator, aggiorna link e manifest
- fix(dashboard): no-cache HTML, rimozione onclick inline residui, fetchLogs robusto a 401
- feat(security): auth token su API di controllo e dashboard
- Migrazione a ES modules (.mjs), nuova dashboard e icon set PWA

## [0.53.4] - 2026-10-02
### Fixed
- fix(bandit): distingue demo-limit da input-too-long (cfp flag-provider)
- feat(proxy): requireTools penalizza modelli che non chiamano tools
- fix(bandit): ripristina hasCatalogIsFree + supports_tools popolato dal payload
- fix(bandit): rimuove graffa di troppo in _classifyError; riconosce prompt-too-long
- feat(dashboard): pulsante Blocca modello (permanent=1), cambia in Sblocca se già bannato
- feat(dashboard): modali custom in stile dark (no più alert/confirm nativi)
- fix(proxy): riconosce 'run out of usage' come errore (non premia la risposta)
- fix(dashboard): script completo pulito con renderAll unificata
- feat(dashboard): modelli raggruppati per provider con collapse/expand
- feat(dashboard): modelli raggruppati per provider con collapse/expand
- fix(proxy): rimuove else duplicato e righe irraggiungibili dopo continue
- feat(dashboard): pannello attività sempre visibile (attive + ultime richieste)
- fix(dashboard): success rate invece di avg tentativi; top model mostra avg
- feat(dashboard): pannello richieste in-flight (modello, tentativo, tempo)
- fix(dashboard): avg tentativi invece di successo %; fix(bandit): vLLM tool_choice → ban-model
- fix(bandit): key-quota-exceeded → cooldown solo paid, free restano attivi
- fix(bandit): Key limit exceeded → flag-provider (non banna ogni modello)
- feat(scripts): modalità train-gentle per training in parallelo all'uso reale
- feat(bandit): EXCLUDE_THINKING + EXPLOIT_ONLY + switch-mode.sh per prod/train
- feat(scripts): switch-mode.sh per alternare prod/train con un comando
- feat(bandit): EXPLOIT_ONLY (solo modelli N>=3) per uso produttivo <2s
- chore(gitignore): ignora file di backup
- feat(metrics): summary aggregato (attivi, reward, latenza, free, topModel); fix cooldown provider spurio
- fix(pwa): theme-color coerente + fix training (timeout no-skip-provider, exclude pattern)
- feat(pwa): display_override per nascondere barra del titolo (window-controls-overlay)
- feat(dashboard): pulsante reset contatori globali (richieste + osservazioni)
- feat(training): timeout non skippa provider, soglia 5 fail, esclude pattern openrouter problematici
- fix(training): rimuove filtro cooldown da loadModels (il proxy lo gestisce); EXCLUDE_PROVIDERS e circuit-breaker 404
- feat(bandit): free/paid detection, filtri ONLY_FREE/EXCLUDE_PAID, 403 model-level non banna provider, catalogRawCount
- feat(bandit): free/paid detection, filtri ONLY_FREE/EXCLUDE_PAID, is_paid su 402, catalogRawCount
- fix: 403 model-level non banna più l'intero provider; il daemon salta i modelli in timeout nel ciclo corrente
- ui(dashboard): badge DA CONFIGURARE cliccabile apre Cosa fare (rimuove pulsante ridondante)
- feat(notifier): supporto Telegram con chat_id configurabile
- feat(notifier): webhook Slack/Discord su eventi critici
- fix(bandit): validation error → ban-model invece di rate-limit
- feat(dashboard): modale Cosa fare con pulsante copia (rimuove alert non copiabile)
- fix(bandit): _flagProviderAttention ora imposta correttamente il flag (era invertito)
- fix(bandit): isModelAvailable filtra anche cooldown modello e provider
- fix(training): daemon salta tutti i modelli di un provider dopo primo 404
- fix(dashboard): messaggio più chiaro quando attention_message è vuoto
- feat(dashboard): pulsante Cosa fare sui provider needs_attention con istruzioni contestuali
- fix(bandit): provider granulare per ID senza slash (evita che un modello rotto banni l'intero gruppo default)
- fix(training): hard-fail su x-force-model non disponibile, skip :batch/tts/lyria nel daemon
- chore: forza LF, fix auto-registrazione modelli forzati, script eseguibili
- fix(bandit): recordFeedback auto-registra modelli non presenti (fix training daemon via x-force-model)
- chore(gitignore): ignora file temporanei SQLite
- feat(bandit): degraded mode (score*0.3), auto-riabilitazione, catalogRawCount in metrics
- chore(env): documenta variabili HEALTH_CHECK_*
- feat(bandit): degraded mode - modelli con 5xx mantengono priorita ridotta (score*0.3) e si riabilitano al primo successo
- fix(bandit): ban permanente modello dopo 3 errori transitori consecutivi (soglia 5xx)
- fix(bandit): isModelAvailable accetta un solo parametro SQL
- feat(bandit): max_input_tokens in catalog, filtro token, x-force-model, auto-compress
- feat(dashboard): contatori needs_attention, colore viola, tasso di successo
- chore(training): aggiunge demone round-robin con start/stop/status/logs

## [0.53.4] - 2026-10-03
### Fixed
- chore(scripts): rende eseguibili tutti gli script (bit 755 tracciato in git)
- chore(scripts): update restart, switch-mode, train-ctl, and train-daemon scripts
- fix(bandit): esclude FIM models dal pool tool-capable (diff imprecisi)
- fix(proxy): rimuove tools dal body per summarization (no più tool_calls su condense)
- fix(proxy): non richiede tool_calls per richieste di summarization
- fix(proxy): rimosso reference a model out-of-scope in validateStreamAccumulated
- fix(proxy): rimuove if(stream) duplicato; fix accumulated->raw; log 503; auto-compress per-model
- feat(proxy): auto-compress per-model invece di max-catalog
- chore(scripts): restart.sh con feedback log su stdout
- fix(bandit): stima token ÷4 (JSON) per supportare contesti 100k+

## [0.53.4] - 2026-10-04
### Fixed
- feat(backend): endpoint /v1/changelog + file CHANGELOG.md
- feat(dashboard): changelog formattato + badge "nuovo" sul FAB
- fix(train-daemon): aggiunto header x-source: training
- feat(dashboard): CSS Grid per riquadro "In corso", badge "test" per N<1
- fix(dashboard): dev-card con DOMContentLoaded, scroll tab Modalità
- fix(dashboard): rimosso script duplicato dev-card (listener doppi)
- feat: low TPM filter, unpin 413, new models badge, training exclude
- fix(dashboard): padding-top per PWA window-controls-overlay
- feat(dashboard+bandit): rank modello, trend, esclusione health check
- wip: info N/avg/trend, ranking, distinzione zoo/training
- fix: gestione errori provider saturi, timeout proporzionale, summarizer TPM
- feat: session affinity, mode routing, training isolation, debug toggle

## [0.53.4] - 2026-10-05
### Fixed
- fix(dashboard): rimuove "In corso" duplicato, colonne "In corso" più larghe
- fix(bandit+dashboard): migrazione dynamic_max_tokens fuori dal blocco is_paid
- feat(dashboard): tabella In corso con header e colonne fisse
- feat(bandit): dynamic_max_tokens appreso dai 413 (self-learning)
- fix(affinity): struggling detection solo sull'ultimo tool_result
- fix(dashboard): fmtInfo con colonne uniformi (avg=-, new)

## [0.53.4] - 2026-10-06
### Fixed
- chore(.gitignore): add venv/ to gitignore and update linting rules
- chore:
- test(bandit): adds rate-limit fallback coverage
- fix(index): improves affinity loop diagnostics
- feat(bandit): handles 429 retries with fallback
- feat(dashboard): adds debug log filtering
- fix(tools): ignores failed write calls
- fix(context): compresses oversized requests
- chore(scripts): updates control scripts
- fix(bandit): cooldown simmetrico provider+modelli, soft/hard, no loop unlock
- fix(bandit): unlock simmetrico provider+modelli, soft/hard cooldown
- feat(bandit+dashboard): reward per tool, loop detection, orchestrator→reasoning
- feat(dashboard): checkbox ZOO/TRAIN unificate (log + In corso)

## [0.53.4] - 2026-10-09
### Fixed
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
- test:scripts: git-utils.sh
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

## [0.53.4] - 2026-10-10
### Fixed
- chore: add GIT_AUTO_COMMIT_WSL_EXEC to documentation
- chore: fix git-auto-commit command metadata
- ci:scripts: git-auto-commit.sh
- chore: sync local branch with remote and cleanup files
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
- fix(bandit): selectModel carica anche i modelli permanent=1
- fix(bandit): isModelAvailable controlla permanent e degraded
- fix(index): estrai la riga data: che contiene "error" (non il keepalive)
- fix(bandit,index): 410 model-shutdown ban + SSE error propaga status
- fix(dashboard): aggiunge graffa mancante else if SYSTEM_LINE_RE
- chore: normalizza line ending (LF forzato per tutti i text file)
- fix(dashboard): log system non ereditano source zoo/train

## [0.53.4] - 2026-10-11
### Fixed
- chore(git-auto-commit): add GIT_AUTO_COMMIT_WSL_EXEC environment variable support
- chore: optimize git-auto-commit script
- docs:.roo: .env.example

## [0.53.4] - 2026-10-12
### Fixed
- ci:scripts: fix auto-squash unbound variable error
- ci:git-auto-commit: git-auto-commit.sh
- docs:git-utils.sh scripts: wrapper-test.sh
- ci:scripts: git-utils.sh
- ci:scripts: fix auto-squash unbound variable error
- ci:scripts: git-utils.sh
- ci:scripts: git-utils.sh
- ci:git-auto-commit: git-auto-commit.sh
- ci:scripts: git-utils.sh
- docs:git-utils.sh scripts: wrapper-test.sh
- ci:scripts: git-utils.sh
- ci:scripts: git-utils.sh
- refactor: reorganize git-auto-commit skill and command files

## [0.53.4] - 2026-10-13
### Fixed
- fix: resolve git-utils.sh merge conflicts and syntax errors
- test: add test file for git-auto-commit
- ci(scripts): git-utils.sh
- Merge branch 'main' of https://github.com/CherrugDeveloper/omniroute-bandit-proxy
- ci(scripts): git-utils.sh
- test(test_debug.txt ): test_debug.txt
- test: message
- ci(scripts): git-utils.sh
- ci(scripts): git-utils.sh
- test(test_debug.txt ): test_debug.txt
- test: message
- ci:git-auto-commit: git-auto-commit.sh

## [0.53.4] - 2026-10-14
### Fixed
- refactor(proxy): enhance dashboard, quota checks, bandit reliability and operational scripts
- chore: clean up artifacts, update dashboard stats verification, and update changelog
- feat: clean up unused skill scripts, add update_changelog custom tool, and update CHANGELOG.md
- feat: enhance bandit routing, health checks, retry handling, and add comprehensive test suite
- chore: clean up temporary test scripts, artifacts and auto-git script
- chore(scripts): update automation and utility scripts\n\nStaged files:\n- scripts/auto-git.mjs
- docs: update project documentation and architectural plans\n\nStaged files:\n- .roo/commands/git-auto-commit.md\n- package.json\n- plans/auto-git-workflow-design.md\n- scripts/auto-git.mjs
- feat: enhance multi-armed bandit proxy routing, error classification, and metrics dashboard

## [0.53.4] - 2026-10-15
### Fixed
- feat(bandit,session): ensure model existence in feedback recording and add 413/tpm session invalidation test
- feat(dashboard): optimize log frequency, top panel metrics & UI style unification
- fix(bandit,dashboard): handle TPM/token limit errors and refine dashboard metrics styling
- fix: resolve CFP browser, Antigravity catalog, and Groq TPM token limit errors
- fix(bandit): refine error classification and token limit validation & update docs
- fix(bandit): permanent ban and proactive filtering for environment and missing model errors
- fix(dashboard & bandit): fix metrics display, reset buttons, and upstream error classification
- feat(dashboard): add color-coded badges to model statistics
- fix(dashboard): move Monitorati metric to the left of dashboard summary
- fix(bandit,proxy): fix session affinity blacklist check and 413/TPM error handling
- fix: improve error classification and session affinity handling for TPM and 413/429 limits
- fix(service): fix unreplaced placeholders in omniroute-bandit-proxy.service and service restart logic
- docs: update CHANGELOG.md for v1.1.8
- refactor: generalize installation paths and improve script path resolution
- fix(bandit): enable optimistic exploration for unobserved catalog models in selectModel()
- fix(proxy): replace recursive compressBody with iterative loop and update changelog

## [0.53.4] - 2026-10-16
### Fixed
- fix(bandit): improve robust handling and cooldown for 413 ITPM / TPM exceeded errors
- fix(bandit): improve error recognition for 429 quota and 503 queue timeouts, and enhance dashboard model selection UI
- feat(bandit): exclude tts/audio/image models during sync and enhance selection banner logging transparency
- fix: prevent infinite selection loop on models exceeding ITPM/413 token limits
- fix(bandit): robust classification for rate-limit queue timeouts and high-demand 503 errors
- feat(proxy): enforce dynamic token limits and refine session affinity TPM blacklisting
- docs: update changelog and clean up design plans
- test(quota): add test case for 413 TPM-exceeded dynamic max tokens adjustment and model filtering
- feat(itpm): configure provider ITPM limits and update changelog for 413 error handling and session affinity fixes
- fix(bandit): pre-filter models exceeding provider ITPM quota before UCB1 selection
- fix(bandit): prevent zero-cooldown loops on 500 errors and enforce strict tool filtering
- fix: invalidate session affinity on model errors and failures
- chore: cleanup obsolete scripts and plans, update changelog and docs
- fix(bandit): prevent selection of cooling down and token-exceeded models
- fix(bandit): dynamically extract and persist model token limits from 413 errors

## [0.53.4] - 2026-10-17
### Fixed
- feat(proxy): add image generation request detection and conversion helpers
- feat(image-generation): add image generation detection, routing, and support for /v1/images/generations
- fix(bandit): classify Playwright browser launch 502 errors as ban-provider
- feat(dashboard,scripts): add script arguments input and default status in train-ctl
- feat: enhance request token size estimation for system prompts, tools, and tool calls

## [0.53.4] - 2026-10-18
### Fixed
- fix(dashboard): prevent 404 on tab refresh using hash-based routing
- fix(proxy): fix streaming retry block by eagerly reading first upstream chunk before sending headers
- fix(dashboard): optimize RAM and CPU usage by reducing polling frequency and capping log size
- fix(spa): add server-side SPA fallbacks and enhance client-side route synchronization
- fix(bandit): prevent image-generation models from being selected for text requests in isModelAvailable
- fix: correct parameter order in selectModel call to prevent image-generation model selection for text requests
- Add image generation request check and NULL capability guard
- feat(bandit): enforce strict capability filtering for tool requests and image generation models
- fix(proxy): fix image-generation model fallback loop in chat completions
- feat(bandit): implement round-robin exploration for unvisited models and fix image-generation filtering
- fix(bandit): strictly filter out image-generation models and permanently ban 400 capability mismatches
- feat(bandit): implement model categorization and capability filtering
- fix(bandit): exclude image-generation models from chat completions and handle 400 bans
- feat(proxy): add SPA fallback route for non-API requests and update changelog
- fix: filter out image-generation models for chat completions and make active requests panel scrollable with attempt rows
- feat(bandit/dashboard): add model metrics (N, reward, latency, score) to consideration history and dashboard
- feat(bandit/dashboard): refine model selection with N=0 prioritization and quality-to-speed metrics, add vertical consideration panel and 100ms polling
- fix(bandit): exclude image-generation models in emergency last-resort fallback selection and update changelog
- fix(bandit): improve model filtering relaxation tiers and fallback passes
- chore: exclude aihorde image models from chat completions, update tests and CHANGELOG
- fix(bandit): relax tool and token filtering constraints during model selection recovery
- fix(bandit): exclude image-generation models from chat completions and tool usage

## [0.53.4] - 2026-10-19
### Fixed
- feat(dashboard): perform true structural fusion of active requests and selection rejection spec sheet
- feat(dashboard): deeply merge active requests history and selection rejection spec sheet into unified persistent component
- feat(dashboard): refine metrics fix and dashboard UI refactoring
- fix(dashboard): fix metrics polling/API and optimize vertical spacing for dashboard tools
- feat(dashboard): embed chronological selection & discard spec sheet directly inside ⚡ In corso tab
- feat(dashboard): remove Considerazioni tab and integrate selection/discard timeline into Live Logs tab, fix proxy error classification & retry loop, and fix /v1/metrics bug
- feat(dashboard): integrate model evaluation specchietto into top panel
- docs: add changelog entry for v1.1.58 (discarded models spec sheet & per-group provider quota)
- feat: add chronological discarded models spec sheet and per-group provider quota handling
- fix(dashboard): handle 401 unauthorized and token prompting for metrics polling
- fix(dashboard): fix consideration fetch via apiFetch and add 401 handling
- fix(dashboard): fix dashboard metrics remaining at 0 with null-coalescing and debug logging
- fix(proxy): fix sessionKey assignment to constant variable error in src/index.mjs
- fix(bandit): include non-chat models in catalog sync, update capability classification, reset rank cache and update metadata
- fix(notifier): prevent telegram url parameter mutation and update changelog
- feat(proxy,ui): update dashboard UI polling/timeout logic and conditional session affinity bypass, update changelog

## [0.53.4] - 2026-10-20
### Fixed
- fix(dashboard): correct indentation and syntax in public/dashboard.html
- feat(dashboard): fix syntax errors in public/dashboard.html and update changelog
- docs(changelog): update for dashboard refactor
- refactor(dashboard): improve UI efficiency and event handling
- docs: update CHANGELOG.md for v1.1.63
- refactor(bandit): refine model selection relaxation tiers and optimize debug logging
- fix(bandit): harden getMetrics and getDashboardStats with robust try/catch and ignore placeholder tokens for REQUIRE_AUTH
- fix(dashboard): fix auth placeholder bypass and dashboard stats database resilience
- fix(dashboard): bypass service worker caching and installation for /v1/ API endpoints
- fix(dashboard): enhance JSON safety and data rendering in public/dashboard.html
- fix(bandit): refine error handling and ranking in src/bandit.mjs
- fix(dashboard): resolve dashboard regressions in version display, metrics, logs, and conditional auth
- fix(dashboard): resolve silent 401 failures and improve token prompting in dashboard
- fix(dashboard): handle authentication 401 errors, token persistence, and auth prompts
- fix(logging): fix log buffer pointer corruption in ring buffer and restore log streaming
- fix(dashboard): resolve application version, metrics panel, and log viewer issues
- fix(dashboard): fix TypeError assignment to constant variable API_TOKEN restoring dashboard functionality

## [0.53.4] - 2026-10-21
### Fixed
- fix(dashboard,bandit): refactor stats container layout and streamline request logging
- Fix dashboard layout, log table columns, reset counters button, and stats text format
- fix(cors): add CORS headers and OPTIONS preflight support to resolve Firefox network fetch error
- fix: update nginx static root path and bump service worker cache version for dashboard visibility
- fix(sw): update service worker to use network-first strategy for dashboard and HTML assets
- feat(dashboard): integrate provider stats, separate provider and model columns, absolute timestamps, compact row heights
- Refine image generation detection in src/index.mjs to eliminate false positives on chat completions
- Fix dashboard reset button, request logging, and 400 validation errors
- Update dashboard UI: unified card, icon reset button, model stats clarity, remove consideration tab and title, real model/provider and timestamps
- feat: capture failing models and 400 errors explicitly in request logs and dashboard specchietto
- fix(dashboard): fix refreshing reference error and providers is not iterable TypeError in renderProviderQuota
- fix(src): record and log HTTP 400 errors in middleware and request handler for Zoo proxy
- feat(dashboard): redesign unified panel cronologia operativa & stato ucb1 table
- Refactor dashboard unified panel: flat header, single scrollable row list without double titles or collapsible toggles
- feat(dashboard): unify active requests and ucb1 specchietto into compact scrollable panel
- fix(dashboard): update dashboard interface and configuration
- feat: enhance model selection candidate tracking and consideration history buffer across relaxation tiers
- fix(dashboard): fix floating action button changelog and developer handlers
- perf(dashboard): optimize DOM reflow, debouncing, memory management, and sanitization
- fix(dashboard): optimize RAM usage, fix tab switching lag and requests tab bugs in public/dashboard.html
- perf(dashboard): optimize RAM usage via consolidated polling and DOM patching

## [0.53.4] - 2026-10-22
### Fixed
- fix(dashboard,proxy): fix timestamp display, consolidate error logging, optimize layout, remove unused scripts and plans
- fix(dashboard,proxy): resolve model double prefix parsing, timestamp/elapsed seconds formatting, trend indicators, degraded model count, session affinity persistence, and observation counting
- Fix dynamic_max_tokens bug and dashboard polling; reset corrupted model limits
- docs: update CHANGELOG.md and README.md for log-noise reduction feature
- feat(log-noise): add request throttling and log-noise filtering to reduce console spam and improve polling efficiency
- fix(src): resolve false-positive image generation detection
- feat(api): implement POST /v1/images/generations endpoint
- fix(dashboard): fix Chat Catalogo and Totali Grezzi statistics discrepancy

## [0.53.4] - 2026-10-23
### Fixed
- Fix provider handling: hard-exclude dva for vision, change 402/403 non-resetting quota to 24h cooldown
- feat(bandit,index): implement vision capability support and catalog migration
- fix(bandit): improve error classification, timeout handling, and cleanup unused files
- fix(bandit,index): improve error classification and session affinity logic
- dashboard: 2-col internal grid per stats box, Top model name on second line
- dashboard: 1 row 4 col stats grid, separate Provider box, copy-all button unified table, fix status rejection logic
- dashboard: 4-col grid, models+providers 2-col inside same box, keep all data, reduced padding
- dashboard: compact 2-column stats grid, split models/providers, reduce padding
- fix(dashboard): restore full stats data set with optimized 3-column grid and variable widths
- fix(dashboard): split stats into 4 columns with name value pairs side by side
- fix(dashboard): make each stat box use 3 columns internally
- fix(dashboard): allow line breaks inside stat boxes
- fix(dashboard): increase stat box height 3x for single row grid
- fix(dashboard): use grid 3 columns for stat boxes single row
- fix(dashboard): allow stat boxes to shrink and stay on single line row
- fix(dashboard): remove inline flex:2 conflicting with flex:0 0 auto on top model stats box
- fix(dashboard): let stat boxes size to content instead of forcing equal width
- fix(dashboard): remove overflow clipping and text truncation from stats boxes
- fix(dashboard): prevent top model truncation and parameter/value separation, group stats into 3 boxes
- fix(dashboard): clean duplicate HTML blocks, add top model cooldown/N metrics, expand scrollbar hiding rules
- fix(dashboard,bandit): resolve 6 dashboard issues and restore backward compatibility
- feat: implement 5 enhancements - auto-clear needs_attention after health checks, provider circuit breaker, improved token estimation, fallback model scoring, per-provider health check frequency
- feat(dashboard): add script manager with live output polling and enhanced UI

## [0.53.4] - 2026-10-24
### Fixed
- fix: correct observations/catalog stats rendering in dashboard
- fix: remove duplicate latency unit from dashboard observations/catalog
- fix: use viewport-based scaling for stats boxes in dashboard
- fix: refine fluid typography scaling for stats boxes
- chore: ignore .env file
- chore: remove accidentally staged .env file
- feat: implement fluid typography for dashboard stats
- fix: reset attention flags and add emergency relaxation to bandit logic
- fix: update systemd service paths and update changelog
- fix(bandit): ignore vision constraints in emergency relaxation and update catalog vision capabilities
- chore: cleanup and maintenance
- chore: project cleanup and documentation update
- docs: update project documentation and architectural plans\n\nStaged files:\n- .roo/commands/auto-git.md
- docs: update project documentation and architectural plans\n\nStaged files:\n- .roo/commands/auto-git.md\n- .roo/commands/auto-git.sh\n- scripts/auto-git.mjs\n- scripts/fix-db.mjs
- chore(scripts): update automation and utility scripts\n\nStaged files:\n- .roo/commands/auto-git.sh\n- scripts/auto-git.mjs
- fix(db): reset provider cooldown, permanent ban and attention flags for no-think, cfp, xao, xai-oauth, openrouter

## [0.53.4] - 2026-10-25
### Fixed
- fix: correct syntax error in src/index.mjs after graceful shutdown changes
- fix: prevent auto-git from skipping production scripts during cleanup
- fix: resolve EADDRINUSE on port 8080 during service restarts
- chore(automation): improve auto-git staging workflow description
- fix(bandit): add ignoreDegraded support to emergency relaxation tier
- fix(db): reset provider flags to resolve ban/cooldown issues
- chore: configure auto-git command in .roo/commands/auto-git.md

## [0.53.4] - 2026-10-26
### Fixed
- fix(bandit): fix proxy error handling for cfp 502, antigravity 429, and stream retry blocking
- fix(bandit): fix totalObservations counter timing and enhance resetGlobalCounters
- Remove project-local auto-git.md (moved to global)
- fix(bandit): resolve model filtering, duplication, and sync issues
- fix(script): show only recent logs in restart-safe to avoid displaying historical errors
- fix(server): move SO_REUSEPORT option before socket bind to prevent EADDRINUSE on restart
- fix(scripts): enhance restart-safe with failed state reset and active job handling
- chore: update documentation, service config, and maintenance scripts
- fix(restart): resolve port 8080 conflicts and improve restart safety

## [0.53.4] - 2026-10-27
### Fixed
- fix: resolve 'source is not defined' unhandled rejection in selectModel function
- fix: render log buffer string entries correctly in dashboard
- fix(dashboard): render logs in log streaming panel
- fix(dashboard): resolve SyntaxError and ReferenceError in dashboard.html
- fix: resetProvider endpoint now passes provider name correctly
- fix: dashboard reset buttons now call correct API endpoints
- feat: separate reset endpoints for models and providers

## [0.53.4] - 2026-10-28
### Fixed
- fix(dashboard): align numbers, optimize columns, invert unified history order
- fix(dashboard): align metrics numbers, hide scrollbars, optimize half-screen view
- fix: resolve 'no such column: N' error in getDashboardStats()
- fix: CSS overlap fix for 'Osservazioni OK' in dashboard stats (display: inline-flex with gap)
- fix(dashboard): fix log streaming rendering and copy button
- chore: add auto-git command and skill definitions, update changelog and readme
- fix(dashboard): resolve syntax error in public/dashboard.html
- fix(dashboard): resolve structural issues in public/dashboard.html
- feat(dashboard): comprehensive dashboard overhaul with enhanced metrics, logs, unified history, and controls

## [0.53.4] - 2026-10-29
### Fixed
- fix(dashboard): remove try text from Cronologia Unificata timestamp to resolve column overlap
- fix(dashboard): prevent connection errors by adding try/catch to chat/completions route handler
- fix: prevent repeated provider errors in bandit model selection
- fix(dashboard): fix log streaming column alignment, message truncation, and container height
- fix(dashboard): stop polling /v1/models when models tab is not active
- fix(dashboard): fix template literal syntax error in fmtRow return
- fix(dashboard): resolve column overlap in Cronologia Unificata table
- feat(bandit-proxy): add auto-git workflow and cleanup test files

## [0.53.4] - 2026-10-30
### Fixed
- fix: model sanitization validation, error classification improvements, and provider cooldown fixes
- fix: clear cooldown_until on successful requests in recordFeedback()
- fix: remove duplicate isHardError variable declaration causing service startup crash
- fix: universal provider_cooldown rejections - fix noteProviderFail error type filtering, reduce maxAttempts, set EXPLOIT_ONLY=false, add provider cooldown reset via health check
- fix(proxy): fail fast on model-not-found errors and fix status reporting
- fix: enforce cooldown in bandit emergency relaxation tiers
- fix: prevent model re-selection loop in bandit emergency relaxation
- fix: revert incorrect ZOO mode addition; fix dashboard CSS alignment and filter overflow
- chore: v1.1.90 — 2026-10-30

## [0.53.4] - 2026-10-31
### Fixed
- feat(src,docs): update bandit logic
- chore: automated update
- chore: update dashboard.html
- feat(src): fix error classification
- chore(scripts): update omniroute-bandit-proxy.service
- chore: update documentation
- chore(src,config): update provider limits
- feat(src): automated commit
- fix(ops): correggi priorità systemd system prima di user in restart-safe.sh
- fix(ops): migliora gestione stato servizio con attesa graduale
- fix(ops): gestisci stato servizio inactive/dead post-start in restart-safe.sh
- fix(ops): migliora restart-safe.sh con rilevamento binding porta multi-metodo e controllo stato failed
- chore(src,config,changelog): automated commit

## [0.53.4] - 2026-11-01
### Fixed
- docs: update version to v1.13.5 and documentation
- fix(bandit): resolve emergency cooldown relaxation and vision filtering
- fix(changelog,docs): recalculate version numbers and format changelog
- chore(docs,src): update changelog v1.0.2, README version bump and bandit model pruning
- fix(scripts): enhanced restart-safe.sh with sudo and facial recognition support
- fix: respect ignoreTokenLimit flag in dynamic_max_tokens check
- fix(scripts): fix check-nvidia.mjs double database connection bug
- fix(bandit): emergency relaxation ignores already_tried and non_chat_model_excluded
- docs(CHANGELOG,README): update version 1.0.0 changelog and documentation
- docs(roo): ripristina auto-git.md globale e sincronizza documentazione workflow git automatizzato

## [0.53.4] - 2026-11-02
### Fixed
- fix(dashboard,bandit): update log colors and emergency relaxation filter
- fix(bandit): re-evaluate error classification and punishment system
- fix(dashboard,bandit): update log colors and emergency relaxation filter
- fix(ui): resolve syntax error in dashboard logs
- fix(ui): resolve syntax error in dashboard logs
- feat(ui): add log message expansion to dashboard
- feat(dashboard,proxy): move provider metrics to provider box, add color-coded log filters, fix session dedup and TDZ errors
- feat: move provider metrics to providers tab, quantize unified history, fix session deduplication, fix ITPM emergency tier
- docs: rewrite README.md to reflect actual project capabilities; dashboard: add provider % metrics, redesign pricing filter, add filter tooltips
- chore: auto-git workflow execution with version bump to v1.13.10
- feat: active events display, metric percentages, unified history row height, and train-daemon functionality
- chore: bump version to 1.13.9 and update changelog
- feat: merge training status into top model card
- chore(docs): auto-git workflow v1.13.7 - cleanup, changelog standardization, version bump
- chore: bump version to v1.13.6 and update docs

## [0.53.4] - 2026-11-03
### Fixed
- chore(version): bump to v1.14.10 and update documentation\n\n- Updated CHANGELOG.md with new version entry v1.14.10\n- Updated README.md to reflect v1.14.10\n- Updated package.json version to 1.14.10
- chore: optimize git history and consolidate automation commits - Squash consecutive generic/automated commits (v1.13.6 to v1.13.7 workflow) - Update documentation structure and changelog formatting - Consolidate auto-git workflow updates and version bumps - Update dashboard configuration and project rules - Clean up temporary files and planning artifacts - Update bandit model pruning and README references - Consolidate provider metrics and documentation updates
- chore(repo): auto-git workflow execution v1.13.14 Repository cleanup, version bump, documentation updates, and project utilities tracking
- chore(repo): clean up temporary files
- chore(repo): auto-git workflow v1.14.7 - repository maintenance and documentation updates
- fix(dashboard): reduce unified chronology table height and remove bottom margin
- feat(dashboard): enhance Unified Chronology with per-model selection history
- chore(build): deduplicate CHANGELOG.md entries and update project version
- fix(streaming): add safeWrite helper for client disconnect handling and buffer management
- fix(bandit): improve continuity with exponential backoff and emergency relaxation
- feat(bandit): emergency relaxation and fallback chain improvements
- fix(bandit): optimize error classification and fallback chain reliability
- feat(dashboard): fix - show x/y non-active counts in detail lines, restore percentage display
- feat(dashboard): add dynamic non-active stats and colorize badges
- feat(proxy): stop failure spiral for exhausted provider credentials
- chore(repo): update version to 1.14.0 and CHANGELOG.md with auto-git workflow documentation

## [0.53.4] - 2026-11-04
### Fixed
- chore: remove project-level auto-git.md, use global version
- docs: create enhanced auto-git.md, update CHANGELOG and README
- fix(docs): update CHANGELOG.md line references to match actual source
- fix(proxy): add supports_vision checks in fallback model selection
- feat(bandit): implement aggressive 3-strike punishment system and exponential backoff
- docs: update all mode-specific AGENTS.md with 3-strike system documentation
- docs: update README and AGENTS.md with v1.16.0 and 3-strike system
- feat(bandit): implement 3-strike aggressive punishment system for critical failures
- fix(dashboard): strip provider prefix from selection history model names
- feat(bandit): implement exponential backoff cooldown system with punishment tracking
- chore(service): add User/Group configuration for systemd service
- fix(bandit): use sanitizedModelId for proper error punishment
- fix(config): improve error pattern matching for model errors
- fix(streaming): resolve safeWrite initialization order error
- chore(repo): cleanup and documentation update for v1.15.0
- docs: update AGENTS.md files with recent changes - exponential backoff, total_failures, error patterns, dashboard updates
- feat(bandit): implemented exponential backoff cooldowns and total_failures tracking for consecutive 5xx errors
- fix(dashboard): fix syntax error in renderAll() if/else structure
- fix(dashboard): resolve 'page not responding' with chunked rendering and debounced polling
- chore(repo): squash consecutive generic commits v1.14.7 to v1.14.10

## [0.53.4] - 2026-11-05
### Fixed
- docs: integrate auto-git.md into global ~/.roo/commands/ and remove project copy
- refactor(commands): convert auto-git.mjs to markdown documentation
- chore: update CHANGELOG, README, and version to v1.23.0
- docs: normalize CHANGELOG.md formatting and add fix entry
- fix(bandit): resolve totalObservations undefined error in getDashboardStats
- chore: update CHANGELOG, README, and version according to Keep a Changelog 1.1.0
- chore: update CHANGELOG, README, and version to v1.22.0
- chore: update CHANGELOG, README, and version to v1.21.0
- fix: update README.md version header to v1.20.0 with proper formatting
- fix: correct version to 1.20.0 for WebSocket feature release
- feat: add WebSocket support for real-time script output streaming
- chore: update CHANGELOG, README, and version to v1.19.8
- chore: update CHANGELOG, README, and version to v1.19.7
- chore: update CHANGELOG, README, and version to v1.19.6
- chore: update CHANGELOG, README, and version to v1.19.5
- chore: update CHANGELOG, README, and version to v1.19.4
- refactor(auto-git): improve changelog generation to follow Keep a Changelog v1.1.0
- chore: update CHANGELOG, README, and version to v1.19.3
- chore: update CHANGELOG, README, and version to v1.19.2
- chore: update CHANGELOG, README, and version to 1.20.0
- chore: update CHANGELOG, README, and version to 1.19.0
- chore: update CHANGELOG, README, and version to 1.19.0
- chore: bump version to v1.19.0 and update CHANGELOG, README
- chore: update CHANGELOG, README, and version to 1.18.0

## [0.53.4] - 2026-11-06
### Fixed
- docs(change): update CHANGELOG.md with dashboard real-time updates
- feat(dashboard): add real-time training status polling and scripts tab navigation
- fix(train-daemon): sync updateTrainingStatus() with bandit.mjs fix
- fix(sql): resolve parameter count mismatch in updateTrainingStatus()
- fix(dashboard): optimize dashboard UI elements, changelog modal, and responsive metrics
- fix(bandit): add AbortController timeout and offline fallback to catalog sync
- feat(dashboard): enhance Models tab capabilities and UI layout
- feat(dashboard): enhance Models tab capabilities and UI layout
- fix(dashboard): fix provider expansion/collapse in Models tab
- fix(dashboard): correct flatMode variable usage in renderAll function
- fix(models): resolve 5 UI/UX issues in Models tab
- fix: resolve model count discrepancy and dashboard UI issues
- fix(dashboard): fix provider expand/collapse and half-screen responsive table columns

## [0.53.4] - 2026-11-07
### Fixed
- fix(training): keep status active during inter-cycle pauses and extend daemon liveness tolerance
- chore(git): update .gitignore and include raw git log
- feat(training): Add live log streaming and fix training status cumulative metrics
- chore(release): v1.28.3 - robust error handling, toast notifications, restart-safe improvements
- chore: bump version to 1.28.2 and suppress train models logging when inactive
- fix(dashboard): add tooltip to Quota reset column and standardize Reset Model button labels
- fix(dashboard): add tooltip to Quota reset column and standardize Reset Model button labels
- feat(release): bump version to v1.28.0, update changelog and README, refine dashboard UI and model/provider reset actions
- feat(release): bump version to v1.27.2, synchronize models_train during catalog sync, refine training daemon status and dashboard UI
- feat(release): bump version to v1.27.1, synchronize models_train during catalog sync to fix GET /v1/models?source=train results=0
- feat(release): bump version to v1.27.0, fix training feedback for models_train and optimize scripts manager table column widths
- feat(release): bump version to v1.26.0 and update changelog and dashboard UI refinements
- fix(dashboard): optimize scripts manager table width and auto-activate quick action panel when running
- chore: bump version to v1.25.0
- style(dashboard): refine Scripts Manager running badge logic
- feat(dashboard): refactor Train tab, optimize filters, responsive scripts manager, and training status heartbeat timeout
- feat(dashboard): refine dashboard UI and update release v1.24.4
- fix(bandit,dashboard): fix SQL catalog insertion parameter mismatch and apply dashboard UI refinements
- feat(dashboard): refine dashboard UI with container-scoped resets, clean train tab, and improved daemon controls
- feat(dashboard): implement dashboard improvements and refinements
- feat(dashboard): comprehensive dashboard improvements and bug fixes v1.24.2

## [0.53.4] - 2026-11-08
### Fixed
- feat(dashboard): optimize models & train tab layout and sanitize model names
- feat(proxy): enhance runtime error classification, fallback routing, and health check validation
- feat(dashboard): optimize frontend dashboard reactivity, debouncing, AbortController request management, and visibility checks
- fix(auto-git): execute workflow documentation and versioning updates for v1.28.11
- fix(train): automatically flag models returning 404 as permanent=1 in training daemon and update docs/changelog
- chore: remove raw_git_log.txt and ignore it
- fix(training): track persistent 404 model errors and auto-mark permanent in train-daemon
- chore(release): release v1.28.9 - update changelog, README and system configurations
- fix(bandit): classify 503 Playwright and Cloudflare Playground errors as provider cooldown
- fix(dashboard): synchronize models view with dashboard metric boxes
- fix(dashboard): fix collapse behavior and metric filtering synchronization
- fix(dashboard): fix updateStat hoisting reference error in stats polling loop
- fix(dashboard): fix dashboard model metrics display and update version to 1.28.7
- feat(dashboard): release v1.28.6 - collapsible train providers, helper text removal, script output visibility, model metrics fix
- feat(dashboard): release v1.28.5 - dashboard enhancements, changelog modal, unified history badges, and daemon stability

## [0.53.4] - 2026-11-09
### Fixed
- fix: database fallback for recent requests when in-memory buffer is empty
- docs: enhance API documentation with examples and endpoint details
- docs: update README with comprehensive documentation including 3-strike system and event system
- fix: correct typo in ESM __filename polyfill (__filename__ -> __filename)
- fix(gitignore): retain raw_git_log.txt for workflow compliance
- docs: generate complete project documentation
- feat(punishment): add 3-strike rule, event system, and training feedback metrics
- chore(changelog): format changelog entries for test suite compliance
- chore(release): release v1.28.15 - update documentation, changelog and dashboard

## [0.53.4] - 2026-11-10
### Fixed
- fix(changelog): add Version History section and fix conventional commit format for test compliance
- feat(dashboard): integrate punishment events into unified history with WebSocket real-time updates
- docs: add CHANGELOG.md following Keep a Changelog and README.md with comprehensive documentation
- fix: isolate global dashboard metrics from tab-specific renders
- fix(dashboard): isolate filtered metrics from global dashboard stats
- fix(dashboard): correct syntax error in refreshAll function
- fix(dashboard): synchronize global metrics across all dashboard tabs
- fix(dashboard): refresh main metrics when switching tabs
- fix(log-filtering): correct regex patterns for log entry type detection

## [0.53.4] - 2026-11-11
### Fixed
- chore(release): v1.28.22 - documentation, changelog, and configuration updates
- fix(dashboard): resolve API_TOKEN ReferenceError in WebSocket initialization
- chore: bump version to 1.28.20, fix copy button state persistence
- fix(frontend): consolidate copy-box-content event handlers and standardize timeout values
- fix(bandit,dashboard): resolve SQL param mismatches and sanitize model names
- fix(gitignore): retain raw_git_log.txt for auto-git workflow compliance

## [0.53.4] - 2026-11-12
### Fixed
- fix(changelog,reset): fix changelog loading error and full stats reset
- fix: allow statsAggregator reassignment from const to let
- docs: update AGENTS.md with 5-strike rule and StatsAggregator docs
- fix: prevent mass permanent model bans, upgrade to 5-strike rule, add real-time stats aggregator
- fix: improve punishment system and real-time log sync
- docs: clean up AGENTS.md files with non-obvious project-specific info only
- docs: add comprehensive CHANGELOG.md and README.md documentation
- fix(bandit): improve error classification, metrics, and history sync
- fix(bandit): prevent infinite ban loop after database reset by checking permanent status before incrementing consecutive_critical_failures
- feat(ban-metrics): reset erroneous permanent bans and regenerate documentation

## [0.53.4] - 2026-11-13
### Fixed
- fix(dashboard): resetProvider no longer clears models data
- fix: provider quota conditional rollback and stream backpressure drain timeout
- fix: provider reset no longer clears models Config attention flags
- fix(dashboard): reset Config count when resetting all models
- chore(release): bump to v0.47.0 and update documentation
- fix(proxy): stream idle/max timeouts increased; bandit punishment and cascade guard relaxed
- chore: revert version bump to 0.46.0 to match existing changelog entry
- fix(proxy): skip bandit punishment for client disconnects/aborts
- fix(bandit,proxy): resolve critical proxy issues and log streaming rewrite bug
- fix(bandit,config): align error classification with config rules and fix recordFeedback non-object error handling
- docs(AGENTS.md): add commands, fix error classification (5-strike/cooldown-model), document resetProvider model reset
- fix(bandit): provider reset now resets all models belonging to that provider
- fix: resolve 401 auth-expired error handling and cascade guard issues
- fix(bandit): prevent cascade cooldowns from emergency rejection feedback loop
- fix(reset-model): no longer resets provider history on models box reset
- Fix emergency mass-banning cascade: 429 no longer critical, emergency rejections don't escalate to ban
- fix(dashboard): keep metrics current on logs tab and populate Error Type/Countermeasure columns
- fix(dashboard): resolve top model empty, punishment WS scope, and log streaming overwrite
- docs: align versions across changelog, package.json, and readme
- docs: make changelog header self-referential instead of hardcoded version
- docs: reverse changelog order and align header version with package.json
- feat: regenerate documentation and bump version to 1.30.0

## [0.53.4] - 2026-11-14
### Fixed
- fix(logging): expand polling path prefixes to reduce access log noise
- fix(health-check): add missing structured logger imports
- fix(proxy): refactor startServer() with explicit HTTP server and EADDRINUSE handling, add sync debugging
- fix(bandit): add diagnostic logging and robust error handling around fetchAndSyncModels() and update changelog
- fix(bandit): handle missing catalog table during startup remote sync failure
- fix(startup): eliminate blocking model sync retry loop exceeding systemd start timeout
- fix(bandit): add robust offline fallback model seeding in fetchAndSyncModels() and fix port release race condition in restart script
- fix(bandit): improve _sanitizeModelId() to handle nested/duplicated provider prefixes
- Replace console.log/error/warn with structured logger calls (slogInfo/slogError/slogWarn)

## [0.53.4] - 2026-11-15
### Fixed
- chore: update mode signatures and implement free model identification system

## [0.53.4] - 2026-11-16
### Fixed
- feat: add version 0.50.1 changelog entries, update error classification docs, and refine bandit error handling
- feat: add version 0.50.1 changelog entries, update error classification docs, and refine bandit error handling
- feat: improve dashboard state priority with bandit system flags over quota exhaustion
- feat: improve 404 and model-not-found error classification
- feat: refine model-not-found error classification - change 404 status from permanent ban to transient cooldown-model, improve bandit selection reliability
- feat: complete auto-git workflow for versioning, documentation updates, and repository hygiene
- chore: complete auto-git workflow - versioning, documentation updates, and repository hygiene - - -
- chore: release v0.49.6 - remove dead wait_for_service_failed code, update docs and version
- chore: bump version to 0.49.5

## [0.53.4] - 2026-11-17
### Fixed
- fix: add sanitizeErrorBody to error handling in /v1/training/log-stream endpoint
- feat: add token authentication for punishment events WebSocket endpoint
- fix: remove duplicate punishmentWSConnected declaration in public/dashboard.html to resolve JavaScript SyntaxError
- fix: remove duplicate punishmentEventBuffer declaration in public/dashboard.html to resolve JavaScript SyntaxError
- fix: remove duplicate scriptDescriptions declaration in public/dashboard.html to resolve JavaScript SyntaxError
- fix: remove duplicate MAX_WS_RECONNECT_ATTEMPTS declaration from dashboard.html to resolve JavaScript SyntaxError
- fix: remove duplicate wsReconnectAttempts declaration from dashboard.html to resolve JavaScript SyntaxError
- fix: remove duplicate let currentScriptPid = null declaration from dashboard.html to resolve JavaScript SyntaxError
- fix: remove duplicate and redundant declarations in public/dashboard.html
- fix: remove duplicate and redundant declarations in public/dashboard.html
- feat: add retry logic and connection error handling to dashboard API fetches, add punishment events table display
- chore: bump version to 0.50.2 and update docs
- feat: remove deprecated catalog mismatch pattern from error classification and add classifyError tests

## [0.53.4] - 2026-11-18
### Fixed
- feat(events): add WebSocket reconnection with exponential backoff
- chore: bump version to 0.52.0 ## Changelog - Updated CHANGELOG.md with proper Keep a Changelog format - Added Version History section - Updated events.mjs with WebSocket reconnection logic for punishment events
- chore: bump version to 0.51.0
- feat: add backup service and configure dotenv in main service

## [0.53.4] - 2026-11-19
### Fixed
- fix: improve abort error handling in dashboard and bandit models fetch
- fix(events): remove immediate WebSocket connection on module load to prevent test environment hang
- feat(events): add WebSocket reconnection with exponential backoff

