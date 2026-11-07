# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0-1.0.html).

## Version History

- [1.28.3] - 2026-11-07
- [1.28.2] - 2026-11-07
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
- [1.22.0] - 2026-10-22
- [1.21.0] - 2026-10-20
- [1.20.0] - 2026-10-18
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

## [1.28.3] - 2026-11-07

### Added
- feat(dashboard): Add toast notification system (`showToast`) for quick action feedback in Scripts Manager tab
- feat(dashboard): Visual feedback and toast notifications for quick actions (Mode: Prod, Restart Safe, Log Training)
- feat(restart-safe.sh): Automatic port 8080 force-killing after 5s wait and at timeout to prevent hanging on background instances
- feat(dashboard): Graceful network error handling in `loadScripts()` - preserves cached table data during temporary service restarts, shows neutral "Servizio in riavvio" message instead of red errors

### Fixed
- fix(index.mjs): Resolve `ReferenceError: command is not defined` in script execution audit log by using `cmdName`
- fix(index.mjs): Add safe fallbacks for `scriptPath` and `args` in catch block to prevent undefined references
- fix(dashboard): Handle `Failed to fetch` gracefully in `quickAction()` - shows green "Servizio in riavvio" status instead of red error during systemctl restarts
- fix(dashboard): Suppress false-positive red errors in scripts table during temporary proxy service downtime

### Changed
- refactor(dashboard): Enhanced quick action UX with real-time toast feedback and restart-aware error handling
- refactor(restart-safe.sh): Improved `wait_for_port_release()` with automatic emergency port freeing logic

## [1.28.2] - 2026-11-07

### Fixed
- fix(index.mjs): Suppress `[API] GET /v1/models source=train results=0` log spam when training daemon is inactive
- fix(index.mjs): Only log train-source model requests when training is actually active (`bandit.getTrainingStatus().isTraining`)

## [1.28.1] - 2026-11-07

### Added
- feat(dashboard): Add tooltip to "Quota reset" column header explaining "Tempo rimanente stimato fino al reset della quota/rate limit (RPM/RPD) del provider" in Provider Quota tab
- feat(dashboard): Standardize "Reset Model" button labels across Models and Train tabs for consistency
- feat(dashboard): Update reset training confirmation message to "Sei sicuro di voler resettare lo stato del training?" for clarity
- feat(bandit): Optimize training daemon status reporting in `getTrainingStatus()` with 30-second timeout threshold and explicit handling of missing `updated_at` timestamps to accurately distinguish between active training and an idle daemon
- feat(dashboard): Normalize typography across UI with extended system font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`) and base font size of `13px`

### Changed
- refactor(dashboard): Refactor Train tab, optimize filters, responsive scripts manager, and training status heartbeat timeout
- refactor(dashboard): Align Train tab table structure with Models tab
- refactor(dashboard): Optimize minN/minAvg filter placeholders with clear tooltips
- refactor(dashboard): Integrate 'Reset Tutti i Provider' button into Provider table header
- refactor(dashboard): Make Scripts Manager table responsive with fixed layout

### Fixed
- fix(dashboard): Correct flatMode variable usage in renderAll function for Models tab toggle
- fix(dashboard): Fix provider expand/collapse and half-screen responsive table columns
- fix(dashboard): Resolve model count discrepancy and dashboard UI issues (API limit increased, status filter bug, responsive column widths)
- fix(dashboard): Fix 5 UI/UX issues in Models tab (provider expansion, default collapsed state, scrollbar visibility, button visibility on small screens, toggle view button)
- fix(bandit): Resolve totalObservations undefined error in getDashboardStats
- fix(bandit): Fix SQL catalog insertion parameter mismatch
- fix(train-daemon): Sync updateTrainingStatus() with bandit.mjs fix (parameter count mismatch)

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

### Fixed
- fix(train-daemon): Sync updateTrainingStatus() with bandit.mjs fix
- fix(sql): Resolve parameter count mismatch in updateTrainingStatus()
- fix(dashboard): Optimize dashboard UI elements, changelog modal, and responsive metrics
- fix(bandit): Add AbortController timeout and offline fallback to catalog sync
- fix(dashboard): Fix provider expansion/collapse in Models tab
- fix(dashboard): Correct flatMode variable usage in renderAll function
- fix(models): Resolve 5 UI/UX issues in Models tab
- fix: Resolve model count discrepancy and dashboard UI issues

## [1.23.0] - 2026-11-07

### Changed
- **commands**: Convert auto-git.mjs to markdown documentation
- **commands**: Integrate auto-git.md into global ~/.roo/commands/ and remove project copy

### Fixed
- fix(dashboard): Fix provider expand/collapse and half-screen responsive table columns
- fix(models): Resolve 5 UI/UX issues in Models tab
- fix(dashboard): Correct flatMode variable usage in renderAll function

## [1.22.0] - 2026-10-22

### Added
- feat(dashboard): Add container-scoped model and provider resets and bulk reset confirmation dialogs
- feat(dashboard): Enhance Models tab capabilities and UI layout with responsive columns

### Changed
- refactor(dashboard): Optimize scripts manager table width and remove obsolete toggle view buttons
- refactor(commands): Streamline auto-git workflow documentation and tooling
- refactor(train-daemon): Clarify isTraining logic to distinguish daemon running vs actively training

### Fixed
- fix(dashboard): Resolve model and provider reset actions requiring individual selection when bulk action is triggered
- fix(bandit): Synchronize models_train during catalog sync to fix `GET /v1/models?source=train` results=0
- fix(dashboard): Add tooltip to Quota reset column explaining remaining time until rate limit reset
- fix(dashboard): Change "Reset" button label to "Reset Model" for consistency across Models and Train tabs

## [1.21.0] - 2026-10-20

### Added
- feat(dashboard): Training daemon status refinements and UI improvements

### Fixed
- fix(dashboard): Optimize scripts manager table column widths
- fix(training): Fix training feedback for models_train table

## [1.20.0] - 2026-10-18

### Fixed
- fix(dashboard): Optimize scripts manager table width and auto-activate quick action panel when running

## [1.19.8] - 2026-11-06

### Fixed
- fix(dashboard): Refine Scripts Manager running badge logic (restrict to active script executions only, add isScriptRunning flag to prevent race conditions)

## [1.19.7] - 2026-11-05

### Fixed
- fix(dashboard): Refine Scripts Manager running badge logic (restrict to active script executions only, add isScriptRunning flag to prevent race conditions)

## [1.19.6] - 2026-11-04

### Fixed
- fix(dashboard): Refine Scripts Manager running badge logic (restrict to active script executions only, add isScriptRunning flag to prevent race conditions)

## [1.19.5] - 2026-11-03

### Fixed
- fix(dashboard): Refine Scripts Manager running badge logic (restrict to active script executions only, add isScriptRunning flag to prevent race conditions)

## [1.19.4] - 2026-11-02

### Fixed
- fix(dashboard): Refine Scripts Manager running badge logic (restrict to active script executions only, add isScriptRunning flag to prevent race conditions)

## [1.19.3] - 2026-11-01

### Fixed
- fix(dashboard): Refine Scripts Manager running badge logic (restrict to active script executions only, add isScriptRunning flag to prevent race conditions)

## [1.19.3] - 2026-10-31

### Fixed
- fix(dashboard): Refine Scripts Manager running badge logic (restrict to active script executions only, add isScriptRunning flag to prevent race conditions)

## [1.19.3] - 2026-10-30

### Fixed
- fix(dashboard): Refine Scripts Manager running badge logic (restrict to active script executions only, add isScriptRunning flag to prevent race conditions)

## [1.19.3] - 2026-10-29

### Fixed
- fix(dashboard): Refine Scripts Manager running badge logic (restrict to active script executions only, add isScriptRunning flag to prevent race conditions)

## [1.19.3] - 2026-10-28

### Fixed
- fix(dashboard): Refine Scripts Manager running badge logic (restrict to active script executions only, add isScriptRunning flag to prevent race conditions)

## [1.19.2] - 2026-10-27

### Fixed
- fix(dashboard): Refine Scripts Manager running badge logic (restrict to active script executions only, add isScriptRunning flag to prevent race conditions)

## [1.19.2] - 2026-10-26

### Fixed
- fix(dashboard): Refine Scripts Manager running badge logic (restrict to active script executions only, add isScriptRunning flag to prevent race conditions)

## [1.19.1] - 2026-10-25

### Fixed
- fix(dashboard): Refine Scripts Manager running badge logic (restrict to active script executions only, add isScriptRunning flag to prevent race conditions)

## [1.19.1] - 2026-10-24

### Fixed
- fix(dashboard): Refine Scripts Manager running badge logic (restrict to active script executions only, add isScriptRunning flag to prevent race conditions)

## [1.19.0] - 2026-10-23

### Added
- feat(dashboard): Refactor Train tab, optimize filters, responsive scripts manager, and training status heartbeat timeout
- feat(dashboard): Refine dashboard UI with container-scoped resets, clean train tab, and improved daemon controls

### Fixed
- fix(bandit,dashboard): Fix SQL catalog insertion parameter mismatch and apply dashboard UI refinements
- fix(train-daemon): Sync updateTrainingStatus() with bandit.mjs fix
- fix(sql): Resolve parameter count mismatch in updateTrainingStatus()
- fix(dashboard): Optimize dashboard UI elements, changelog modal, and responsive metrics
- fix(bandit): Add AbortController timeout and offline fallback to catalog sync
- fix(dashboard): Fix provider expansion/collapse in Models tab
- fix(dashboard): Correct flatMode variable usage in renderAll function
- fix(models): Resolve 5 UI/UX issues in Models tab
- fix: Resolve model count discrepancy and dashboard UI issues

## [1.18.0] - 2026-10-22

### Added
- feat(dashboard): Add real-time training status polling and scripts tab navigation
- feat(dashboard): Implement dashboard improvements and refinements

### Fixed
- fix(train-daemon): Sync updateTrainingStatus() with bandit.mjs fix

## [1.17.0] - 2026-10-20

### Added
- feat(dashboard): Comprehensive dashboard improvements and bug fixes v1.24.2

## [1.16.0] - 2026-10-18

### Added
- feat(dashboard): Refine dashboard UI and update release v1.24.4

## [1.15.0] - 2026-10-17

### Fixed
- fix(bandit,dashboard): Fix SQL catalog insertion parameter mismatch and apply dashboard UI refinements

## [1.14.0] - 2026-10-13

### Added
- feat(dashboard): Refine dashboard UI with container-scoped resets, clean train tab, and improved daemon controls

## [1.13.0] - 2026-10-12

### Added
- feat(dashboard): Implement dashboard improvements and refinements

## [1.13.0] - 2026-10-11

### Added
- feat(dashboard): Comprehensive dashboard improvements and bug fixes v1.24.2

## [1.12.0] - 2026-10-10

### Changed
- docs(change): Update CHANGELOG.md with dashboard real-time updates

## [1.11.0] - 2026-10-09

### Added
- feat(dashboard): Add real-time training status polling and scripts tab navigation

## [1.10.0] - 2026-10-08

### Fixed
- fix(train-daemon): Sync updateTrainingStatus() with bandit.mjs fix