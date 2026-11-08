---
description: Changelog for Omniroute Bandit Proxy, detailing all releases, features, bug fixes, and performance improvements.
---

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0-2.0.0.html).

## Version History

## [1.28.14] - 2026-11-08

### Added
- [`public/dashboard.html`](public/dashboard.html:3382): added `sanitizeModelName` helper function to strip explicit provider prefixes from model display names

### Changed
- [`public/dashboard.html`](public/dashboard.html:1403): optimized CSS table layout and responsive column widths for [`#tab-models`](public/dashboard.html:1511) and [`#tab-train`](public/dashboard.html:1551) tabs to ensure rank, free, paid, tools, and vision cells are fully visible and readable across screen resolutions

### Fixed
- [`public/dashboard.html`](public/dashboard.html:1451): resolved column count mismatch and clipping issues in [`#tab-train`](public/dashboard.html:1551) table layout

## [1.28.13] - 2026-11-08

### Added
- [`__tests__/proxy-improvements.test.js`](__tests__/proxy-improvements.test.js:1): added comprehensive unit tests for error classification of browser and runtime dependencies

### Changed
- [`src/bandit.mjs`](src/bandit.mjs:1346): refined error classification for Playwright, Chromium, and ENOENT runtime dependencies as provider-misconfigured cooldowns
- [`src/index.mjs`](src/index.mjs:2361): optimized fallback chain and filtering logic to reduce 503 latency and handle non-chat/image models robustly
- [`src/health-check.mjs`](src/health-check.mjs:231): enhanced health check probe response verification and automated model rehabilitation

## [1.28.12] - 2026-11-08

### Added
- feat(dashboard): implemented input debouncing for search and filter inputs to eliminate UI lag
- feat(dashboard): added AbortController request cancellation and deduplication in apiFetch
- feat(dashboard): integrated Page Visibility API checks and visibilitychange event listener for immediate refresh on tab activation
- feat(dashboard): optimized tab-switching render triggers to ensure instant synchronization without redundant polling loops

### Changed
- refactor(dashboard): streamlined polling manager and state updates for superior rendering performance

### Fixed
- fix(dashboard): resolved UI reactivity and sluggishness issues across high-frequency dashboard polling
