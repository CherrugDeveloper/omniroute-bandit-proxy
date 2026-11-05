# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- WebSocket support for real-time script output streaming via `ws` dependency [src/index.mjs:16]
- Centralized audit logger for script executions [src/index.mjs:37-50]
- Broadcast function for WebSocket clients to receive script output in real-time [src/index.mjs:52-60]
- WebSocket upgrade support in CORS headers [public/dashboard.html:1508-1512]
- Client-side WebSocket connection for dashboard script output streaming [public/dashboard.html:1494-1505]

### Changed
- chore: update CHANGELOG, README, and version to v1.19.8

## [1.20.0] - 2026-11-05

### Added
- WebSocket support for real-time script output streaming
- `ws` dependency (v8.22.1) for WebSocket server functionality

### Changed
- Enhanced CORS headers to support WebSocket upgrade requests
- Dashboard now supports real-time script output via WebSocket connections

## [1.19.6] - 2026-11-05

### Changed
- Auto-git workflow improvements

## [1.19.0] - 2026-11-05

### Changed
- Initial 1.19.x release

## [1.18.0] - 2026-11-05

### Changed
- Initial stable release with bandit algorithm and proxy functionality

<!-- Version History -->

## Version History

For complete version history prior to the latest version, see the [git history](https://github.com/tuogiuseppe/omniroute-bandit-proxy/commits/main/CHANGELOG.md) or commit files.
