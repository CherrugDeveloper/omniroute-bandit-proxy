# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to Semantic Versioning.

## [Unreleased]

## Version History

## [1.27.2] - 2026-11-07

### Fixed
- fix(bandit): synchronize models_train during catalog sync to fix GET /v1/models?source=train results=0
- fix(daemon): refine training daemon activity state so active only during actual training
- fix(dashboard): align Train tab structure and optimize script table column widths

## [1.27.1] - 2026-11-06

### Fixed
- fix(bandit): synchronize models_train table during catalog sync

## [1.27.0] - 2026-11-06

### Fixed
- fix(train): fix training feedback for models_train
- fix(dashboard): optimize scripts manager table column widths

## [1.26.0] - 2026-11-05

### Added
- feat(dashboard): dashboard UI refinements and real-time monitoring enhancements
