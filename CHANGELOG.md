---
description: Changelog following Keep a Changelog conventions
---

# Changelog

## [1.28.8] - 2026-11-08

### Fixed
- Fixed dashboard collapse functionality: initialized `expandedProviders` and `trainExpandedProviders` as empty sets to ignore stale `localStorage`.
- Fixed unresponsive Train tab provider header collapse/expand controls by reordering event delegation.
- Fixed metric discrepancies between global summary boxes and filtered tables by implementing `hasActiveFilters()` and skipping global model updates during active filters in `refreshAll()`.

### Changed
- Improved real-time polling synchronization in [`public/dashboard.html`](public/dashboard.html:1) to respect active table filters.

## [1.28.7] - 2026-11-07

### Added
- Added exponential backoff cooldowns (15s -> 5m -> 30m -> 2h -> permanent) and total failures tracking.
- Added 3-strike aggressive punishment system for critical failures (`consecutive_critical_failures` tracking).
- Added error pattern mapping for `safeWrite` errors to ban-model action.

### Fixed
- Fixed emergency relaxation to respect existing cooldowns.
- Fixed consecutive failure reset on success.

## [1.28.6] - 2026-11-06

### Added
- Added provider-level quota tracking with atomic minute and day window checks.
- Added soft bias `profileMultiplier` support for UCB1 score calculations.
