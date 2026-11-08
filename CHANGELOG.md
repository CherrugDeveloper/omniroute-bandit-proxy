---
description: Changelog following Keep a Changelog conventions
---

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.28.9] - 2026-11-08

### Added
- feat(release): release version 1.28.9 with automated versioning and changelog updates ([fed7f60](https://github.com/marco/omniroute-bandit-proxy/commit/fed7f60))

## [1.28.8] - 2026-11-08

### Fixed
- fix(bandit): classify 503 Playwright and Cloudflare Playground errors as provider cooldown ([fed7f60](https://github.com/marco/omniroute-bandit-proxy/commit/fed7f60))
- fix(dashboard): synchronize models view with dashboard metric boxes ([c7b7753](https://github.com/marco/omniroute-bandit-proxy/commit/c7b7753))
- fix(dashboard): fix collapse behavior and metric filtering synchronization ([73756d6](https://github.com/marco/omniroute-bandit-proxy/commit/73756d6))
- fix(dashboard): fix updateStat hoisting reference error in stats polling loop ([c2dbc12](https://github.com/marco/omniroute-bandit-proxy/commit/c2dbc12))
- fix(dashboard): fix dashboard model metrics display and update version to 1.28.7 ([66d59d6](https://github.com/marco/omniroute-bandit-proxy/commit/66d59d6))

### Changed
- chore(dashboard): improve real-time polling synchronization to respect active table filters ([c7b7753](https://github.com/marco/omniroute-bandit-proxy/commit/c7b7753))

## [1.28.7] - 2026-11-07

### Added
- feat(bandit): add exponential backoff cooldowns (15s -> 5m -> 30m -> 2h -> permanent) and total failures tracking ([88893ba](https://github.com/marco/omniroute-bandit-proxy/commit/88893ba))
- feat(bandit): add 3-strike aggressive punishment system for critical failures (`consecutive_critical_failures` tracking) ([88893ba](https://github.com/marco/omniroute-bandit-proxy/commit/88893ba))
- feat(bandit): add error pattern mapping for `safeWrite` errors to ban-model action ([88893ba](https://github.com/marco/omniroute-bandit-proxy/commit/88893ba))

### Fixed
- fix(bandit): ensure emergency relaxation respects existing cooldowns ([b44ea7e](https://github.com/marco/omniroute-bandit-proxy/commit/b44ea7e))

## Version History
- v1.28.9: Automated release and changelog sync
- v1.28.8: Dashboard synchronization fixes and 503 error classification updates
- v1.28.7: Exponential backoff cooldowns and 3-strike punishment system
