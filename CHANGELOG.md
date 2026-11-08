# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0-2.0.0.html).

## Version History

## [1.28.15] - 2026-11-08

### Added
- feat(dashboard): optimize models & train tab layout and sanitize model names ([1ddf4ce](https://github.com/omniroute/omniroute-bandit-proxy/commit/1ddf4ce)) in [`src/index.mjs`](src/index.mjs:1).

### Changed
- feat(proxy): enhance runtime error classification, fallback routing, and health check validation ([c7c27e5](https://github.com/omniroute/omniroute-bandit-proxy/commit/c7c27e5)) in [`public/dashboard.html`](public/dashboard.html:1).

## [1.28.14] - 2026-11-08

### Added
- feat(dashboard): frontend dashboard reactivity, debouncing, AbortController request management, and visibility checks ([c7c4d70](https://github.com/omniroute/omniroute-bandit-proxy/commit/c7c4d70)) in [`public/dashboard.html`](public/dashboard.html:1).

## [1.28.12] - 2026-11-08

### Fixed
- fix(auto-git): execute workflow documentation and versioning updates for v1.28.11 ([18df9eb](https://github.com/omniroute/omniroute-bandit-proxy/commit/18df9eb)) in [`scripts/auto-git.md`](../../.roo/commands/auto-git.md:1).

## [1.28.10] - 2026-11-08

### Fixed
- fix(train): automatically flag models returning 404 as permanent=1 in training daemon and update docs/changelog ([08d4cf5](https://github.com/omniroute/omniroute-bandit-proxy/commit/08d4cf5)) in [`scripts/train-daemon.mjs`](scripts/train-daemon.mjs:1).

### Changed
- chore: remove raw_git_log.txt and ignore it ([cef8db8](https://github.com/omniroute/omniroute-bandit-proxy/commit/cef8db8)) in [`package.json`](package.json:1).

## [1.28.9] - 2026-11-08

### Fixed
- fix(training): track persistent 404 model errors and auto-mark permanent in train-daemon ([d5e9a68](https://github.com/omniroute/omniroute-bandit-proxy/commit/d5e9a68)) in [`scripts/train-daemon.mjs`](scripts/train-daemon.mjs:1).

### Chore
- chore(release): release v1.28.9 - update changelog, README and system configurations ([ac8dae3](https://github.com/omniroute/omniroute-bandit-proxy/commit/ac8dae3)) in [`package.json`](package.json:1).

## [1.28.8] - 2026-11-08

### Fixed
- fix(bandit): classify 503 Playwright and Cloudflare Playground errors as provider cooldown ([fed7f60](https://github.com/omniroute/omniroute-bandit-proxy/commit/fed7f60)) in [`src/bandit.mjs`](src/bandit.mjs:1).
- fix(dashboard): synchronize models view with dashboard metric boxes ([c7b7753](https://github.com/omniroute/omniroute-bandit-proxy/commit/c7b7753)) in [`public/dashboard.html`](public/dashboard.html:1).
- fix(dashboard): fix collapse behavior and metric filtering synchronization ([73756d6](https://github.com/omniroute/omniroute-bandit-proxy/commit/73756d6)) in [`public/dashboard.html`](public/dashboard.html:1).
- fix(dashboard): fix updateStat hoisting reference error in stats polling loop ([c2dbc12](https://github.com/omniroute/omniroute-bandit-proxy/commit/c2dbc12)) in [`public/dashboard.html`](public/dashboard.html:1).

## [1.28.7] - 2026-11-08

### Fixed
- fix(dashboard): fix dashboard model metrics display and update version to 1.28.7 ([66d59d6](https://github.com/omniroute/omniroute-bandit-proxy/commit/66d59d6)) in [`public/dashboard.html`](public/dashboard.html:1).

## [1.28.6] - 2026-11-08

### Added
- feat(dashboard): release v1.28.6 - collapsible train providers, helper text removal, script output visibility, model metrics fix ([13a4946](https://github.com/omniroute/omniroute-bandit-proxy/commit/13a4946)) in [`public/dashboard.html`](public/dashboard.html:1).

## [1.28.5] - 2026-11-08

### Added
- feat(dashboard): release v1.28.5 - dashboard enhancements, changelog modal, unified history badges, and daemon stability ([88893ba](https://github.com/omniroute/omniroute-bandit-proxy/commit/88893ba)) in [`public/dashboard.html`](public/dashboard.html:1).
