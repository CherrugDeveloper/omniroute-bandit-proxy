# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.28.25] - 2026-11-12

### Fixed
- fix(bandit): removed timeout misclassification as a critical failure (now transient, triggering cooldown instead of ban) [(326ddab)](commit:326ddab)
- fix(bandit): updated `getModelsSummary` SQL to correctly handle banned model counts via `COALESCE` [(326ddab)](commit:326ddab)
- fix(bandit): ensured `provider_history` and `models` tables remain in sync on all ban/cooldown events in `recordFeedback` [(326ddab)](commit:326ddab)
- fix(bandit): updated `events.mjs` to match the consistent transient classification for timeouts [(326ddab)](commit:326ddab)

### Changed
- docs(AGENTS.md): updated to reflect accurate 3-strike system behavior and failure classifications [(326ddab)](commit:326ddab)

## Version History

## [1.28.22] - 2026-11-07

### Fixed
- fix(ban-metrics): reset erroneous permanent bans and regenerated documentation [(490b3d6)](commit:490b3d6)

## [1.28.20] - 2026-11-07

### Fixed
- fix(dashboard): resolved copy button state persistence [(8eace18)](commit:8eace18)

## [1.28.15] - 2026-11-09

### Fixed
- fix(bandit,dashboard): resolved SQL param mismatches and sanitized model names [(aa80b78)](commit:aa80b78)

### Added
- feat(dashboard): integrated punishment events into unified history with WebSocket real-time updates [(d071f02)](commit:d071f02)

### Changed
- docs: added CHANGELOG.md following Keep a Changelog and README.md with comprehensive documentation [(d13b95c)](commit:d13b95c)
- docs: updated documentation, changelog and dashboard [(93d81a6)](commit:93d81a6)

## [1.28.11] - 2026-11-08

### Fixed
- chore: executed workflow documentation and versioning updates [(1db4db2)](commit:1db4db2)

## [1.28.9] - 2026-11-08

### Fixed
- fix(train-daemon): automatically flag models returning 404 as permanent=1 in training daemon [(3f63fb9)](commit:3f63fb9)
- fix(train-daemon): track persistent 404 model errors and auto-mark permanent [(291a5ca)](commit:291a5ca)

### Changed
- docs: updated changelog, README and system configurations [(d5e6a18)](commit:d5e6a18)

## [1.28.7] - 2026-11-08

### Fixed
- fix(bandit): classified 503 Playwright and Cloudflare Playground errors as provider cooldown [(26d1f0b)](commit:26d1f0b)
- fix(dashboard): synchronized models view with dashboard metric boxes [(896c508)](commit:896c508)
- fix(dashboard): fixed collapse behavior and metric filtering synchronization [(3a1a3b6)](commit:3a1a3b6)
- fix(dashboard): fixed updateStat hoisting reference error in stats polling loop [(4d3b6ff)](commit:4d3b6ff)
- fix(dashboard): fixed dashboard model metrics display [(8d690c9)](commit:8d690c9)

## [1.28.6] - 2026-11-08

### Added
- feat(dashboard): collapsible train providers, helper text removal, script output visibility, model metrics fix [(d21e7e0)](commit:d21e7e0)

## [1.28.5] - 2026-11-08

### Added
- feat(dashboard): dashboard enhancements, changelog modal, unified history badges, and daemon stability [(9cdb0a9)](commit:9cdb0a9)

## [1.28.3] - 2026-11-07

### Fixed
- fix(dashboard): robust error handling, toast notifications, restart-safe improvements [(0d522ed)](commit:0d522ed)

## [1.28.2] - 2026-11-07

### Changed
- chore: bump version and suppress train models logging when inactive [(cb20198)](commit:cb20198)

## [1.28.0] - 2026-11-07

### Added
- feat(dashboard): refined dashboard UI and model/provider reset actions [(69939ae)](commit:69939ae)

### Changed
- chore: bump version to v1.28.0 [(69939ae)](commit:69939ae)

## [1.27.2] - 2026-11-07

### Fixed
- fix(train-daemon): synchronized models_train during catalog sync [(0634aca)](commit:0634aca)

### Changed
- chore(train-daemon): refined training daemon status and dashboard UI [(0634aca)](commit:0634aca)

## [1.27.1] - 2026-11-07

### Fixed
- fix(train-daemon): synchronized models_train during catalog sync to fix GET /v1/models?source=train results=0 [(9aeccfb)](commit:9aeccfb)

## [1.27.0] - 2026-11-07

### Fixed
- fix(train-feedback): fixed training feedback for models_train [(946ac5f)](commit:946ac5f)

### Changed
- chore(dashboard): optimized scripts manager table column widths [(946ac5f)](commit:946ac5f)

## [1.26.0] - 2026-11-07

### Changed
- chore(dashboard): dashboard UI refinements [(7b33f2c)](commit:7b33f2c)

## [1.25.0] - 2026-11-07

### Changed
- chore: bump version to v1.25.0 [(643417e)](commit:643417e)

## [1.24.4] - 2026-11-07

### Changed
- chore(dashboard): refined dashboard UI [(351616f)](commit:351616f)

## [1.24.2] - 2026-11-07

### Added
- feat(dashboard): comprehensive dashboard improvements and bug fixes [(69f36de)](commit:69f36de)

### Fixed
- fix(bandit): fix SQL catalog insertion parameter mismatch [(c40f67f)](commit:c40f67f)

## [1.23.0] - 2026-11-05

### Fixed
- fix(dashboard): resolved totalObservations undefined error in getDashboardStats [(26c3222)](commit:26c3222)

### Changed
- docs: updated CHANGELOG, README, and version [(bcbdc55)](commit:bcbdc55)

## [1.22.0] - 2026-11-05

### Changed
- docs: updated CHANGELOG, README, and version [(0749aa4)](commit:0749aa4)

## [1.21.0] - 2026-11-05

### Changed
- docs: updated CHANGELOG, README, and version [(9497ab1)](commit:9497ab1)

## [1.20.0] - 2026-11-05

### Added
- feat(server): WebSocket support for real-time script output streaming [(957706a)](commit:957706a)

### Fixed
- fix(version): corrected version to 1.20.0 for WebSocket feature release [(b11c0b3)](commit:b11c0b3)

### Changed
- docs: updated README.md version header [(366aa06)](commit:366aa06)

## [1.19.8] - 2026-11-05

### Changed
- docs: updated CHANGELOG, README, and version [(db9f424)](commit:db9f424)

## [1.19.7] - 2026-11-05

### Changed
- docs: updated CHANGELOG, README, and version [(1b438dc)](commit:1b438dc)

## [1.19.6] - 2026-11-05

### Changed
- docs: updated CHANGELOG, README, and version [(05e566f)](commit:05e566f)

## [1.19.5] - 2026-11-05

### Changed
- docs: updated CHANGELOG, README, and version [(e197627)](commit:e197627)

## [1.19.4] - 2026-11-05

### Changed
- docs: updated CHANGELOG, README, and version [(2a6dc34)](commit:2a6dc34)

## [1.19.3] - 2026-11-05

### Changed
- docs: updated CHANGELOG, README, and version [(01fb985)](commit:01fb985)

## [1.19.2] - 2026-11-05

### Changed
- docs: updated CHANGELOG, README, and version [(1ba0384)](commit:1ba0384)

## [1.19.0] - 2026-11-05

### Changed
- chore: bump version to v1.19.0 and update CHANGELOG, README [(a4b03d7)](commit:a4b03d7)
- docs: updated CHANGELOG, README, and version [(51aff40)](commit:51aff40)
- docs: updated CHANGELOG, README, and version [(e3cd21f)](commit:e3cd21f)

## [1.18.0] - 2026-11-04

### Changed
- docs: updated CHANGELOG, README, and version [(7ee8106)](commit:7ee8106)

## [1.16.0] - 2026-11-04

### Added
- feat(security): implemented 3-strike aggressive punishment system for critical failures [(87fd346)](commit:87fd346)

### Changed
- docs: updated README and AGENTS.md with v1.16.0 and 3-strike system documentation [(1e5079c)](commit:1e5079c)
- docs: updated all mode-specific AGENTS.md with 3-strike system documentation [(8838744)](commit:8838744)

## [1.15.0] - 2026-11-04

### Fixed
- fix: cleanup and documentation update [(56634e6)](commit:56634e6)
- fix(bandit): resolve 'safeWrite initialization order error' [(a18b5dc)](commit:a18b5dc)

### Changed
- chore: add User/Group configuration for systemd service [(b70bea6)](commit:b70bea6)
- fix(bandit): use sanitizedModelId for proper error punishment [(fa480e1)](commit:fa480e1)

## [1.14.10] - 2026-11-04

### Changed
- chore: bump to v1.14.10 and update documentation [(fd3dbcc)](commit:fd3dbcc)

## [1.14.7] - 2026-11-04

### Changed
- chore: repository maintenance and documentation updates [(1e52730)](commit:1e52730)

## [1.14.0] - 2026-11-04

### Fixed
- fix(bandit): optimize error classification and fallback chain reliability [(18adc0c)](commit:18adc0c)
- fix(bandit): re-evaluate error classification and punishment system [(042f4c0)](commit:042f4c0)

### Added
- feat(bandit): emergency relaxation and fallback chain improvements [(3f6c454)](commit:3f6c454)

### Changed
- chore: update version to 1.14.0 and CHANGELOG.md with auto-git workflow documentation [(f2e2e4f)](commit:f2e2e4f)

## [1.13.14] - 2026-11-04

### Changed
- chore: repository cleanup, version bump, documentation updates, and project utilities tracking [(5e652ec)](commit:5e652ec)

## [1.13.10] - 2026-11-04

### Changed
- chore: auto-git workflow execution with version bump [(c40f6c5)](commit:c40f6c5)

## [1.13.9] - 2026-11-05

### Changed
- chore: bump version to 1.13.9 and update changelog [(d73ff8c)](commit:d73ff8c)

## [1.13.7] - 2026-11-05

### Changed
- chore: auto-git workflow cleanup, changelog standardization, version bump [(1bad5d1)](commit:1bad5d1)

## [1.13.6] - 2026-11-07

### Changed
- chore: bump version to v1.13.6 and update docs [(13c13e9)](commit:13c13e9)

## [1.13.5] - 2026-11-07

### Changed
- chore: update version to v1.13.5 and documentation [(6c3449a)](commit:6c3449a)

## [1.0.2] - 2026-11-05

### Changed
- chore: update changelog v1.0.2, README version bump and bandit model pruning [(ebadb86)](commit:ebadb86)

## [1.0.0] - 2026-11-09

### Added
- feat: version 1.0.0 changelog and documentation [(64b3a30)](commit:64b3a30)

## [1.1.90] - 2026-10-30

### Changed
- chore: version bump f88bb76 [(f88bb76)](commit:f88bb76)

## [1.1.63] - 2026-11-05

### Changed
- docs: update CHANGELOG.md for v1.1.63 [(64643cc)](commit:64643cc)

## [1.1.58] - 2026-11-05

### Changed
- docs: add changelog entry for discarded models spec sheet & per-group provider quota [(70fc0f1)](commit:70fc0f1)

## [1.1.8] - 2026-11-05

### Changed
- docs: update CHANGELOG.md for v1.1.8 [(bef609b)](commit:bef609b)

## [1.1.1] - 2026-11-04

### Added
- feat(api): API modelli/provider, fix HTML dashboard, CHANGELOG [(fc5d495)](commit:fc5d495)

## [1.1.0] - 2026-11-04

### Added
- feat(quota): provider quota system - dashboard table, needs_attention filter, CHANGELOG [(495a489)](commit:495a489)

### Fixed
- fix(quota): migration quota + remove needs_attention from filter [(a57f274)](commit:a57f274)
