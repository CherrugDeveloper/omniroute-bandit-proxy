---
description: Changelog following Keep a Changelog conventions
---

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.28.8] - 2026-11-08

### Fixed
- fix(dashboard): initialize `expandedProviders` and `trainExpandedProviders` as empty sets to ignore stale `localStorage`
- fix(dashboard): reorder event delegation to fix unresponsive Train tab provider header collapse/expand controls
- fix(dashboard): implement `hasActiveFilters()` and skip global model updates during active filters in `refreshAll()` to resolve metric discrepancies

### Changed
- chore(dashboard): improve real-time polling synchronization to respect active table filters

## [1.28.7] - 2026-11-07

### Added
- feat(bandit): add exponential backoff cooldowns (15s -> 5m -> 30m -> 2h -> permanent) and total failures tracking
- feat(bandit): add 3-strike aggressive punishment system for critical failures (`consecutive_critical_failures` tracking)
- feat(bandit): add error pattern mapping for `safeWrite` errors to ban-model action

### Fixed
- fix(bandit): ensure emergency relaxation respects existing cooldowns
- fix(bandit): reset consecutive failure count on success

## [1.28.6] - 2026-11-06

### Added
- feat(quota): add provider-level quota tracking with atomic minute and day window checks
- feat(bandit): add soft bias `profileMultiplier` support for UCB1 score calculations

## Version History

See [GitHub Releases](https://github.com/omniroute/bandit-proxy/releases) for complete version history.
