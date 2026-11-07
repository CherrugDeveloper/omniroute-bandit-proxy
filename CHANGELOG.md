# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0-1.0.html).

## [1.28.0] - 2026-11-07

### Added
- feat(dashboard): add container-scoped model and provider resets and bulk reset confirmation dialogs
- feat(dashboard): enhance Models tab capabilities and UI layout with responsive columns

### Changed
- refactor(dashboard): optimize scripts manager table width and remove obsolete toggle view buttons
- refactor(commands): streamline auto-git workflow documentation and tooling

### Fixed
- fix(dashboard): resolve model and provider reset actions requiring individual selection when bulk action is triggered
- fix(bandit): synchronize models_train during catalog sync to fix `GET /v1/models?source=train` results=0

## [1.27.2] - 2026-11-06

### Added
- feat(release): bump version to v1.27.2, synchronize models_train during catalog sync, refine training daemon status and dashboard UI

### Changed
- style(dashboard): refine training daemon status indicator and UI widgets

### Fixed
- fix(bandit): synchronize `models_train` table during catalog synchronization

## [1.27.1] - 2026-11-05

### Added
- feat(release): bump version to v1.27.1

### Fixed
- fix(bandit): synchronize models_train during catalog sync to fix `GET /v1/models?source=train` returning zero results

## [1.27.0] - 2026-11-04

### Added
- feat(release): bump version to v1.27.0

### Fixed
- fix(train): fix training feedback for models_train table
- fix(dashboard): optimize scripts manager table column widths

## [1.26.0] - 2026-11-03

### Added
- feat(release): bump version to v1.26.0 and update changelog and dashboard UI refinements

### Fixed
- fix(dashboard): optimize scripts manager table width and auto-activate quick action panel when running

## [1.25.0] - 2026-11-02

### Added
- chore: bump version to v1.25.0

### Changed
- style(dashboard): refine Scripts Manager running badge logic and responsive layouts

## [1.24.4] - 2026-11-01

### Added
- feat(dashboard): refactor Train tab, optimize filters, responsive scripts manager, and training status heartbeat timeout
- feat(dashboard): refine dashboard UI and update release v1.24.4

### Fixed
- fix(bandit,dashboard): fix SQL catalog insertion parameter mismatch and apply dashboard UI refinements

## [1.24.2] - 2026-10-31

### Added
- feat(dashboard): refine dashboard UI with container-scoped resets, clean train tab, and improved daemon controls
- feat(dashboard): implement dashboard improvements and refinements
- feat(dashboard): comprehensive dashboard improvements and bug fixes v1.24.2
- feat(dashboard): add real-time training status polling and scripts tab navigation

### Fixed
- fix(train-daemon): sync updateTrainingStatus() with bandit.mjs fix
- fix(sql): resolve parameter count mismatch in updateTrainingStatus()
- fix(dashboard): optimize dashboard UI elements, changelog modal, and responsive metrics
- fix(bandit): add AbortController timeout and offline fallback to catalog sync
- fix(dashboard): fix provider expansion/collapse in Models tab
- fix(dashboard): correct flatMode variable usage in renderAll function
- fix(models): resolve 5 UI/UX issues in Models tab
- fix: resolve model count discrepancy and dashboard UI issues

## Version History
- [1.28.0] - 2026-11-07
- [1.27.2] - 2026-11-06
- [1.27.1] - 2026-11-05
- [1.27.0] - 2026-11-04
- [1.26.0] - 2026-11-03
- [1.25.0] - 2026-11-02
- [1.24.4] - 2026-11-01
- [1.24.2] - 2026-10-31
