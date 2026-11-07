# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.27.1] - 2026-11-07

### Fixed
- fix(bandit): synchronize `models_train` during `fetchAndSyncModels()` in [`src/bandit.mjs`](src/bandit.mjs:852) so `GET /v1/models?source=train` returns active catalog models instead of 0 results

## [1.27.0] - 2026-11-07

### Fixed
- fix(bandit): ensure training feedback correctly updates `models_train` table in [`src/bandit.mjs`](src/bandit.mjs:580)
- fix(dashboard): optimize scripts manager table column widths and layout in [`public/dashboard.html`](public/dashboard.html:1677)

## [1.26.0] - 2026-11-07

### Changed
- feat(dashboard): refine dashboard UI, optimize scripts manager table width and responsive layout
- fix(dashboard): restrict scripts manager running badge to active script executions only
- feat(dashboard): align Train tab table structure and buttons with Models tab

## Version History

For complete version history prior to v1.26.0, see the [git history](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commits/master/CHANGELOG.md) or commit files.
