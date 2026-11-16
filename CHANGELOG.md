# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## Version History

## [0.1.0] - 2026-09-30
### Added
- transforms the dashboard into a PWA with service worker, manifest and install button
- adds dynamic model synchronization from OmniRoute via /v1/models and bandit selection optimization
- add granular real-time logging for UCB1 evaluation, scores, rewards, and feedback metrics
- integrate DiscountedUCB1Bandit engine with Zoo Code compatible Zod metadata and Express proxy

### Changed
- Add provider-level health tracking, exponential cooldown, and n+1 rotation pointer with updated dashboard UI
- Add live proxy logs and precise cooldown countdown to the dashboard
- Fix dashboard binding on 127.0.0.1 and stabilize Bandit proxy error handling
- ignore sqlite wal and shm files
- ensure .env and proxy.log are excluded from git

### Fixed
- add AbortController timeout, client disconnect handler (499), and immediate bandit fallback


## [0.2.0] - 2026-10-01
### Added
- success rate indicator next to Observations
- distinct purple color for needs_attention vs cooldown (yellow)
- auto-refresh 2.5s, full-height layout without scroll, redundant cooldown column removal
- proportional cooldowns (24h misconfig, 6h anti-abuse), recognize upstream bug and reset_seconds, safety provider 30m
- catalog chat-only, lazy registration, provider cooldown on quota or repeated fails; fix spurio abort

### Changed
- adds unit test suite for bandit.mjs (classifyError, selectModel, recordFeedback, meta)
- rewrite README aligned with current code, adds MIT license
- remove duplicate access-log middleware
- replace icon set with RealFaviconGenerator, update links and manifest
- migrate to ES modules (.mjs), new dashboard and PWA icon set

### Fixed
- 5xx on model no longer kills entire provider; 402 payment pattern added
- adds Missing Data button
- complete script, normalized numeric values, non-destructive 401 banner
- no-cache HTML, remove residual inline onclick, robust fetchLogs to 401


## [0.3.0] - 2026-10-02
### Added
- requireTools penalizes models that don't call tools
- model lock button (permanent=1), changes to Unlock if already banned
- custom modals in dark style (no more native alert/confirm)
- models grouped by provider with collapse/expand
- always visible activity panel (active + last requests)
- in-flight requests panel (model, attempt, time)
- train-gentle mode for parallel training and real use
- EXCLUDE_THINKING + EXPLOIT_ONLY + switch-mode.sh for prod/train
- switch-mode.sh to alternate prod/train with a command
- EXPLOIT_ONLY (only models N>=3) for productive use <2s
- summary aggregator (active, reward, latency, free, topModel); fix spurious cooldown provider
- display_override to hide title bar (window-controls-overlay)
- global counters reset button (requests + observations)
- 5 fail threshold, excludes problematic openrouter patterns
- free/paid detection, ONLY_FREE/EXCLUDE_PAID filters, 403 model-level doesn't ban provider
- catalogRawCount
- free/paid detection, ONLY_FREE/EXCLUDE_PAID, is_paid on 402, catalogRawCount
- Telegram support with configurable chat_id
- Slack/Discord webhook on critical events
- custom modal with copy button (removes non-copyable alert)
- contextual provider needs_attention button with instructions

### Changed
- ignore backup files
- force LF, force forced model registration, executable scripts
- ignore temporary SQLite files
- document HEALTH_CHECK_* variables
- add round-robin demon with start/stop/status/logs

### Fixed
- distinguish demo-limit from input-too-long (cfp flag-provider)
- restore hasCatalogIsFree + supports_tools populated from payload
- remove extra parenthesis in _classifyError; recognize prompt-too-long
- recognize 'run out of usage' as error (don't reward the response)


## [0.4.0] - 2026-10-03
### Added
- auto-compress per-model instead of max-catalog

### Changed
- make all scripts executable (bit 755 tracked in git)
- update restart, switch-mode, train-ctl, and train-daemon scripts
- restart.sh with feedback log to stdout

### Fixed
- exclude FIM models from tool-capable pool (imprecise diffs)
- remove tools from body for summarization (no more tool_calls on condense)
- don't require tool_calls for summarization requests
- remove duplicated if(stream); fix accumulated->raw; log 503; per-model auto-compress
- estimate tokens ÷4 (JSON) to support 100k+ contexts


## [0.5.0] - 2026-10-04
### Added
- endpoint /v1/changelog + file CHANGELOG.md
- formatted changelog + "new" badge on FAB
- CSS Grid for "In corso" panel; "test" badge for N<1
- low TPM filter, unpin 413, new models badge, training exclude
- rank modello, trend, esclusione health check
- session affinity, mode routing, training isolation, debug toggle

### Changed
- N/avg/trend, ranking, zoo/training distinction

### Fixed
- added x-source: training header
- dev-card with DOMContentLoaded, scroll tab Mode
- removed duplicate dev-card script (double listeners)
- padding-top for PWA window-controls-overlay
- saturated provider handling, proportional timeout, summarizer TPM


## [0.6.0] - 2026-10-05
### Added
- In corso table with fixed headers and columns
- dynamic_max_tokens learned from 413 (self-learning)

### Fixed
- remove duplicate "In corso" column, wider "In corso" columns
- migrate dynamic_max_tokens outside is_paid block
- struggling detection only on last tool_result
- fmtInfo with uniform columns (avg=-, new)


## [0.7.0] - 2026-10-06
### Added
- handles 429 retries with fallback
- adds debug log filtering
- reward per tool, loop detection, orchestrator→reasoning
- unified checkbox ZOO/TRAIN (log + In corso)

### Changed
- add venv/ to gitignore and update linting rules
- adds rate-limit fallback coverage
- updates control scripts

### Fixed
- improves affinity loop diagnostics
- ignores failed write calls
- compresses oversized requests
- symmetric provider+model cooldown, soft/hard, no loop unlock
- symmetric provider+model cooldown unlock, soft/hard cooldown


## [0.8.0] - 2026-10-09
### Changed
- AGENTS.md for AI agents (Roo, Zoo, etc.)
- ignore training.log.old, analysis reports
- Roo rules + utility scripts (check-db, clean-cjs, verify-server)
- final verification
- scripts: git-utils.sh
- test13.txt: git-auto-commit.sh
- test12.txt: git-auto-commit.sh
- test11.txt: git-auto-commit.sh
- scripts: git-utils.sh
- test9.txt: git-auto-commit.sh
- test7.txt: git-auto-commit.sh
- test6.txt: git-auto-commit.sh
- test5.txt: git-auto-commit.sh
- test4.txt: git-auto-commit.sh
- test3.txt: git-auto-commit.sh
- test2.txt: git-auto-commit.sh
- scripts: git-utils.sh
- .roo: git-auto-commit.md

### Fixed
- _classifyError recognizes 502 'CLI not found' / 'not configured'
- log raw SSE error for gemini/mistral diagnosis
- _classifyError recognizes 'unknown provider' and 'no longer available'
- needs_attention doesn't block, only cooldown_until
- getModelMaxInput uses dynamic_max_tokens for models
- selectModel with 5 arguments (removed null legacy)
- getUnhealthyModels args, unlock reset needs_attention


## [0.9.0] - 2026-10-10
### Added
- provider quota system - dashboard table, needs_attention filter, CHANGELOG v1.1.0
- provider quota system - dashboard table, needs_attention filter, CHANGELOG v1.1.0

### Changed
- add GIT_AUTO_COMMIT_WSL_EXEC to documentation
- fix git-auto-commit command metadata
- scripts: git-auto-commit.sh
- sync local branch with remote and cleanup files
- v1.1.1: API models/provider, fix HTML dashboard, CHANGELOG
- abbozzo sistema quota provider (non integrato)
- train-ctl.sh executable
- c6483bd again broken, restore 57697e2
- 98a9fe5 broke the syntax
- normalize line ending (LF forced for all text files)

### Fixed
- quota migration + remove needs_attention from filter
- strip reasoning_details/reasoning_content/reasoning from requests
- 403 Key limit exceeded → cooldown-provider with reset time
- ban-model with UPSERT on models
- fallback doesn't loop if already attempted or unavailable
- fallback doesn't loop if already attempted or unavailable
- fallback doesn't loop if already attempted or unavailable
- selectModel also loads permanent=1 models
- isModelAvailable checks permanent and degraded


## [0.10.0] - 2026-10-11
### Changed
- add GIT_AUTO_COMMIT_WSL_EXEC environment variable support
- optimize git-auto-commit script
- .roo: .env.example

## [0.11.0] - 2026-10-12
### Changed
- scripts: fix auto-squash unbound variable error
- git-auto-commit: git-auto-commit.sh
- git-utils.sh scripts: wrapper-test.sh
- scripts: git-utils.sh
- scripts: fix auto-squash unbound variable error
- scripts: git-utils.sh
- scripts: git-utils.sh
- git-auto-commit: git-auto-commit.sh
- scripts: git-utils.sh
- git-utils.sh scripts: wrapper-test.sh


## [0.12.0] - 2026-10-13
### Changed
- add test file for git-auto-commit
- git-utils.sh
- Merge branch 'main' of https://github.com/CherrugDeveloper/omniroute-bandit-proxy
- git-utils.sh
- test_debug.txt
- message
- git-utils.sh
- git-utils.sh
- test_debug.txt
- message
- git-auto-commit: git-auto-commit.sh

### Fixed
- resolve git-utils.sh merge conflicts and syntax errors


## [0.13.0] - 2026-10-14
### Added
- clean up unused skill scripts, add update_changelog custom tool, and update CHANGELOG.md
- enhance bandit routing, health checks, retry handling, and add comprehensive test suite
- enhance multi-armed bandit proxy routing, error classification, and metrics dashboard

### Changed
- enhance dashboard, quota checks, bandit reliability and operational scripts
- clean up artifacts, update dashboard stats verification, and update changelog
- clean up temporary test scripts, artifacts and auto-git script


## [0.14.0] - 2026-10-15
### Added
- ensure model existence in feedback recording and add 413/tpm session invalidation test
- optimize log frequency, top panel metrics & UI style unification
- add color-coded badges to model statistics

### Changed
- update CHANGELOG.md for v1.1.8
- generalize installation paths and improve script path resolution

### Fixed
- improve robust handling and cooldown for 413 ITPM / TPM exceeded errors
- improve error recognition for 429 quota and 503 queue timeouts, and enhance dashboard model selection UI
- prevent infinite selection loop on models exceeding ITPM/413 token limits
- robust classification for rate-limit queue timeouts and high-demand 503 errors
- pre-filter models exceeding provider ITPM quota before UCB1 selection
- invalidate session affinity on model errors and failures
- prevent selection of cooling down and token-exceeded models
- dynamically extract and persist model token limits from 413 errors


## [0.15.0] - 2026-10-16
### Added
- exclude tts/audio/image models during sync and enhance selection banner logging transparency
- enforce dynamic token limits and refine session affinity TPM blacklisting
- configure provider ITPM limits and update changelog for 413 error handling and session affinity fixes

### Changed
- update changelog and clean up design plans
- add test case for 413 TPM-exceeded dynamic max tokens adjustment and model filtering
- cleanup obsolete scripts and plans, update changelog and docs

### Fixed
- improve robust handling and cooldown for 413 ITPM / TPM exceeded errors
- improve error recognition for 429 quota and 503 queue timeouts, and enhance dashboard model selection UI
- prevent infinite selection loop on models exceeding ITPM/413 token limits
- robust classification for rate-limit queue timeouts and high-demand 503 errors
- pre-filter models exceeding provider ITPM quota before UCB1 selection
- invalidate session affinity on model errors and failures
- prevent selection of cooling down and token-exceeded models
- dynamically extract and persist model token limits from 413 errors


## [0.16.0] - 2026-10-17
### Added
- add image generation request detection and conversion helpers
- add image generation detection, routing, and support for /v1/images/generations
- add script arguments input and default status in train-ctl
- enhance request token size estimation for system prompts, tools, and tool calls

### Fixed
- classify Playwright browser launch 502 errors as ban-provider


## [0.17.0] - 2026-10-18
### Added
- enforce strict capability filtering for tool requests and image generation models
- implement round-robin exploration for unvisited models and fix image-generation filtering
- implement model categorization and capability filtering
- add SPA fallback route for non-API requests and update changelog
- add model metrics (N, reward, latency, score) to consideration history and dashboard
- refine model selection with N=0 prioritization and quality-to-speed metrics, add vertical consideration panel and 100ms polling

### Changed
- Add image generation request check and NULL capability guard
- exclude aihorde image models from chat completions, update tests and CHANGELOG

### Fixed
- prevent 404 on tab refresh using hash-based routing
- fix streaming retry block by eagerly reading first upstream chunk before sending headers
- optimize RAM and CPU usage by reducing polling frequency and capping log size
- add server-side SPA fallbacks and enhance client-side route synchronization
- prevent image-generation models from being selected for text requests in isModelAvailable
- correct parameter order in selectModel call to prevent image-generation model selection for text requests
- fix image-generation model fallback loop in chat completions
- strictly filter out image-generation models and permanently ban 400 capability mismatches
- exclude image-generation models from chat completions and handle 400 bans
- filter out image-generation models for chat completions and make active requests panel scrollable with attempt rows
- exclude image-generation models in emergency last-resort fallback selection and update changelog
- improve model filtering relaxation tiers and fallback passes
- relax tool and token filtering constraints during model selection recovery


## [0.18.0] - 2026-10-19
### Added
- perform true structural fusion of active requests and selection rejection spec sheet
- deeply merge active requests history and selection rejection spec sheet into unified persistent component
- refine metrics fix and dashboard UI refactoring
- embed chronological selection & discard spec sheet directly inside ⚡ In corso tab
- remove Considerazioni tab and integrate selection/discard timeline into Live Logs tab, fix proxy error classification & retry loop, and fix /v1/metrics bug
- integrate model evaluation specchietto into top panel
- add chronological discarded models spec sheet and per-group provider quota handling
- update dashboard UI polling/timeout logic and conditional session affinity bypass, update changelog

### Changed
- add changelog entry for v1.1.58 (discarded models spec sheet & per-group provider quota)

### Fixed
- fix metrics polling/API and optimize vertical spacing for dashboard tools
- handle 401 unauthorized and token prompting for metrics polling
- consider fetch via apiFetch and add 401 handling
- fix dashboard metrics remaining at 0 with null-coalescing and debug logging
- fix sessionKey assignment to constant variable error in src/index.mjs
- include non-chat models in catalog sync, update capability classification, reset rank cache and update metadata
- prevent telegram url parameter mutation and update changelog


## [0.19.0] - 2026-10-20
### Added
- fix syntax errors in public/dashboard.html and update changelog

### Changed
- update for dashboard refactor
- improve UI efficiency and event handling
- update CHANGELOG.md for v1.1.63
- refine model selection relaxation tiers and optimize debug logging

### Fixed
- correct indentation and syntax in public/dashboard.html
- harden getMetrics and getDashboardStats with robust try/catch and ignore placeholder tokens for REQUIRE_AUTH
- fix auth placeholder bypass and dashboard stats database resilience
- bypass service worker caching and installation for /v1/ API endpoints
- enhance JSON safety and data rendering in public/dashboard.html
- refine error handling and ranking in src/bandit.mjs
- resolve dashboard regressions in version display, metrics, logs, and conditional auth
- resolve silent 401 failures and improve token prompting in dashboard
- handle authentication 401 errors, token persistence, and auth prompts
- fix log buffer pointer corruption in ring buffer and restore log streaming
- resolve application version, metrics panel, and log viewer issues
- fix TypeError assignment to constant variable API_TOKEN restoring dashboard functionality


## [0.20.0] - 2026-10-21
### Added
- integrate provider stats, separate provider and model columns, absolute timestamps, compact row heights
- capture failing models and 400 errors explicitly in request logs and dashboard specchietto
- redesign unified panel cronologia operativa & stato ucb1 table
- unify active requests and ucb1 specchietto into compact scrollable panel
- enhance model selection candidate tracking and consideration history buffer across relaxation tiers

### Changed
- Fix dashboard layout, log table columns, reset counters button, and stats text format
- Refine image generation detection in src/index.mjs to eliminate false positives on chat completions
- Fix dashboard reset button, request logging, and 400 validation errors
- Update dashboard UI: unified card, icon reset button, model stats clarity, remove consideration tab and title, real model/provider and timestamps
- Refactor dashboard unified panel: flat header, single scrollable row list without double titles or collapsible toggles
- optimize DOM reflow, debouncing, memory management, and sanitization
- optimize RAM usage via consolidated polling and DOM patching

### Fixed
- refactor stats container layout and streamline request logging
- add CORS headers and OPTIONS preflight support to resolve Firefox network fetch error
- update nginx static root path and bump service worker cache version for dashboard visibility
- update service worker to use network-first strategy for dashboard and HTML assets
- fix refreshing reference error and providers is not iterable TypeError in renderProviderQuota
- record and log HTTP 400 errors in middleware and request handler for Zoo proxy
- update dashboard interface and configuration
- fix floating action button changelog and developer handlers
- optimize RAM usage, fix tab switching lag and requests tab bugs in public/dashboard.html


## [0.21.0] - 2026-10-22
### Added
- add request throttling and log-noise filtering to reduce console spam and improve polling efficiency
- implement POST /v1/images/generations endpoint

### Changed
- Fix dynamic_max_tokens bug and dashboard polling; reset corrupted model limits
- update CHANGELOG.md and README.md for log-noise reduction feature

### Fixed
- fix timestamp display, consolidate error logging, optimize layout, remove unused scripts and plans
- resolve model double prefix parsing, timestamp/elapsed seconds formatting, trend indicators, degraded model count, session affinity persistence, and observation counting
- resolve false-positive image generation detection
- fix Chat Catalogo and Totali Grezzi statistics discrepancy


## [0.22.0] - 2026-10-23
### Added
- implement vision capability support and catalog migration
- implement 5 enhancements - auto-clear needs_attention after health checks, provider circuit breaker, improved token estimation, fallback model scoring, per-provider health check frequency
- add script manager with live output polling and enhanced UI

### Changed
- Fix provider handling: hard-exclude dva for vision, change 402/403 non-resetting quota to 24h cooldown
- 2-col internal grid per stats box, Top model name on second line
- 1 row 4 col stats grid, separate Provider box, copy-all button unified table, fix status rejection logic
- 4-col grid, models+providers 2-col inside same box, keep all data, reduced padding
- compact 2-column stats grid, split models/providers, reduce padding

### Fixed
- improve error classification, timeout handling, and cleanup unused files
- improve error classification and session affinity logic
- restore full stats data set with optimized 3-column grid and variable widths
- split stats into 4 columns with name value pairs side by side
- make each stat box use 3 columns internally
- allow line breaks inside stat boxes
- increase stat box height 3x for single row grid
- use grid 3 columns for stat boxes single row
- allow stat boxes to shrink and stay on single line row
- remove inline flex:2 conflicting with flex:0 0 auto on top model stats box
- let stat boxes size to content instead of forcing equal width
- remove overflow clipping and text truncation from stats boxes
- prevent top model truncation and parameter/value separation, group stats into 3 boxes
- clean duplicate HTML blocks, add top model cooldown/N metrics, expand scrollbar hiding rules
- resolve 6 dashboard issues and restore backward compatibility


## [0.23.0] - 2026-10-24
### Added
- implement fluid typography for dashboard stats

### Changed
- ignore .env file
- remove accidentally staged .env file
- cleanup and maintenance
- project cleanup and documentation update
- update project documentation and architectural plans
- staged files: .roo/commands/auto-git.md
- update project documentation and architectural plans
- staged files: .roo/commands/auto-git.md, .roo/commands/auto-git.sh, scripts/auto-git.mjs, scripts/fix-db.mjs
- update automation and utility scripts
- staged files: .roo/commands/auto-git.sh, scripts/auto-git.mjs

### Fixed
- correct observations/catalog stats rendering in dashboard
- remove duplicate latency unit from dashboard observations/catalog
- use viewport-based scaling for stats boxes in dashboard
- refine fluid typography scaling for stats boxes
- reset attention flags and add emergency relaxation to bandit logic
- update systemd service paths and update changelog
- ignore vision constraints in emergency relaxation and update catalog vision capabilities
- reset provider cooldown, permanent ban and attention flags for no-think, cfp, xao, xai-oauth, openrouter


## [0.24.0] - 2026-10-25
### Changed
- improve auto-git staging workflow description
- configure auto-git command in .roo/commands/auto-git.md

### Fixed
- correct syntax error in src/index.mjs after graceful shutdown changes
- prevent auto-git from skipping production scripts during cleanup
- resolve EADDRINUSE on port 8080 during service restarts
- add ignoreDegraded support to emergency relaxation tier
- reset provider flags to resolve ban/cooldown issues


## [0.25.0] - 2026-10-26
### Changed
- Remove project-local auto-git.md (moved to global)
- update documentation, service config, and maintenance scripts

### Fixed
- fix proxy error handling for cfp 502, antigravity 429, and stream retry blocking
- fix totalObservations counter timing and enhance resetGlobalCounters
- resolve model filtering, duplication, and sync issues
- show only recent logs in restart-safe to avoid displaying historical errors
- move SO_REUSEPORT option before socket bind to prevent EADDRINUSE on restart
- enhance restart-safe with failed state reset and active job handling
- resolve port 8080 conflicts and improve restart safety


## [0.26.0] - 2026-10-27
### Added
- separate reset endpoints for models and providers

### Fixed
- resolve 'source is not defined' unhandled rejection in selectModel function
- render log buffer string entries correctly in dashboard
- render logs in log streaming panel
- resolve SyntaxError and ReferenceError in dashboard.html
- resetProvider endpoint now passes provider name correctly
- dashboard reset buttons now call correct API endpoints


## [0.27.0] - 2026-10-28
### Added
- comprehensive dashboard overhaul with enhanced metrics, logs, unified history, and controls

### Changed
- add auto-git command and skill definitions, update changelog and readme

### Fixed
- align numbers, optimize columns, invert unified history order
- align metrics numbers, hide scrollbars, optimize half-screen view
- resolve 'no such column: N' error in getDashboardStats()
- CSS overlap fix for 'Osservazioni OK' in dashboard stats (display: inline-flex with gap)
- fix log streaming rendering and copy button
- resolve syntax error in public/dashboard.html
- resolve structural issues in public/dashboard.html


## [0.28.0] - 2026-10-29
### Added
- add auto-git workflow and cleanup test files

### Fixed
- remove try text from Cronologia Unificata timestamp to resolve column overlap
- prevent connection errors by adding try/catch to chat/completions route handler
- prevent repeated provider errors in bandit model selection
- fix log streaming column alignment, message truncation, and container height
- stop polling /v1/models when models tab is not active
- fix template literal syntax error in fmtRow return
- resolve column overlap in Cronologia Unificata table


## [0.29.0] - 2026-10-30
### Changed
- v1.1.90 — 2026-10-30

### Fixed
- model sanitization validation, error classification improvements, and provider cooldown fixes
- clear cooldown_until on successful requests in recordFeedback()
- remove duplicate isHardError variable declaration causing service startup crash
- universal provider_cooldown rejections - fix noteProviderFail error type filtering, reduce maxAttempts, set EXPLOIT_ONLY=false, add provider cooldown reset via health check
- fail fast on model-not-found errors and fix status reporting
- enforce cooldown in bandit emergency relaxation tiers
- prevent model re-selection loop in bandit emergency relaxation
- revert incorrect ZOO mode addition; fix dashboard CSS alignment and filter overflow


## [0.30.0] - 2026-10-31
### Added
- update bandit logic
- fix error classification
- automated commit

### Changed
- automated update
- update dashboard.html
- update omniroute-bandit-proxy.service
- update documentation
- provider limits
- automated commit

### Fixed
- correggi priorità systemd system prima di user in restart-safe.sh
- migliora gestione stato servizio con attesa graduale
- gestisci stato servizio inactive/dead post-start in restart-safe.sh
- migliora restart-safe.sh con rilevamento binding porta multi-metodo e controllo stato failed


## [0.31.0] - 2026-11-01
### Changed
- update version to v1.13.5 and documentation
- update changelog v1.0.2, README version bump and bandit model pruning
- update version 1.0.0 changelog and documentation
- ripristina auto-git.md globale e sincronizza documentazione workflow git automatizzato

### Fixed
- resolve emergency cooldown relaxation and vision filtering
- recalculate version numbers and format changelog
- enhanced restart-safe.sh with sudo and facial recognition support
- respect ignoreTokenLimit flag in dynamic_max_tokens check
- fix check-nvidia.mjs double database connection bug
- emergency relaxation ignores already_tried and non_chat_model_excluded


## [0.32.0] - 2026-11-02
### Added
- add log message expansion to dashboard
- move provider metrics to provider box, add color-coded log filters, fix session dedup and TDZ errors
- move provider metrics to providers tab, quantize unified history, fix session deduplication, fix ITPM emergency tier
- active events display, metric percentages, unified history row height, and train-daemon functionality
- merge training status into top model card

### Changed
- rewrite README.md to reflect actual project capabilities; dashboard: add provider % metrics, redesign pricing filter, add filter tooltips
- auto-git workflow execution with version bump to v1.13.10
- bump version to 1.13.9 and update changelog
- auto-git workflow v1.13.7 - cleanup, changelog standardization, version bump
- bump version to v1.13.6 and update docs


### Fixed
- update log colors and emergency relaxation filter
- re-evaluate error classification and punishment system
- update log colors and emergency relaxation filter
- resolve syntax error in dashboard logs


## [0.33.0] - 2026-11-03
### Added
- enhance Unified Chronology with per-model selection history
- emergency relaxation and fallback chain improvements
- show x/y non-active counts in detail lines, restore percentage display
- add dynamic non-active stats and colorize badges
- stop failure spiral for exhausted provider credentials

### Changed
- bump to v1.14.10 and update documentation
- Updated CHANGELOG.md with new version entry v1.14.10
- Updated README.md to reflect v1.14.10
- Updated package.json version to 1.14.10
- optimize git history and consolidate automation commits - Squash consecutive generic/automated commits (v1.13.6 to v1.13.7 workflow)
- Update documentation structure and changelog formatting
- Consolidate auto-git workflow updates and version bumps
- Update dashboard configuration and project rules
- Clean up temporary files and planning artifacts
- Update bandit model pruning and README references
- Consolidate provider metrics and documentation updates
- auto-git workflow execution v1.13.14 Repository cleanup, version bump, documentation updates, and project utilities tracking
- clean up temporary files
- auto-git workflow v1.14.7 - repository maintenance and documentation updates
- deduplicate CHANGELOG.md entries and update project version
- update version to 1.14.0 and CHANGELOG.md with auto-git workflow documentation


### Fixed
- reduce unified chronology table height and remove bottom margin
- add safeWrite helper for client disconnect handling and buffer management
- improve continuity with exponential backoff and emergency relaxation
- optimize error classification and fallback chain reliability


## [0.34.0] - 2026-11-04
### Added
- implement aggressive 3-strike punishment system and exponential backoff
- implement 3-strike aggressive punishment system for critical failures
- implement exponential backoff cooldown system with punishment tracking

### Changed
- remove project-level auto-git.md, use global version
- create enhanced auto-git.md, update CHANGELOG and README
- update all mode-specific AGENTS.md with 3-strike system documentation
- update README and AGENTS.md with v1.16.0 and 3-strike system
- add User/Group configuration for systemd service
- cleanup and documentation update for v1.15.0
- update AGENTS.md files with recent changes - exponential backoff, total_failures, error patterns, dashboard updates
- squash consecutive generic commits v1.14.7 to v1.14.10

### Fixed
- update CHANGELOG.md line references to match actual source
- add supports_vision checks in fallback model selection
- strip provider prefix from selection history model names
- use sanitizedModelId for proper error punishment
- improve error pattern matching for model errors
- resolve safeWrite initialization order error
- fix syntax error in renderAll() if/else structure
- resolve 'page not responding' with chunked rendering and debounced polling


## [0.35.0] - 2026-11-05
### Added
- add WebSocket support for real-time script output streaming

### Changed
- integrate auto-git.md into global ~/.roo/commands/ and remove project copy
- convert auto-git.mjs to markdown documentation
- update CHANGELOG, README, and version to v1.23.0
- normalize CHANGELOG.md formatting and add fix entry
- update CHANGELOG, README, and version according to Keep a Changelog 1.1.0
- update CHANGELOG, README, and version to v1.22.0
- update CHANGELOG, README, and version to v1.21.0
- update CHANGELOG, README, and version to v1.19.8
- update CHANGELOG, README, and version to v1.19.7
- update CHANGELOG, README, and version to v1.19.6
- update CHANGELOG, README, and version to v1.19.5
- update CHANGELOG, README, and version to v1.19.4
- improve changelog generation to follow Keep a Changelog v1.1.0
- update CHANGELOG, README, and version to v1.19.3
- update CHANGELOG, README, and version to v1.19.2
- update CHANGELOG, README, and version to 1.20.0
- update CHANGELOG, README, and version to 1.19.0
- bump version to v1.19.0 and update CHANGELOG, README

### Fixed
- resolve totalObservations undefined error in getDashboardStats
- update README.md version header to v1.20.0 with proper formatting
- correct version to 1.20.0 for WebSocket feature release


## [0.36.0] - 2026-11-06
### Added
- add real-time training status polling and scripts tab navigation
- enhance Models tab capabilities and UI layout
- enhance Models tab capabilities and UI layout

### Changed
- update CHANGELOG.md with dashboard real-time updates

### Fixed
- sync updateTrainingStatus() with bandit.mjs fix
- resolve parameter count mismatch in updateTrainingStatus()
- optimize dashboard UI elements, changelog modal, and responsive metrics
- add AbortController timeout and offline fallback to catalog sync
- fix provider expansion/collapse in Models tab
- correct flatMode variable usage in renderAll function
- resolve 5 UI/UX issues in Models tab
- resolve model count discrepancy and dashboard UI issues


## [0.37.0] - 2026-11-07
### Added
- Add live log streaming and fix training status cumulative metrics
- bump version to v1.28.0, update changelog and README, refine dashboard UI and model/provider reset actions
- bump version to v1.27.2, synchronize models_train during catalog sync, refine training daemon status and dashboard UI
- bump version to v1.27.1, synchronize models_train during catalog sync to fix GET /v1/models?source=train results=0
- bump version to v1.27.0, fix training feedback for models_train and optimize scripts manager table column widths
- bump version to v1.26.0 and update changelog and dashboard UI refinements
- refactor Train tab, optimize filters, responsive scripts manager, and training status heartbeat timeout
- refine dashboard UI and update release v1.24.4
- refine dashboard UI with container-scoped resets, clean train tab, and improved daemon controls
- implement dashboard improvements and refinements

### Changed
- update .gitignore and include raw git log
- v1.28.3 - robust error handling, toast notifications, restart-safe improvements
- bump version to 1.28.2 and suppress train models logging when inactive
- bump version to v1.25.0
- refine Scripts Manager running badge logic

### Fixed
- keep status active during inter-cycle pauses and extend daemon liveness tolerance
- add tooltip to Quota reset column and standardize Reset Model button labels
- add tooltip to Quota reset column and standardize Reset Model button labels
- optimize scripts manager table width and auto-activate quick action panel when running


## [0.38.0] - 2026-11-08
### Added
- optimize models & train tab layout and sanitize model names
- enhance runtime error classification, fallback routing, and health check validation
- optimize frontend dashboard reactivity, debouncing, AbortController request management, and visibility checks
- optimize frontend dashboard reactivity, debouncing, AbortController request management, and visibility checks
- release v1.28.6 - collapsible train providers, helper text removal, script output visibility, model metrics fix
- release v1.28.5 - dashboard enhancements, changelog modal, unified history badges, and daemon stability

### Changed
- remove raw_git_log.txt and ignore it
- release v1.28.9 - update changelog, README and system configurations

### Fixed
- execute workflow documentation and versioning updates for v1.28.11
- automatically flag models returning 404 as permanent=1 in training daemon and update docs/changelog
- track persistent 404 model errors and auto-mark permanent in train-daemon
- classify 503 Playwright and Cloudflare Playground errors as provider cooldown
- synchronize models view with dashboard metric boxes
- fix collapse behavior and metric filtering synchronization
- fix updateStat hoisting reference error in stats polling loop
- fix dashboard model metrics display and update version to 1.28.7


## [0.39.0] - 2026-11-09
### Added
- add 3-strike rule, event system, and training feedback metrics

### Changed
- enhance API documentation with examples and endpoint details
- update README with comprehensive documentation including 3-strike system and event system
- generate complete project documentation
- format changelog entries for test suite compliance
- release v1.28.15 - update documentation, changelog and dashboard
- release v1.28.15 - update documentation, changelog and dashboard

### Fixed
- database fallback for recent requests when in-memory buffer is empty
- correct typo in ESM __filename polyfill (__filename__ -> __filename)
- retain raw_git_log.txt for workflow compliance


## [0.40.0] - 2026-11-10
### Added
- integrate punishment events into unified history with WebSocket real-time updates

### Changed
- add CHANGELOG.md following Keep a Changelog and README.md with comprehensive documentation
- add Version History section and fix conventional commit format for test compliance
- isolate global dashboard metrics from tab-specific renders
- isolate filtered metrics from global dashboard stats
- correct syntax error in refreshAll function
- synchronize global metrics across all dashboard tabs
- refresh main metrics when switching tabs
- correct regex patterns for log entry type detection

### Fixed
- add Version History section and fix conventional commit format for test compliance
- isolate global dashboard metrics from tab-specific renders
- isolate filtered metrics from global dashboard stats
- correct syntax error in refreshAll function
- synchronize global metrics across all dashboard tabs
- refresh main metrics when switching tabs
- correct regex patterns for log entry type detection


## [0.41.0] - 2026-11-11
### Changed
- v1.28.22 - documentation, changelog, and configuration updates
- bump version to 1.28.20, fix copy button state persistence

### Fixed
- resolve API_TOKEN ReferenceError in WebSocket initialization
- consolidate copy-box-content event handlers and standardize timeout values
- resolve SQL param mismatches and sanitize model names
- retain raw_git_log.txt for workflow compliance


## [0.42.0] - 2026-11-12
### Added
- reset erroneous permanent bans and regenerate documentation

### Changed
- update AGENTS.md with 5-strike rule and StatsAggregator docs
- clean up AGENTS.md files with non-obvious project-specific info only
- add comprehensive CHANGELOG.md and README.md documentation

### Fixed
- fix changelog loading error and full stats reset
- allow statsAggregator reassignment from const to let
- prevent mass permanent model bans, upgrade to 5-strike rule, add real-time stats aggregator
- improve punishment system and real-time log sync
- improve error classification, metrics, and history sync
- prevent infinite ban loop after database reset by checking permanent status before incrementing consecutive_critical_failures


## [0.43.0] - 2026-11-13
### Added
- regenerate documentation and bump version to 1.30.0

### Changed
- bump to v0.47.0 and update documentation
- revert version bump to 0.46.0 to match existing changelog entry
- add commands, fix error classification (5-strike/cooldown-model), document resetProvider model reset
- Fix emergency mass-banning cascade: 429 no longer critical, emergency rejections don't escalate to ban
- align versions across changelog, package.json, and readme
- make changelog header self-referential instead of hardcoded version
- reverse changelog order and align header version with package.json

### Fixed
- resetProvider no longer clears models data
- provider quota conditional rollback and stream backpressure drain timeout
- provider reset no longer clears models Config attention flags
- reset Config count when resetting all models
- stream idle/max timeouts increased; bandit punishment and cascade guard relaxed
- skip bandit punishment for client disconnects/aborts
- resolve critical proxy issues and log streaming rewrite bug
- align error classification with config rules and fix recordFeedback non-object error handling
- provider reset now resets all models belonging to that provider
- resolve 401 auth-expired error handling and cascade guard issues
- prevent cascade cooldowns from emergency rejection feedback loop
- no longer resets provider history on models box reset
- keep metrics current on logs tab and populate Error Type/Countermeasure columns
- resolve top model empty, punishment WS scope, and log streaming overwrite


## [0.44.0] - 2026-11-14
### Changed
- Replace console.log/error/warn with structured logger calls (slogInfo/slogError/slogWarn)
- expand polling path prefixes to reduce access log noise
- add missing structured logger imports
- refactor startServer() with explicit HTTP server and EADDRINUSE handling, add sync debugging
- add diagnostic logging and robust error handling around fetchAndSyncModels() and update changelog
- handle missing catalog table during startup remote sync failure
- eliminate blocking model sync retry loop exceeding systemd start timeout
- add robust offline fallback model seeding in fetchAndSyncModels() and fix port release race condition in restart script
- improve _sanitizeModelId() to handle nested/duplicated provider prefixes

### Fixed
- None


## [0.45.0] - 2026-11-15
### Changed
- update mode signatures and implement free model identification system

### Fixed
- None


## [0.46.0] - 2026-11-16
### Changed
- release v0.49.6 - remove dead wait_for_service_failed code, update docs and version
- bump version to 0.49.5

### Fixed
- None


## [0.47.0] - 2026-11-16
### Changed
- complete auto-git workflow: versioning, documentation updates, and repository hygiene

### Fixed
- None


## [0.48.0] - 2026-11-16
### Changed
- complete auto-git workflow: versioning, documentation updates, and repository hygiene

### Fixed
- None
