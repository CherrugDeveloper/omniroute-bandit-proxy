# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Dashboard: Real-time script output streaming via WebSockets [`public/dashboard.html`](public/dashboard.html:1217)
- Dashboard: Quick Actions relocated to Live Logs tab [`public/dashboard.html`](public/dashboard.html:1182)
- Dashboard: Provider grouping with default collapse and functional expand/collapse toggles [`public/dashboard.html`](public/dashboard.html:1271)

### Changed
- Dashboard: Scripts Manager reorganization with spelling corrections and inline execution log [`public/dashboard.html`](public/dashboard.html:1435)
- Documentation: Updated [`../../.roo/commands/auto-git.md`](../../.roo/commands/auto-git.md:1) to follow Keep a Changelog 1.1.0 and cover full project history

### Fixed
- Dashboard: Accurate model and provider metrics calculation and display [`public/dashboard.html`](public/dashboard.html:1058)
- Dashboard: Train tab status and Top model display [`public/dashboard.html`](public/dashboard.html:1318)
- Dashboard: Modalità signatures and discovery active state rendering [`public/dashboard.html`](public/dashboard.html:1367)
- Provider Quota: Real-time consumption updates via API polling [`src/provider-quota.mjs`](src/provider-quota.mjs:1)

## [1.22.0] - 2026-11-05
### Added
- WebSocket support for real-time script output streaming [`public/dashboard.html`](public/dashboard.html:1217)

### Fixed
- Resolved WebSocket connection handling and reconnection logic in dashboard [`public/dashboard.html`](public/dashboard.html:4800)

## [1.21.0] - 2026-11-05
### Added
- Enhanced dashboard monitoring metrics and filter bars [`public/dashboard.html`](public/dashboard.html:1278)

## [1.20.0] - 2026-11-05
### Added
- Comprehensive test coverage for request tracking and provider quotas [`__tests__/itpm-quota.test.js`](__tests__/itpm-quota.test.js:1)

## [1.19.0] - 2026-11-05
### Added
- Multi-armed bandit dynamic scoring enhancements [`src/bandit.mjs`](src/bandit.mjs:1)

## [1.18.0] - 2026-11-05
### Added
- Exponential backoff cooldown system with punishment tracking [`src/bandit.mjs`](src/bandit.mjs:150)

## [1.17.0] - 2026-11-04
### Added
- 3-strike aggressive punishment system for critical failures [`src/bandit.mjs`](src/bandit.mjs:180)

## [1.16.0] - 2026-11-04
### Changed
- Refactored request tracker and memory management [`src/request-tracker.mjs`](src/request-tracker.mjs:1)

## [1.15.0] - 2026-11-04
### Fixed
- SafeWrite initialization order error in streaming proxy [`src/index.mjs`](src/index.mjs:45)

## [1.14.0] - 2026-11-03
### Added
- Provider-level health tracking and N+1 rotation pointer [`src/health-check.mjs`](src/health-check.mjs:1)

## [1.13.0] - 2026-11-03
### Added
- Granular real-time logging for UCB1 evaluation and feedback metrics [`src/bandit.mjs`](src/bandit.mjs:90)

## [1.10.0] - 2026-10-02
### Added
- Degraded mode (`score*0.3`), auto-rehabilitation, and catalogRawCount metrics [`src/bandit.mjs`](src/bandit.mjs:200)

## [1.5.0] - 2026-10-01
### Added
- PWA service worker, manifest, and install prompt support [`public/sw.js`](public/sw.js:1)

## [1.0.0] - 2026-09-30
### Added
- Initial release of OmniRoute Bandit Proxy reverse proxy for LLM traffic [`src/index.mjs`](src/index.mjs:1)
