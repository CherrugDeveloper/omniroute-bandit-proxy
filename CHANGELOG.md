# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.25.0] - 2026-11-07

### Changed
- **Dashboard UI Refinements**:
  - Restrict Scripts Manager running badge to active script executions only ([`public/dashboard.html`](public/dashboard.html:2011))
  - Add `isScriptRunning` flag to prevent race conditions between training and script badges
  - `updateTrainingBadge()` now respects script execution state
  - `updateRunningBadge()` properly manages the flag state
- **Train Tab Parity**:
  - Align Train tab table structure and buttons with Models tab
  - Add toggle view button for switchable columns
  - Match 11-column layout with proper widths
- **Provider Quota UI**:
  - Integrate "Reset Tutti i Provider" button into Provider table header `<th>` cell
  - Use flexbox container for proper alignment
- **Filter Improvements**:
  - Optimize minN and minAvg filter placeholders: `N min ≥` / `Avg min ≥`
  - Add clear tooltips explaining minimum thresholding behavior
- **Scripts Manager Responsiveness**:
  - Make Scripts Manager table fully responsive with `table-layout: fixed; width: 100%`
  - Use percentage-based column widths for fluid layout

## Version History

For complete version history prior to v1.25.0, see the [git history](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commits/master/CHANGELOG.md) or commit files.

<!--

## [1.24.5] - 2026-11-07

### Added
- feat(dashboard): refactor Train tab ([`public/dashboard.html`](public/dashboard.html:1558)) to mirror Models tab structure and filters
- feat(dashboard): optimize numeric filter inputs with clear placeholders/labels (`N ≥`, `avg ≥`)
- feat(dashboard): add responsive CSS table layout for Scripts Manager tab ([`public/dashboard.html`](public/dashboard.html:1663))

### Fixed
- fix(bandit): add training status heartbeat timeout (`updated_at` tracking in [`src/bandit.mjs`](src/bandit.mjs:1)) to prevent stale running badges and stuck metrics

... (historical versions below)

-->
