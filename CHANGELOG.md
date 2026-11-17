# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## Version History

## [0.50.5] - 2026-11-17
### Fixed
- Added token validation for punishment events WebSocket endpoint
- Enhanced security for /v1/events/punishment endpoint
 - Added sanitizeErrorBody to error handling in /v1/training/log-stream endpoint

## [0.50.4] - 2026-11-17
### Fixed
- Removed duplicate `let connectionErrorBannerShown = false;` declaration in public/dashboard.html
- Removed redundant `scriptOutputWebSocket = null;` declarations in public/dashboard.html

## [0.50.3] - 2026-11-17
### Fixed
- Added version 0.50.3 entry

### Changed
- version bump to 0.50.3

## [0.1.0] - 2026-09-30
### Added
- transforms the dashboard into a PWA with service worker, manifest and install button
- adds dynamic model synchronization from OmniRoute via /v1/models and bandit selection optimization
- add granular real-time logging for UCB1 evaluation, scores, rewards, and feedback metrics
- integrate DiscountedUCB1Bandit engine with Zoo Code compatible Zod metadata and Express proxy

### Changed
- Add provider-level health tracking, exponential cooldown, and n+1 rotation pointer with updated dashboard UI
- Add live proxy logs and precise cooldown countdown to the dashboard
- Fix dashboard binding on 127.0.0.1 and stabilize Bandit proxy error handling
- ignore sqlite wal and shm files
- ensure .env and proxy.log are excluded from git

### Fixed
- add AbortController timeout, client disconnect handler (499), and immediate bandit fallback

## [0.49.9] - 2026-11-16
### Fixed
- refined 413 TPM error cooldown handling to use fixed 300s instead of variable reset detection
- fixed model fail count lookup to handle missing model records gracefully
- improved 5xx error classification to use exponential backoff with fallback to 300s

### Changed
- optimized bandit model selection error path for missing model records
- updated error classification patterns in config/bandit.json to remove deprecated keepalive pattern
- 404 status alone should not permanently ban models; will fall through to transient cooldown-model classification
- refine model-not-found error classification in bandit selection

### Changed
- update dashboard state priority logic in public/dashboard.html

## [0.50.0] - 2026-11-16
### Fixed
- prioritize bandit system flags over quota exhaustion for model state display

### Changed
- update dashboard state priority logic in public/dashboard.html

## [0.50.1] - 2026-11-16
### Fixed
- refined 413 TPM error cooldown handling to use fixed 300s instead of variable reset detection
- fixed model fail count lookup to handle missing model records gracefully
- improved 5xx error classification to use exponential backoff with fallback to 300s

### Changed
- optimized bandit model selection error path for missing model records
- updated error classification patterns in config/bandit.json to remove deprecated keepalive pattern

## [0.50.2] - 2026-11-17
### Fixed
- removed deprecated catalog mismatch pattern from error classification
- refined model_not_found error classification to use transient cooldown-model

### Changed
- optimized bandit model selection error path for missing model records
- updated error classification patterns in config/bandit.json to remove deprecated keepalive pattern

### Fixed
- removed deprecated catalog mismatch pattern from error classification
- refined model_not_found error classification to use transient cooldown-model

### Changed
- optimized bandit model selection error path for missing model records
- updated error classification patterns in config/bandit.json to remove deprecated keepalive pattern
