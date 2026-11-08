# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0-2.0.0.html).

## Version History

## [1.28.14] - 2026-11-08

### Added
- [`src/index.mjs`](src/index.mjs:1): Optimized models & train tab layout and sanitize model names in dashboard ([1ddf4ce](https://github.com/omniroute/omniroute-bandit-proxy/commit/1ddf4ce)).

### Changed
- [`public/dashboard.html`](public/dashboard.html:1): Enhanced runtime error classification, fallback routing, and health check validation ([c7c27e5](https://github.com/omniroute/omniroute-bandit-proxy/commit/c7c27e5)).

## [1.28.13] - 2026-11-08

### Added
- [`public/dashboard.html`](public/dashboard.html:1): Frontend dashboard reactivity, debouncing, AbortController request management, and visibility checks ([c7c4d70](https://github.com/omniroute/omniroute-bandit-proxy/commit/c7c4d70)).

## [1.28.12] - 2026-11-08

### Fixed
- [`scripts/auto-git.md`](../../.roo/commands/auto-git.md:1): Execute workflow documentation and versioning updates for v1.28.11 ([18df9eb](https://github.com/omniroute/omniroute-bandit-proxy/commit/18df9eb)).

## [1.28.10] - 2026-11-08

### Fixed
- [`scripts/train-daemon.mjs`](scripts/train-daemon.mjs:1): Automatically flag models returning 404 as permanent=1 in training daemon and update docs/changelog ([08d4cf5](https://github.com/omniroute/omniroute-bandit-proxy/commit/08d4cf5)).

### Changed
- [`package.json`](package.json:1): Remove raw_git_log.txt and ignore it ([cef8db8](https://github.com/omniroute/omniroute-bandit-proxy/commit/cef8db8)).

## [1.28.9] - 2026-11-08

### Fixed
- [`scripts/train-daemon.mjs`](scripts/train-daemon.mjs:1): Track persistent 404 model errors and auto-mark permanent in train-daemon ([d5e9a68](https://github.com/omniroute/omniroute-bandit-proxy/commit/d5e9a68)).

### Chore
- [`package.json`](package.json:1): Release v1.28.9 - update changelog, README and system configurations ([ac8dae3](https://github.com/omniroute/omniroute-bandit-proxy/commit/ac8dae3)).

## [1.28.8] - 2026-11-08

### Fixed
- [`src/bandit.mjs`](src/bandit.mjs:1): Classify 503 Playwright and Cloudflare Playground errors as provider cooldown ([fed7f60](https://github.com/omniroute/omniroute-bandit-proxy/commit/fed7f60)).
- [`public/dashboard.html`](public/dashboard.html:1): Synchronize models view with dashboard metric boxes ([c7b7753](https://github.com/omniroute/omniroute-bandit-proxy/commit/c7b7753)).
- [`public/dashboard.html`](public/dashboard.html:1): Fix collapse behavior and metric filtering synchronization ([73756d6](https://github.com/omniroute/omniroute-bandit-proxy/commit/73756d6)).
- [`public/dashboard.html`](public/dashboard.html:1): Fix updateStat hoisting reference error in stats polling loop ([c2dbc12](https://github.com/omniroute/omniroute-bandit-proxy/commit/c2dbc12)).

## [1.28.7] - 2026-11-08

### Fixed
- [`public/dashboard.html`](public/dashboard.html:1): Fix dashboard model metrics display and update version to 1.28.7 ([66d59d6](https://github.com/omniroute/omniroute-bandit-proxy/commit/66d59d6)).

## [1.28.6] - 2026-11-08

### Added
- [`public/dashboard.html`](public/dashboard.html:1): Release v1.28.6 - collapsible train providers, helper text removal, script output visibility, model metrics fix ([13a4946](https://github.com/omniroute/omniroute-bandit-proxy/commit/13a4946)).

## [1.28.5] - 2026-11-08

### Added
- [`public/dashboard.html`](public/dashboard.html:1): Release v1.28.5 - dashboard enhancements, changelog modal, unified history badges, and daemon stability ([88893ba](https://github.com/omniroute/omniroute-bandit-proxy/commit/88893ba)).
