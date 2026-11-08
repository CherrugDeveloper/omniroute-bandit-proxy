# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.28.10] - 2026-11-08

### Fixed
- fix(train): automatically mark models returning 404 permanent errors as `permanent = 1` in [`scripts/train-daemon.mjs`](scripts/train-daemon.mjs:1) to prevent infinite retry loops in training daemon.

## [1.28.9] - 2026-11-06

### Fixed
- fix(bandit): improve error classification and 3-strike aggressive punishment for critical failures.

## Version History
- 1.28.10 (2026-11-08): Automatic 404 error flagging in training daemon.
- 1.28.9 (2026-11-06): Bandit error classification and critical failure punishment enhancements.
