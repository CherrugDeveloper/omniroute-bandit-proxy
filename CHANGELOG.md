# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.28.21] - 2026-11-11
### Fixed
- fix(dashboard): resolve API_TOKEN ReferenceError in WebSocket initialization
- fix(dashboard): resolve copy button state persistence issue where buttons remained in checked state instead of resetting to original icon
- fix(dashboard): consolidate duplicate copy-box-content event listener to prevent race conditions
- fix(dashboard): standardize copy button timeout from 1500ms to 1000ms for consistent UX
- fix(bandit): resolve SQL parameter count mismatches in punishment persistence code (11 columns vs 4 params)
- fix(dashboard): use backend-sanitized model names directly instead of redundant frontend sanitization
- fix(dashboard): ensure dashboard metrics accurately reflect punishment events in models table
- feat(dashboard): integrate punishment events into unified history with WebSocket real-time updates
- feat(punishment): add 3-strike rule, event system, and training feedback metrics
- fix(dashboard): isolate global dashboard metrics from tab-specific renders
- fix(dashboard): isolate filtered metrics from global dashboard stats
- fix(dashboard): correct syntax error in refreshAll function
- fix(dashboard): synchronize global metrics across all dashboard tabs
- fix(dashboard): refresh main metrics when switching tabs
- fix(log-filtering): correct regex patterns for log entry type detection
- fix: database fallback for recent requests when in-memory buffer is empty
- fix: correct typo in ESM __filename polyfill (__filename__ -> __filename)
