# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.28.21] - 2026-11-11
### Fixed
- Fixed `ReferenceError: API_TOKEN is not defined` in `connectPunishmentWS()` by adding a safety check for the global variable.
- Resolved `SyntaxError: await is only valid in async functions` in dashboard click delegation by ensuring the handler is defined as `async`.

## [1.28.20] - 2026-11-11
### Fixed
- Fixed copy button state persistence in dashboard stats boxes.
- Consolidated duplicate event listeners for copy actions and standardized timeout to 1000ms.

## Version History
See project tags for full history.
