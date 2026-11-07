# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0-1.0.html).

## Version History

- [1.28.1] - 2026-11-07
- [1.28.0] - 2026-11-07
- [1.27.2] - 2026-11-07
- [1.27.1] - 2026-11-07
- [1.27.0] - 2026-11-07
- [1.26.0] - 2026-11-07
- [1.25.0] - 2026-11-07
- [1.24.4] - 2026-11-07
- [1.24.2] - 2026-11-07
- [1.23.0] - 2026-11-07
- [1.22.0] - 2026-11-07
- [1.21.0] - 2026-11-07
- [1.20.0] - 2026-11-07
- [1.19.8] - 2026-11-06
- [1.19.7] - 2026-11-05
- [1.19.6] - 2026-11-04
- [1.19.5] - 2026-11-03
- [1.19.4] - 2026-11-02
- [1.19.3] - 2026-11-01
- [1.19.3] - 2026-10-31
- [1.19.3] - 2026-10-30
- [1.19.3] - 2026-10-29
- [1.19.3] - 2026-10-28
- [1.19.2] - 2026-10-27
- [1.19.2] - 2026-10-26
- [1.19.1] - 2026-10-25
- [1.19.1] - 2026-10-24
- [1.19.0] - 2026-10-23
- [1.18.0] - 2026-10-22
- [1.17.0] - 2026-10-20
- [1.16.0] - 2026-10-18
- [1.15.0] - 2026-10-17
- [1.14.0] - 2026-10-13
- [1.13.0] - 2026-10-12
- [1.13.0] - 2026-10-11
- [1.12.0] - 2026-10-10
- [1.11.0] - 2026-10-09
- [1.10.0] - 2026-10-08
- [1.9.0] - 2026-10-07
- [1.8.0] - 2026-10-05
- [1.7.0] - 2026-10-03
- [1.6.0] - 2026-10-01
- [1.5.0] - 2026-09-30
- [1.4.0] - 2026-09-28
- [1.3.0] - 2026-09-20
- [1.2.0] - 2026-09-15
- [1.1.0] - 2026-09-10
- [1.0.0] - 2026-09-01

## [1.28.1] - 2026-11-07

### Fixed
- feat(dashboard): Add tooltip to "Quota reset" column header explaining "Tempo rimanente stimato fino al reset della quota/rate limit (RPM/RPD) del provider" in Provider Quota tab
- feat(dashboard): Standardize "Reset Model" button labels across Models and Train tabs for consistency
- feat(dashboard): Update reset training confirmation message to "Sei sicuro di voler resettare lo stato del training?" for clarity
- feat(bandit): Optimize training daemon status reporting in `getTrainingStatus()` with 30-second timeout threshold and explicit handling of missing `updated_at` timestamps to accurately distinguish between active training and an idle daemon

### Changed
- feat(dashboard): Normalize typography across UI with extended system font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`) and base font size of `13px`

## [1.28.0] - 2026-11-07

### Added
- feat(dashboard): Real-time training status polling and Scripts Manager tab navigation integration
- feat(dashboard): Container-scoped independent reset buttons for top UI stats boxes
- feat(dashboard): Quick actions visibility for scripts manager and log training navigation

### Fixed
- fix(dashboard): Correct flatMode variable usage in renderAll function for Models tab toggle
- fix(dashboard): Fix provider expand/collapse and half-screen responsive table columns
- fix(dashboard): Resolve model count discrepancy and dashboard UI issues (API limit increased, status filter bug, responsive column widths)
- fix(dashboard): Fix 5 UI/UX issues in Models tab (provider expansion, default collapsed state, scrollbar visibility, button visibility on small screens, toggle view button)
- fix(bandit): Resolve totalObservations undefined error in getDashboardStats
- fix(bandit): Fix SQL catalog insertion parameter mismatch
- fix(train-daemon): Sync updateTrainingStatus() with bandit.mjs fix (parameter count mismatch)

### Changed
- refactor(dashboard): Refactor Train tab, optimize filters, responsive scripts manager, and training status heartbeat timeout
- refactor(dashboard): Align Train tab table structure with Models tab
- refactor(dashboard): Optimize minN/minAvg filter placeholders with clear tooltips
- refactor(dashboard): Integrate 'Reset Tutti i Provider' button into Provider table header
- refactor(dashboard): Make Scripts Manager table responsive with fixed layout

## [1.27.2] - 2026-11-07

### Added
- feat(dashboard): Training daemon status refinements and UI improvements

### Fixed
- fix(catalog): Synchronize models_train during catalog sync to fix GET /v1/models?source=train results=0

## [1.27.1] - 2026-11-07

### Fixed
- fix(catalog): Synchronize models_train during catalog sync to fix GET /v1/models?source=train returning zero results

## [1.27.0] - 2026-11-07

### Fixed
- fix(training): Fix training feedback for models_train table
- fix(dashboard): Optimize scripts manager table column widths

## [1.26.0] - 2026-11-07

### Fixed
- fix(dashboard): Optimize scripts manager table width and auto-activate quick action panel when running

## [1.25.0] - 2026-11-07

### Fixed
- fix(dashboard): Refine Scripts Manager running badge logic (restrict to active script executions only, add isScriptRunning flag to prevent race conditions)

## [1.24.4] - 2026-11-07

### Fixed
- fix(dashboard): Refine dashboard UI elements

## [1.24.2] - 2026-11-07

### Added
- feat(dashboard): Comprehensive dashboard improvements and bug fixes
- feat(dashboard): Real-time training status polling (3s interval)
- feat(dashboard): Scripts Manager badge feature
- feat(dashboard): Log Training button navigation fix

## [1.23.0] - 2026-11-07

### Changed
- **commands**: Convert auto-git.mjs to markdown documentation
- **commands**: Integrate auto-git.md into global ~/.roo/commands/ and remove project copy

### Fixed
- fix(dashboard): Fix provider expand/collapse and half-screen responsive table columns
- fix(models): Resolve 5 UI/UX issues in Models tab
- fix(dashboard): Correct flatMode variable usage in renderAll function