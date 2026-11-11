# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.28.20] - 2026-11-11

### Fixed
- fix(dashboard): resolve copy button state persistence issue where buttons remained in checked state instead of resetting to original icon
- fix(dashboard): consolidate duplicate copy-box-content event listener to prevent race conditions
- fix(dashboard): standardize copy button timeout from 1500ms to 1000ms for consistent UX

## [1.28.19] - 2026-11-11

### Fixed
- fix(bandit): resolve SQL parameter count mismatches in punishment persistence code (11 columns vs 4 params)
- fix(dashboard): use backend-sanitized model names directly instead of redundant frontend sanitization
- fix(dashboard): ensure dashboard metrics accurately reflect punishment events in models table

## [1.28.18] - 2026-11-10

### Added
- feat(dashboard): integrate punishment events into unified history with WebSocket real-time updates
- feat(punishment): add 3-strike rule, event system, and training feedback metrics

### Fixed
- fix(dashboard): isolate global dashboard metrics from tab-specific renders
- fix(dashboard): isolate filtered metrics from global dashboard stats
- fix(dashboard): correct syntax error in refreshAll function
- fix(dashboard): synchronize global metrics across all dashboard tabs
- fix(dashboard): refresh main metrics when switching tabs
- fix(log-filtering): correct regex patterns for log entry type detection
- fix: database fallback for recent requests when in-memory buffer is empty
- fix: correct typo in ESM __filename polyfill (__filename__ -> __filename)

### Changed
- chore(changelog): format changelog entries for test suite compliance

### Deprecated
- Deprecate old tab-specific log rendering approaches

### Removed
- Remove tab-events HTML/CSS from public/dashboard.html

### Security
- No security-related changes in this release

## [1.28.17] - 2026-11-09

### Added
- feat(dashboard): enhance training status polling and scripts tab navigation
- feat(dashboard): add real-time training status polling and scripts tab navigation

### Fixed
- fix(bandit): classify 503 Playwright and Cloudflare Playground errors as provider cooldown
- fix(dashboard): synchronize models view with dashboard metric boxes
- fix(dashboard): fix collapse behavior and metric filtering synchronization
- fix(dashboard): fix updateStat hoisting reference error in stats polling loop
- fix(dashboard): fix dashboard model metrics display and update version to 1.28.7

## [1.28.16] - 2026-11-08

### Added
- feat(dashboard): release v1.28.5 - dashboard enhancements, changelog modal, unified history badges, and daemon stability
- feat(dashboard): release v1.28.5 - dashboard enhancements, changelog modal, unified history badges, and daemon stability

### Fixed
- fix(dashboard): fix dashboard model metrics display and update version to 1.28.7
- fix(bandit): resolve totalObservations undefined error in getDashboardStats

## [1.28.15] - 2026-11-08

### Changed
- chore(release): release v1.28.15 - update documentation, changelog and dashboard

## [1.28.14] - 2026-11-08

### Added
- feat(dashboard): release v1.28.5 - dashboard enhancements, changelog modal, unified history badges, and daemon stability

## [1.28.13] - 2026-11-08

### Fixed
- fix(bandit): classify 503 Playwright and Cloudflare Playground errors as provider cooldown

## [1.28.12] - 2026-11-08

### Changed
- chore(release): release v1.28.9 - update changelog, README and system configurations

## [1.28.11] - 2026-11-08

### Fixed
- fix(auto-git): execute workflow documentation and versioning updates for v1.28.11

## [1.28.10] - 2026-11-08

### Fixed
- fix(train): automatically flag models returning 404 as permanent=1 in training daemon and update docs/changelog

## [1.28.9] - 2026-11-08

### Changed
- chore(release): release v1.28.9 - update changelog, README and system configurations

## [1.28.8] - 2026-11-08

### Fixed
- fix(bandit): use sanitizedModelId for proper error punishment

### Changed
- fix(config): improve error pattern matching for model errors

## [1.28.7] - 2026-11-08

### Fixed
- fix(bandit): correct typo in ESM __filename polyfill (__filename__ -> __filename)
- fix(dashboard): fix updateStat hoisting reference error in stats polling loop
- fix(dashboard): fix dashboard model metrics display and update version to 1.28.7

## [1.28.6] - 2026-11-08

### Added
- feat(dashboard): release v1.28.6 - collapsible train providers, helper text removal, script output visibility, model metrics fix

## [1.28.5] - 2026-11-08

### Changed
- feat(dashboard): release v1.28.5 - dashboard enhancements, changelog modal, unified history badges, and daemon stability

## [1.28.4] - 2026-11-08

### Changed
- feat(dashboard): optimize models & train tab layout and sanitize model names

## [1.28.3] - 2026-11-07

### Changed
- chore(release): v1.28.3 - robust error handling, toast notifications, restart-safe improvements

## [1.28.2] - 2026-11-07

### Changed
- chore: bump version to 1.28.2 and suppress train models logging when inactive

## [1.28.1] - 2026-11-07

### Fixed
- fix(dashboard): add tooltip to Quota reset column and standardize Reset Model button labels

## [1.28.0] - 2026-11-07

### Changed
- feat(release): bump version to v1.28.0, update changelog and README, refine dashboard UI and model/provider reset actions

## [1.27.2] - 2026-11-07

### Changed
- feat(release): bump version to v1.27.2, synchronize models_train during catalog sync, refine training daemon status and dashboard UI

## [1.27.1] - 2026-11-07

### Changed
- feat(release): bump version to v1.27.1, synchronize models_train during catalog sync to fix GET /v1/models?source=train results=0

## [1.27.0] - 2026-11-07

### Changed
- feat(release): bump version to v1.27.0, fix training feedback for models_train and optimize scripts manager table column widths

## [1.26.0] - 2026-11-07

### Changed
- feat(release): bump version to v1.26.0 and update changelog and dashboard UI refinements

## [1.25.0] - 2026-11-07

### Changed
- chore: bump version to v1.25.0

## [1.24.4] - 2026-11-07

### Added
- feat(dashboard): refine dashboard UI and update release v1.24.4

## [1.24.3] - 2026-11-07

### Changed
- style(dashboard): refine Scripts Manager running badge logic

## [1.24.2] - 2026-11-07

### Added
- feat(dashboard): comprehensive dashboard improvements and bug fixes

### Changed
- feat(dashboard): implement dashboard improvements and refinements

## [1.24.1] - 2026-11-07

### Changed
- feat(dashboard): refine dashboard UI with container-scoped resets, clean train tab, and improved daemon controls

## [1.24.0] - 2026-11-07

### Added
- feat(dashboard): implement dashboard improvements and refinements

### Changed
- feat(dashboard): comprehensive dashboard improvements and bug fixes v1.24.2

## [1.23.0] - 2026-11-07

### Changed
- chore: update CHANGELOG, README, and version to v1.23.0

## [1.22.0] - 2026-11-05

### Changed
- chore: update CHANGELOG, README, and version to v1.22.0

## [1.21.0] - 2026-11-05

### Changed
- chore: update CHANGELOG, README, and version to v1.21.0

## [1.20.0] - 2026-11-05

### Fixed
- fix: update README.md version header to v1.20.0 with proper formatting
- fix: correct version to 1.20.0 for WebSocket feature release

### Added
- feat: add WebSocket support for real-time script output streaming

## [1.19.8] - 2026-11-05

### Changed
- chore: update CHANGELOG, README, and version to v1.19.8

## [1.19.7] - 2026-11-05

### Changed
- chore: update CHANGELOG, README, and version to v1.19.7

## [1.19.6] - 2026-11-05

### Changed
- chore: update CHANGELOG, README, and version to v1.19.6

## [1.19.5] - 2026-11-05

### Changed
- chore: update CHANGELOG, README, and version to v1.19.5

## [1.19.4] - 2026-11-05

### Changed
- chore: update CHANGELOG, README, and version to v1.19.4

## [1.19.3] - 2026-11-05

### Changed
- chore: update CHANGELOG, README, and version to v1.19.3

## [1.19.2] - 2026-11-05

### Changed
- chore: update CHANGELOG, README, and version to v1.19.2

## [1.19.1] - 2026-11-05

### Changed
- chore: update CHANGELOG, README, and version to 1.20.0

## [1.19.0] - 2026-11-05

### Changed
- chore: update CHANGELOG, README, and version to 1.19.0

## [1.18.0] - 2026-11-05

### Changed
- chore: update CHANGELOG, README, and version to 1.18.0

## [1.17.0] - 2026-11-05

### Changed
- chore: update CHANGELOG, README, and version to 1.17.0

## [1.16.0] - 2026-11-05

### Added
- docs: update README and AGENTS.md with v1.16.0 and 3-strike system

### Changed
- feat(bandit): implement 3-strike aggressive punishment system for critical failures

## [1.15.0] - 2026-11-04

### Changed
- chore: project cleanup and documentation update for v1.15.0

## [1.14.10] - 2026-11-03

### Changed
- chore: optimize git history and consolidate automation commits - v1.13.6 to v1.13.7 workflow

## [1.14.9] - 2026-11-03

### Changed
- chore(repo): auto-git workflow v1.14.7 - repository maintenance and documentation updates

## [1.14.8] - 2026-11-03

### Fixed
- fix(dashboard): reduce unified chronology table height and remove bottom margin

### Added
- feat(dashboard): enhance Unified Chronology with per-model selection history

## [1.14.7] - 2026-11-03

### Changed
- chore: deduplicate CHANGELOG.md entries and update project version

## Version History

[1.28.20]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.19...v1.28.20
[1.28.19]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.18...v1.28.19
[1.28.18]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.17...v1.28.18
[1.28.17]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.16...v1.28.17
[1.28.16]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.15...v1.28.16
[1.28.15]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.14...v1.28.15
[1.28.14]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.13...v1.28.14
[1.28.13]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.12...v1.28.13
[1.28.12]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.11...v1.28.12
[1.28.11]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.10...v1.28.11
[1.28.10]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.9...v1.28.10
[1.28.9]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.8...v1.28.9
[1.28.8]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.7...v1.28.8
[1.28.7]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.6...v1.28.7
[1.28.6]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.5...v1.28.6
[1.28.5]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.4...v1.28.5
[1.28.4]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.3...v1.28.4
[1.28.3]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.2...v1.28.3
[1.28.2]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.1...v1.28.2
[1.28.1]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.28.0...v1.28.1
[1.28.0]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.27.2...v1.28.0
[1.27.2]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.27.1...v1.27.2
[1.27.1]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.27.0...v1.27.1
[1.27.0]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.26.0...v1.27.0
[1.26.0]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.25.0...v1.26.0
[1.25.0]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.24.4...v1.25.0
[1.24.4]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.24.3...v1.24.4
[1.24.3]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.24.2...v1.24.3
[1.24.2]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.24.1...v1.24.2
[1.24.1]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.24.0...v1.24.1
[1.24.0]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.23.0...v1.24.0
[1.23.0]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.22.0...v1.23.0
[1.22.0]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.21.0...v1.22.0
[1.21.0]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.20.0...v1.21.0
[1.20.0]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.19.8...v1.20.0
[1.19.8]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.19.7...v1.19.8
[1.19.7]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.19.6...v1.19.7
[1.19.6]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.19.5...v1.19.6
[1.19.5]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.19.4...v1.19.5
[1.19.4]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.19.3...v1.19.4
[1.19.3]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.19.2...v1.19.3
[1.19.2]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.19.1...v1.19.2
[1.19.1]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.19.0...v1.19.1
[1.19.0]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.18.0...v1.19.0
[1.18.0]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.17.0...v1.18.0
[1.17.0]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.16.0...v1.17.0
[1.16.0]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.15.0...v1.16.0
[1.15.0]: https://github.com/CherrugDeveloper/omniroute-bandit-proxy/compare/v1.14.10...v1.15.0