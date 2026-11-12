# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.28.25] - 2026-11-12

### Fixed
- Fixed unified banning/cooldown mechanisms:
  - Removed timeout misclassification as a critical failure (now transient, triggering cooldown instead of ban).
  - Fixed metric discrepancies by updating `getModelsSummary` SQL to correctly handle banned model counts via `COALESCE`.
  - Fixed unified history synchronization by ensuring `provider_history` and `models` tables remain in sync on all ban/cooldown events in `recordFeedback`.
  - Updated `events.mjs` to match the consistent transient classification for timeouts.
- Updated `AGENTS.md` to reflect accurate 3-strike system behavior and failure classifications.
