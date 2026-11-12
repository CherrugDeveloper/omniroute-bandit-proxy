---
description: Changelog for OmniRoute Bandit Proxy
---

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Version History

## [1.28.23] - 2026-11-12

### Fixed
- fix(dashboard): resolve `API_TOKEN` ReferenceError in WebSocket initialization
- fix(dashboard): fix copy button state persistence — buttons now reset to original icon after 1 s
- fix(frontend): consolidate duplicate `copy-box-content` event listeners, eliminating race conditions
- fix(frontend): standardize copy button timeout to 1000 ms for consistent UX
- fix(bandit): resolve SQL parameter count mismatch in punishment persistence (11 columns vs 4 params)
- fix(dashboard): use backend-sanitized model names directly instead of redundant frontend sanitization
- fix(dashboard): dashboard metrics now accurately reflect punishment events in `models` table
- fix(gitignore): retain `raw_git_log.txt` for auto-git workflow compliance
- fix(ban-metrics): diagnose and reset 1192 erroneously permanently-banned models in database
- fix(ban-metrics): add diagnostic scripts `verify-ban-count.mjs` and `inspect-ban-details.mjs`

### Added
- feat(dashboard): integrate punishment events into unified history with WebSocket real-time updates
- feat(punishment): 3-strike rule, event system, and training feedback metrics

## [1.28.15] - 2026-11-09

### Added
- feat(punishment): 3-strike aggressive punishment system with exponential backoff cooldowns (15s→5m→30m→2h→permanent)
- feat(dashboard): punishment event log with unified history and WebSocket streaming
- feat(training): training feedback metrics with isolated `models_train` table

### Fixed
- fix(log-filtering): correct regex patterns for log entry type detection
- fix: database fallback for recent requests when in-memory buffer is empty
- fix: correct typo in ESM `__filename` polyfill (`__filename__` → `__filename`)
- fix(dashboard): isolate global metrics from tab-specific and filtered renders
- fix(dashboard): correct syntax error in `refreshAll` function
- fix(dashboard): synchronize global metrics across all dashboard tabs
- fix(dashboard): refresh main metrics when switching tabs

## [1.28.9] - 2026-11-08

### Added
- feat(proxy): enhanced runtime error classification, fallback routing, and health check validation
- feat(dashboard): optimized frontend reactivity, debouncing, `AbortController` request management, and visibility checks
- feat(dashboard): collapsible models/train tab provider groups, sanitized model name display

### Fixed
- fix(bandit): classify 503 Playwright and Cloudflare Playground errors as provider cooldown
- fix(dashboard): synchronize models view with dashboard metric boxes
- fix(dashboard): fix collapse behavior and metric filtering synchronization
- fix(dashboard): fix `updateStat` hoisting reference error in stats polling loop
- fix(training): auto-mark models returning persistent 404 as `permanent=1` in training daemon

## [1.28.3] - 2026-11-07

### Added
- feat(training): live log streaming and cumulative training metrics
- feat(dashboard): toast notifications, collapsible train providers, changelog modal, unified history badges

### Fixed
- fix(dashboard): tooltip on Quota reset column, standardize Reset Model button labels
- fix(training): keep training status active during inter-cycle pauses; extend daemon liveness tolerance

### Changed
- chore: bump version to 1.28.2 and suppress train models logging when inactive

## [1.28.0] - 2026-11-07

### Added
- feat(release): synchronize `models_train` during catalog sync
- feat(release): training feedback for `models_train`, optimized scripts manager table

### Changed
- Bump version to v1.28.0 with dashboard UI and model/provider reset actions refinements

## [1.27.0] - 2026-11-07

### Added
- feat(release): synchronize `models_train` during catalog sync fixing GET `/v1/models?source=train` returning 0 results
- feat(release): training feedback integration for `models_train`

## [1.26.0] - 2026-11-07

### Added
- feat(dashboard): refactored Train tab, responsive scripts manager, training status heartbeat timeout
- feat(dashboard): container-scoped resets, clean train tab, daemon controls

### Fixed
- fix(bandit,dashboard): SQL catalog insertion parameter mismatch

## [1.20.0] - 2026-11-07

### Added
- feat(dashboard): comprehensive dashboard improvements and bug fixes
- feat(dashboard): UCB1 score display, provider health indicators, soft bias controls

### Fixed
- fix(bandit): multiple SQL schema migrations and error classification improvements

## [1.19.0] - 2026-11-06

### Added
- feat(bandit): `DiscountedUCB1Bandit` with 0.99 per-event discount factor
- feat(proxy): provider-level quota enforcement (RPM/RPD) with atomic minute+day windows
- feat(sessions): session management with 30-minute TTL and 60-second stream idle timeout
