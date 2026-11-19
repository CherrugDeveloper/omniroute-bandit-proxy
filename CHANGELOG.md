# Changelog
## Keep a Changelog

## [0.53.2] - 2026-11-19
### Fixed
- Fixed cooldown/config conflict in recordFeedback(): config-driven cooldown no longer overrides internal escalation. Now uses Math.max(configCooldown, escalatedCooldown) so config acts as minimum floor and failure-aware escalation increases cooldown for models with more failures
- Added minimum 30s cooldown floor for transient errors

## [0.53.1] - 2026-11-19
### Fixed
- Fixed abort error handling in dashboard to prevent unnecessary request aborts on tab switch
- Improved WebSocket reconnection logic with proper AbortController cleanup

## [0.53.0] - 2026-11-18
### Fixed
- Removed immediate WebSocket connection on module load in events.mjs to prevent test environment hang
- Fixed test timeout issues caused by pending setTimeout reconnection attempts
### Changed
- Updated package.json version to 0.53.0

## [0.51.0] - 2026-11-18
### Fixed
- Incremented version to 0.51.0

## [0.52.0] - 2026-11-18
### Fixed
- Fixed WebSocket URL protocol to use wss: for secure connections
### Changed
- Updated dashboard WebSocket reconnection logic with exponential backoff

## Version History

## Semantic Versioning
