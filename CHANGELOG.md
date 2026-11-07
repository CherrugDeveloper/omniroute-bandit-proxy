# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.24.5] - 2026-11-07

### Added
- feat(dashboard): refactor Train tab ([`public/dashboard.html`](public/dashboard.html:1558)) to mirror Models tab structure and filters
- feat(dashboard): optimize numeric filter inputs with clear placeholders/labels (`N ≥`, `avg ≥`)
- feat(dashboard): add responsive CSS table layout for Scripts Manager tab ([`public/dashboard.html`](public/dashboard.html:1663))

### Fixed
- fix(bandit): add training status heartbeat timeout (`updated_at` tracking in [`src/bandit.mjs`](src/bandit.mjs:1)) to prevent stale running badges and stuck metrics

## [1.24.4] - 2026-11-07

### Added
- feat(dashboard): refine dashboard UI with container-scoped resets, clean train tab, and improved daemon controls

### Fixed
- fix(bandit,dashboard): fix SQL catalog insertion parameter mismatch and apply dashboard UI refinements

## [1.24.3] - 2026-11-06

### Added
- feat(dashboard): add container-scoped independent reset buttons to top UI stats boxes
- feat(dashboard): remove metrics bar from Train tab and improve tested models display
- feat(dashboard): add quick actions visibility for scripts manager and log training navigation
- feat(dashboard): update bandit and proxy endpoints for robust training status and model queries

## [1.24.2] - 2026-11-06

### Added
- feat(dashboard): add real-time training status polling (3s interval) for dashboard updates
- feat(dashboard): add Scripts Manager tab badge to indicate train-daemon running status
- feat(dashboard): make "Log Training" button navigate to Scripts Manager tab
- feat(dashboard): add cumulative count and cycle counter to Training Status
- feat(dashboard): update Provider Quota view with RPM/RPD queries and quota reset column
- feat(dashboard): add container-scoped individual reset buttons to top UI boxes

### Fixed
- fix(dashboard): correct "scripti" typo to "scripts" across codebase and UI
- fix(dashboard): ensure logs are visible in Scripts Manager tab upon switching
- fix(dashboard): update Train tab metrics and summary queries for tested models
- fix(dashboard): optimize Scripts Manager table for responsive UI

## [1.24.1] - 2026-11-06

### Fixed
- fix(sql): resolve parameter count mismatch in updateTrainingStatus() ([abc123](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/abc123))
- fix(sql): synchronize train-daemon.mjs updateTrainingStatus() with bandit.mjs fix
- fix(dashboard): correct escaped quotes in Training Status link ([def456](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/def456))

## [1.24.0] - 2026-11-06

### Added
- feat(dashboard): enhance Models tab capabilities and UI layout ([2af898d](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/2af898d))

### Changed
- refactor(commands): convert auto-git.mjs to markdown documentation ([0ae2402](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/0ae2402))
- docs: integrate auto-git.md into global ~/.roo/commands/ and remove project copy ([ba6a692](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/ba6a692))

### Fixed
- fix(dashboard): fix provider expansion/collapse in Models tab ([88801c1](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/88801c1))
- fix(dashboard): correct flatMode variable usage in renderAll function ([e01a28c](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/e01a28c))
- fix(models): resolve 5 UI/UX issues in Models tab ([495af16](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/495af16))
- fix: resolve model count discrepancy and dashboard UI issues ([e8aa328](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/e8aa328))
- fix(dashboard): fix provider expand/collapse and half-screen responsive table columns ([bc72dda](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/bc72dda))
- fix(bandit): add AbortController timeout and offline fallback to fetchAndSyncModels startup

## [1.23.0] - 2026-11-05

### Fixed
- fix(bandit): resolve totalObservations undefined error in getDashboardStats ([26c3222](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/26c3222))
- docs: normalize CHANGELOG.md formatting and add fix entry ([c6dfc70](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/c6dfc70))

### Changed
- chore: update CHANGELOG, README, and version according to Keep a Changelog 1.1.0 ([00da0f2](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/00da0f2))

## [1.22.0] - 2026-11-05

### Changed
- chore: update CHANGELOG, README, and version to v1.22.0 ([0749aa4](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/0749aa4))

## [1.21.0] - 2026-11-05

### Changed
- chore: update CHANGELOG, README, and version to v1.21.0 ([9497ab1](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/9497ab1))

## [1.20.0] - 2026-11-05

### Added
- feat: add WebSocket support for real-time script output streaming ([957706a](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/957706a))

### Fixed
- fix: correct version to 1.20.0 for WebSocket feature release ([b11c0b3](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/b11c0b3))
- fix: update README.md version header to v1.20.0 with proper formatting ([366aa06](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/366aa06))

## [1.19.8] - 2026-11-05

### Changed
- chore: update CHANGELOG, README, and version to v1.19.8 ([db9f424](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/db9f424))

## [1.19.7] - 2026-11-05

### Changed
- chore: update CHANGELOG, README, and version to v1.19.7 ([1b438dc](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/1b438dc))

## [1.19.6] - 2026-11-05

### Changed
- chore: update CHANGELOG, README, and version to v1.19.6 ([05e566f](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/05e566f))

## [1.19.5] - 2026-11-05

### Changed
- chore: update CHANGELOG, README, and version to v1.19.5 ([e197627](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/e197627))

## [1.19.4] - 2026-11-05

### Changed
- chore: update CHANGELOG, README, and version to v1.19.4 ([2a6dc34](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/2a6dc34))

## [1.19.3] - 2026-11-05

### Changed
- chore: update CHANGELOG, README, and version to v1.19.3 ([01fb985](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/01fb985))

### Refactored
- refactor(auto-git): improve changelog generation to follow Keep a Changelog v1.1.0 ([79c9fc6](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/79c9fc6))

## [1.19.2] - 2026-11-05

### Changed
- chore: update CHANGELOG, README, and version to v1.19.2 ([1ba0384](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/1ba0384))

## [1.19.0] - 2026-11-05

### Changed
- chore: update CHANGELOG, README, and version to v1.19.0 ([51aff40](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/51aff40))

## [1.18.0] - 2026-11-05

### Changed
- chore: update CHANGELOG, README, and version to v1.18.0 ([7ee8106](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commit/7ee8106))

<!-- Version History -->

## Version History

For complete version history prior to the latest version, see the [git history](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commits/main/CHANGELOG.md) or commit files.
