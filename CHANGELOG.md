# Changelog

All notable changes to the OmniRoute Bandit Proxy will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Version History

All releases are documented below in strict reverse chronological order, newest first.
The first entry below is the latest release.

## [0.49.4] - 2026-11-14

### Fixed
- fix(proxy): refactor `startServer()` to use explicit `http.createServer(app)` with robust `EADDRINUSE` port conflict handling and enhanced synchronization debug tracing ([src/index.mjs](src/index.mjs:1))

## [0.49.3] - 2026-11-14

### Fixed
- fix(startup): eliminate blocking model sync retry loop in `startServer()` that caused startup delays exceeding systemd's start timeout (30s); replaced with non-blocking sync and graceful local cache/fallback ([src/index.mjs])
- fix(bandit): add comprehensive diagnostic logging and robust try-catch wrapping around `fetchAndSyncModels()` in [`src/bandit.mjs`](src/bandit.mjs:759) to prevent silent exit/uncaught failures during startup model synchronization

## [0.49.2] - 2026-11-14

### Fixed
- fix(bandit): add robust offline fallback model seeding in `fetchAndSyncModels()` from `config/bandit.json` when remote fetch fails and local cache is empty ([src/bandit.mjs])
- fix(scripts): update `scripts/restart-restart.sh` to safely wait for port release and avoid `EADDRINUSE` race conditions ([scripts/restart-restart.sh])

## [0.49.1] - 2026-11-13

### Fixed
- fix(bandit): improve `_sanitizeModelId()` to handle nested/duplicated provider prefixes and validate against live catalog ([src/bandit.mjs])

## [0.49.0] - 2026-11-13

### Fixed
- fix(dashboard): `resetProvider()` no longer resets `models`/`models_train` tables — provider reset now only touches `provider_history` metrics, preventing accidental model data loss when using "Reset Tutti i Provider" ([src/bandit.mjs])

## [0.48.0] - 2026-11-13

### Fixed
- fix(provider-quota): background roller now skips idle providers via `_hasPendingQuota()` conditional check, avoiding unnecessary DB writes ([src/provider-quota.mjs])
- fix(proxy): `safeWrite()` stream backpressure drain now has a timeout (`STREAM_DRAIN_MS`, default 30s) to prevent hanging forever on unresponsive clients ([src/index.mjs])

## [0.47.0] - 2026-11-13

### Fixed
- fix(proxy): STREAM_IDLE_MS increased 60s → 300s; idle timer now resets on ANY chunk including SSE keepalive pings ([src/index.mjs])
- fix(proxy): STREAM_MAX_MS increased 180s → 600s to support longer streaming sessions ([src/index.mjs])
- fix(bandit): 403 key limit removed from _isCriticalFailure() to prevent permanent ban on key-limit errors ([src/bandit.mjs])
- fix(bandit): flag-provider downgraded to cooldown-provider for misconfigured providers (missing url/token) ([src/bandit.mjs])
- fix(proxy): stream-idle-timeout and stream-hard-cap aborts now skip recordFeedback to avoid unfair punishment ([src/index.mjs])
- fix(bandit): cascade guard relaxed — model-level punishment continues even when provider punishment is skipped ([src/bandit.mjs])
- fix(bandit): default fallback cooldownMs reduced 30s → 15s ([src/bandit.mjs])
- fix(config): STREAM_IDLE_MS=300000 and STREAM_MAX_MS=600000 added to .env.example ([.env.example])

### Changed
- .env.example: added STREAM_IDLE_MS and STREAM_MAX_MS under Server Configuration ([.env.example])

## [0.46.0] - 2026-11-13

### Fixed
- fix(proxy): log streaming now detects file truncation/rotation and resets read position ([src/index.mjs])
- fix(bandit): 403 key limit now distinguishes transient resetting limits (cooldown-model) from non-resetting permanent limits (ban-provider) ([src/bandit.mjs], [config/bandit.json])
- fix(proxy): cascade guard now logs struggling models when punishment is skipped ([src/index.mjs])
- fix(proxy): client disconnections/aborts no longer unfairly punish models with cooldown ([src/index.mjs])

## [0.45.0] - 2026-11-13

### Fixed
- fix(bandit,config): align error classification hardcoded fallbacks with config/bandit.json rules (403 key-limit → ban-provider, stream errors → ban-model) ([src/bandit.mjs], [config/bandit.json])
- fix(bandit): recordFeedback now handles non-object errorDetails so classification always runs instead of falling through to escalating cooldown-model ([src/bandit.mjs])
- fix(bandit): reorder transient error patterns so Playwright/Cloudflare 502/503 is checked before generic 5xx, preventing provider-misconfigured errors from being misclassified as cooldown-model ([config/bandit.json])
- fix(db): reset 6 stuck provider attention flags and clear cooldowns on stuck models ([scripts/reset-bans.mjs], [scripts/clear-all-attention.mjs])

## [0.44.0] - 2026-11-13

### Fixed
- fix(bandit): provider reset now resets all models belonging to that provider, matching dashboard confirmation message ([src/bandit.mjs])

## [0.43.0] - 2026-11-13

### Fixed
- fix(bandit): remove "model_cooldown" from error classification pattern to prevent cooldown feedback loop cascade ([config/bandit.json])
- fix(bandit): add cascade guards in emergency rejection handler to skip double-punishment on models already on cooldown/circuit breaker state ([src/bandit.mjs])

## [0.42.0] - 2026-11-12

### Added
- feat(ban-metrics): reset erroneous permanent bans and regenerate documentation ([490b3d6](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/490b3d69d928de48853365d24e71d432677300ed))

### Changed
- docs: add comprehensive CHANGELOG.md and README.md documentation ([d106436](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d106436e0e540972b7b97fcf7fd5d3fa8c5e6572))
- docs: clean up AGENTS.md files with non-obvious project-specific info only ([f53c189](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/f53c1899e82240fe3a90663d7658ade3e8ba91ac))
- docs: update AGENTS.md with 5-strike rule and StatsAggregator docs ([e0cd60a](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e0cd60a983661746e3ce008a9447b156f06c6de9))

### Fixed
- fix: allow statsAggregator reassignment from const to let ([fed6ad4](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/fed6ad4e2949a5d078ddedc3611099d28592bc75))
- fix(changelog,reset): fix changelog loading error and full stats reset ([4b1ffd9](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/4b1ffd966f6baf00468e784ab15ada10d3e12079))

### Security
- fix(bandit): prevent infinite ban loop after database reset by checking permanent status before incrementing consecutive_critical_failures ([326ddab](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/326ddab2e4ed5cbcbd00e4d8b1a4668f49aff69d))
- fix(bandit): improve error classification, metrics, and history sync ([81c8a00](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/81c8a002097340270f74ba4911e197385553f481))
- fix: improve punishment system and real-time log sync ([1c28ad4](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/1c28ad4fc63cefb57b67dde04ed671accb83ad88))
- fix: prevent mass permanent model bans, upgrade to 5-strike rule, add real-time stats aggregator ([cc6a740](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/cc6a740a37139dcaa09b9a800fa01a02372ff7a3))

## [0.41.0] - 2026-11-11

### Changed
- chore: bump version to 1.28.20, fix copy button state persistence ([8eace18](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/8eace186066d008f1edd7b5f420d884d579eefcf))
- chore(release): v1.28.22 - documentation, changelog, and configuration updates ([7c4bbf6](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/7c4bbf64686ef8b035473979f95b9e2d9eee2c73))

### Fixed
- fix(gitignore): retain raw_git_log.txt for auto-git workflow compliance ([4d1ae7d](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/4d1ae7debcb5b1aa3fe0871cfb1a5bf2f807be83))
- fix(frontend): consolidate copy-box-content event handlers and standardize timeout values ([e80c4f8](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e80c4f89bb0d7291b4983077ed70f28c2ca76a13))

### Security
- fix(bandit,dashboard): resolve SQL param mismatches and sanitize model names ([aa80b78](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/aa80b7895ac51f5ec21d0b1815b43309ef0bf4d9))
- fix(dashboard): resolve API_TOKEN ReferenceError in WebSocket initialization ([2534053](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2534053d85ffa1feb59ec124594f4310657c3812))

## [0.40.0] - 2026-11-10

### Added
- feat(dashboard): integrate punishment events into unified history with WebSocket real-time updates ([d071f02](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d071f0279158edcffdf65524cfda162ef08350db))

### Changed
- docs: add CHANGELOG.md following Keep a Changelog and README.md with comprehensive documentation ([d13b95c](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d13b95c4f4068c58c23bf76fcea5a9541cb6f83e))

### Fixed
- fix(log-filtering): correct regex patterns for log entry type detection ([8106abc](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/8106abce0a6d34473be6610c2ec7c81820988dde))
- fix(dashboard): refresh main metrics when switching tabs ([78d454a](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/78d454a0d2d240d50313901b5ca569b5afe973db))
- fix(dashboard): synchronize global metrics across all dashboard tabs ([91c3e69](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/91c3e6915140d57c97f17854983f0e11c81c5e2a))
- fix(dashboard): correct syntax error in refreshAll function ([c29719f](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/c29719fe25e4b35edeb4bf5622aad16c68706be3))
- fix(dashboard): isolate filtered metrics from global dashboard stats ([60779c4](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/60779c4ceab2879974ed8dbb3083eac919f49385))
- fix: isolate global dashboard metrics from tab-specific renders ([3bbf023](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/3bbf023d778681b6ce438b2d4b17a6baea22b95e))
- fix(changelog): add Version History section and fix conventional commit format for test compliance ([f2794a8](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/f2794a898f05834dd36461766af7d948aae7a919))

## [0.39.0] - 2026-11-09

### Added
- feat(punishment): add 3-strike rule, event system, and training feedback metrics ([80686aa](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/80686aaafb7abdd4dd7893a16a5ebb25591f6dbf))

### Changed
- chore(release): release v1.28.15 - update documentation, changelog and dashboard ([93d81a6](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/93d81a66cf5b9702b54b6c38e18cf15cd65729ec))
- chore(changelog): format changelog entries for test suite compliance ([35408e3](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/35408e3e18ecb0f9ed9d5fd4fc76980f2760234b))
- docs: generate complete project documentation ([54f871e](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/54f871e9409b3fb001f5e22fa32a71e506cc6f55))
- docs: update README with comprehensive documentation including 3-strike system and event system ([899a723](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/899a723b8348328b3c675ccc53387c39523418ca))
- docs: enhance API documentation with examples and endpoint details ([3d67377](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/3d673775f5d083638c0d5ef4f247f4b9287397af))

### Fixed
- fix(gitignore): retain raw_git_log.txt for workflow compliance ([e8a510f](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e8a510fafba46c8b36a239623b59f233ce82c755))
- fix: correct typo in ESM __filename polyfill (__filename__ -> __filename) ([3d5797a](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/3d5797a63e9a17c767ef4e03041c7d746ac353d9))
- fix: database fallback for recent requests when in-memory buffer is empty ([40ccd0c](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/40ccd0ce51039aef6d48cb665961c3dfd170afa3))

## [0.38.0] - 2026-11-08

### Added
- feat(dashboard): release v1.28.5 - dashboard enhancements, changelog modal, unified history badges, and daemon stability ([9cdb0a9](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/9cdb0a9d10398f326ff01baa7b412cd92a76de03))
- feat(dashboard): release v1.28.6 - collapsible train providers, helper text removal, script output visibility, model metrics fix ([d21e7e0](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d21e7e0854fc850f9d3d451f060b7483529989d6))
- feat(dashboard): optimize frontend dashboard reactivity, debouncing, AbortController request management, and visibility checks ([d398cbd](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d398cbddbeb1332569cbdde80b9cb385a8fac87d))
- feat(proxy): enhance runtime error classification, fallback routing, and health check validation ([84da73a](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/84da73a282aab1cac81a90794bf2d90714c8c6dd))
- feat(dashboard): optimize models & train tab layout and sanitize model names ([b4a7679](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/b4a7679e858cb5682cd3dbe784c05285df3ae3a6))

### Changed
- chore(release): release v1.28.9 - update changelog, README and system configurations ([d5e6a18](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d5e6a187e5e72a4b97f74a6efe026da1cda4e847))
- chore: remove raw_git_log.txt and ignore it ([ef0939f](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/ef0939fd3539de44418db48bcd2f2118d6779778))

### Fixed
- fix(dashboard): fix dashboard model metrics display and update version to 1.28.7 ([8d690c9](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/8d690c986e96f12d60cea053f0b7a28db7d69760))
- fix(dashboard): fix updateStat hoisting reference error in stats polling loop ([4d3b6ff](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/4d3b6ffceeaf261be30a2f3cc6f7dd1336b54d6d))
- fix(dashboard): fix collapse behavior and metric filtering synchronization ([3a1a3b6](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/3a1a3b6f069e60fccb1826a95a26c54db05eeea3))
- fix(dashboard): synchronize models view with dashboard metric boxes ([896c508](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/896c508db00bc76b024ec5307b2c3a6fee32ae6a))
- fix(training): track persistent 404 model errors and auto-mark permanent in train-daemon ([291a5ca](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/291a5cad0911956dec38dd1be3437d8f8b0bc4b4))
- fix(train): automatically flag models returning 404 as permanent=1 in training daemon and update docs/changelog ([3f63fb9](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/3f63fb937e8bd746ebb0e9180b6226417f77ef2a))
- fix(auto-git): execute workflow documentation and versioning updates for v1.28.11 ([1db4db2](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/1db4db2466496b00854b72e88e0446ef924b3406))

### Security
- fix(bandit): classify 503 Playwright and Cloudflare Playground errors as provider cooldown ([26d1f0b](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/26d1f0bec5535a55d6ff3133bed9a48e567d5b56))

## [0.37.0] - 2026-11-07

### Added
- feat(dashboard): comprehensive dashboard improvements and bug fixes v1.24.2 ([69f36de](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/69f36de81ac2412b34c76710ba984253df83b638))
- feat(dashboard): implement dashboard improvements and refinements ([a63fef9](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/a63fef9484788950b10c9091d0f21d66af967610))
- feat(dashboard): refine dashboard UI with container-scoped resets, clean train tab, and improved daemon controls ([f76cddb](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/f76cddbceb282b91abff5aba7300dfbc82731d47))
- feat(dashboard): refine dashboard UI and update release v1.24.4 ([351616f](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/351616f943174f4128e74cc641f043ee4fbd7f6d))
- feat(dashboard): refactor Train tab, optimize filters, responsive scripts manager, and training status heartbeat timeout ([e68ad8c](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e68ad8cd1d550465771565fd1056d3db58222d18))
- feat(release): bump version to v1.26.0 and update changelog and dashboard UI refinements ([7b33f2c](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/7b33f2c5f16fe805160961787a58ea8ab424e533))
- feat(release): bump version to v1.27.0, fix training feedback for models_train and optimize scripts manager table column widths ([946ac5f](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/946ac5f6350c8b4f0f14aa2d2ce310a5b1a8f6d8))
- feat(release): bump version to v1.27.1, synchronize models_train during catalog sync to fix GET /v1/models?source=train results=0 ([9aeccfb](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/9aeccfb04f193761a34f0f1c0273fecb20502160))
- feat(release): bump version to v1.27.2, synchronize models_train during catalog sync, refine training daemon status and dashboard UI ([0634aca](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/0634aca360b1bed52b6ec2b3fe4e8e9fc39f869c))
- feat(release): bump version to v1.28.0, update changelog and README, refine dashboard UI and model/provider reset actions ([69939ae](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/69939aeaf70bc87c8e6be8b78d22822784ebe754))
- feat(training): Add live log streaming and fix training status cumulative metrics ([f381173](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/f38117323f070a2f4a7db28ffad6d2f9b2572d5c))

### Changed
- style(dashboard): refine Scripts Manager running badge logic ([43db1bc](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/43db1bc088a0dded3b92a61304a862d22954ac0e))
- chore: bump version to v1.25.0 ([643417e](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/643417e2c3cf45cc4abbfcb8ca54333b42dfe4b7))
- chore: bump version to 1.28.2 and suppress train models logging when inactive ([cb20198](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/cb20198cd4168cd5ffd5b92c3c7f581a889eed45))
- chore(release): v1.28.3 - robust error handling, toast notifications, restart-safe improvements ([0d522ed](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/0d522ed2faa6227976437e3fdd21e354cbd6ce31))
- chore(git): update .gitignore and include raw git log ([cfbb327](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/cfbb327bab84ef462ef70f08035270ff0f661239))

### Fixed
- fix(dashboard): optimize scripts manager table width and auto-activate quick action panel when running ([429a882](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/429a882cbefa7a6e9b45ad51885f1dd31da82acd))
- fix(dashboard): add tooltip to Quota reset column and standardize Reset Model button labels ([862ec75](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/862ec75cd644d9e0d759ef48385194d90f2ce8e7))
- fix(dashboard): add tooltip to Quota reset column and standardize Reset Model button labels ([650c28d](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/650c28d7886ee473ab8f9c3f8001b53844d8955e))
- fix(training): keep status active during inter-cycle pauses and extend daemon liveness tolerance ([706bc55](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/706bc5597e1db822a9739bc9c6fe4d2cc7666021))

### Security
- fix(bandit,dashboard): fix SQL catalog insertion parameter mismatch and apply dashboard UI refinements ([c40f67f](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/c40f67f15bb3b1206f459f6a23a5ca20b282637a))

## [0.36.0] - 2026-11-06

### Added
- feat(dashboard): enhance Models tab capabilities and UI layout ([2af898d](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2af898dbe8a58cbe68392eee5d356111adcc4052))
- feat(dashboard): enhance Models tab capabilities and UI layout ([2a794d4](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2a794d46b00897fdb3d84e38779000f44341db1f))
- feat(dashboard): add real-time training status polling and scripts tab navigation ([f3f9f76](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/f3f9f76785e96423b08e97b5dc316d646217d4dc))

### Changed
- docs(change): update CHANGELOG.md with dashboard real-time updates ([0c0c62f](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/0c0c62f13ad3b6b2b7e26425b9710ddeede3d297))

### Fixed
- fix(dashboard): fix provider expand/collapse and half-screen responsive table columns ([bc72dda](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/bc72dda8fad4aeeac11765c2348a71f98b0d8fc1))
- fix: resolve model count discrepancy and dashboard UI issues ([e8aa328](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e8aa32840e637e89e6df4cc8e71f492e1e5c7728))
- fix(models): resolve 5 UI/UX issues in Models tab ([495af16](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/495af1648cf9f87b848bec49941187516f5a6ce3))
- fix(dashboard): correct flatMode variable usage in renderAll function ([e01a28c](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e01a28c7a91e8b474084d4a8976b0682f582512a))
- fix(dashboard): fix provider expansion/collapse in Models tab ([88801c1](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/88801c148e0fbb8f6a618e5662f724b621b6f38e))
- fix(dashboard): optimize dashboard UI elements, changelog modal, and responsive metrics ([483b0c5](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/483b0c5f8980f33a0dbed7a2b17fcdc087fb6207))
- fix(sql): resolve parameter count mismatch in updateTrainingStatus() ([d0cef87](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d0cef87f6899785c28407497ff75494129437a94))

### Security
- fix(bandit): add AbortController timeout and offline fallback to catalog sync ([2ca1abb](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2ca1abbad4888784768ae820baf809dcf6a9337b))
- fix(train-daemon): sync updateTrainingStatus() with bandit.mjs fix ([1da7918](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/1da791899482712ff1bdb9275c97c64ebc7a2085))

## [0.35.0] - 2026-11-05

### Added
- feat: add WebSocket support for real-time script output streaming ([957706a](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/957706ab694602d626350f21a67746b912849cd9))

### Changed
- chore: update CHANGELOG, README, and version to 1.18.0 ([7ee8106](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/7ee8106283f4681df9a62044b0b6bc85cb2a887a))
- chore: bump version to v1.19.0 and update CHANGELOG, README ([a4b03d7](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/a4b03d7220d9177642cfa29088922219908f6b51))
- chore: update CHANGELOG, README, and version to 1.19.0 ([e3cd21f](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e3cd21f3db235a8f68bf69ca7eeb2e22998024dc))
- chore: update CHANGELOG, README, and version to 1.19.0 ([51aff40](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/51aff4060d70cc79075b5a143069daeb1fbf1070))
- chore: update CHANGELOG, README, and version to 1.20.0 ([df22ad0](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/df22ad0ab0a1346036681d3f8be760e76ef0d6f7))
- chore: update CHANGELOG, README, and version to v1.19.2 ([1ba0384](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/1ba0384eb6046f9fc7efda04b49a824b695d250b))
- chore: update CHANGELOG, README, and version to v1.19.3 ([01fb985](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/01fb9850f21bac3afb281f0b6748067b82f494df))
- refactor(auto-git): improve changelog generation to follow Keep a Changelog v1.1.0 ([79c9fc6](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/79c9fc677f2e2fb08efa0a5bdf5de865ad6caa2c))
- chore: update CHANGELOG, README, and version to v1.19.4 ([2a6dc34](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2a6dc3496a3b0e9bbc54ef2b309d3a329c0d2168))
- chore: update CHANGELOG, README, and version to v1.19.5 ([e197627](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e197627d3dc58bffb2111bb73e8e3fe36244a28d))
- chore: update CHANGELOG, README, and version to v1.19.6 ([05e566f](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/05e566f9d495dbadabae7923af84fd3b61dbbaaa))
- chore: update CHANGELOG, README, and version to v1.19.7 ([1b438dc](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/1b438dcc4cd1498d5080f4d06c62ed3a5dced484))
- chore: update CHANGELOG, README, and version to v1.19.8 ([db9f424](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/db9f42419b6399915401d1afa8e703f3bf465fb3))
- chore: update CHANGELOG, README, and version to v1.21.0 ([9497ab1](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/9497ab120dd99c6b1a4b2f73be4d3d9b578a475b))
- chore: update CHANGELOG, README, and version to v1.22.0 ([0749aa4](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/0749aa43bc74eed9b4ebf2d2ec1218b2bc59f13e))
- chore: update CHANGELOG, README, and version according to Keep a Changelog 1.1.0 ([00da0f2](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/00da0f2b949225ae10c831a37bb2cbf8a6eeb9a3))
- docs: normalize CHANGELOG.md formatting and add fix entry ([c6dfc70](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/c6dfc7010db19f01bcd6e6df645ea01b2c19e7ea))
- chore: update CHANGELOG, README, and version to v1.23.0 ([bcbdc55](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/bcbdc55c323081ecead841535145bd91306a1626))
- refactor(commands): convert auto-git.mjs to markdown documentation ([0ae2402](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/0ae240287c1706c2f44804b48184b9a8c130ad92))
- docs: integrate auto-git.md into global ~/.roo/commands/ and remove project copy ([ba6a692](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/ba6a6923f32122d1f3172d8e75681a25202d7ea5))

### Fixed
- fix: correct version to 1.20.0 for WebSocket feature release ([b11c0b3](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/b11c0b302b9ecc4410ae43216a83b7cab7d1ba8e))
- fix: update README.md version header to v1.20.0 with proper formatting ([366aa06](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/366aa068578e4f18a8c70a602d35c2ca97e8f8b2))

### Security
- fix(bandit): resolve totalObservations undefined error in getDashboardStats ([26c3222](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/26c32222ba53195defd094578537863b3a6bf749))

## [0.34.0] - 2026-11-04

### Added
- feat(bandit): implemented exponential backoff cooldowns and total_failures tracking for consecutive 5xx errors ([cf6a1eb](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/cf6a1eb6f87f57b7142375777dab9395c1f57cb3))
- feat(bandit): implement exponential backoff cooldown system with punishment tracking ([ce529ea](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/ce529eae96861e8fb9547c24f62ef6c060e1f16f))
- feat(bandit): implement 3-strike aggressive punishment system for critical failures ([87fd346](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/87fd3460ee7d205695d9e4ff51d9b851a182dd29))
- feat(bandit): implement aggressive 3-strike punishment system and exponential backoff ([182256a](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/182256abee704a2f6ff8c70cb959049ef5072a19))

### Changed
- chore(repo): squash consecutive generic commits v1.14.7 to v1.14.10 ([447dccf](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/447dccfced6162763fb6a1eb166779fe75b87b69))
- docs: update AGENTS.md files with recent changes - exponential backoff, total_failures, error patterns, dashboard updates ([7e1172f](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/7e1172f17cb3c5df5ac1f84efda3d53afa9f4af8))
- chore(repo): cleanup and documentation update for v1.15.0 ([56634e6](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/56634e6befde478a9e6abc54d62d3258113ac538))
- chore(service): add User/Group configuration for systemd service ([b70bea6](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/b70bea675cff920d9c8fcea6de5ba0cb4a045bc1))
- docs: update README and AGENTS.md with v1.16.0 and 3-strike system ([1e5079c](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/1e5079c7c94b9a7be8b42a4a8020decae038a7db))
- docs: update all mode-specific AGENTS.md with 3-strike system documentation ([8838744](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/88387449284116dded713ef293db879eecca3c1b))
- docs: create enhanced auto-git.md, update CHANGELOG and README ([48b5b97](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/48b5b97b60b44cf01448914dfe630dba3c07b5c5))
- chore: remove project-level auto-git.md, use global version ([efd2205](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/efd2205578355cb803635204d8704efcb9f58695))

### Fixed
- fix(dashboard): resolve 'page not responding' with chunked rendering and debounced polling ([1c9cb1a](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/1c9cb1a6bafbfb87b54d2b0e9de8ae06cf08903f))
- fix(dashboard): fix syntax error in renderAll() if/else structure ([fa8ad6a](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/fa8ad6a097f0a0e4accee63f3dc3fe07b0e5a7a9))
- fix(streaming): resolve safeWrite initialization order error ([a18b5dc](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/a18b5dcff6dc7ef3af92a190ef4793021d889df6))
- fix(config): improve error pattern matching for model errors ([ac2d667](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/ac2d667a08cff51cb1afac7fd148b3fccb52a5b8))
- fix(dashboard): strip provider prefix from selection history model names ([d8ba7c5](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d8ba7c566b48a43d6b5fe755ea7383580fc947d1))
- fix(proxy): add supports_vision checks in fallback model selection ([4d9b9cc](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/4d9b9cca97bc1f49e27db4735b708f882a08f631))
- fix(docs): update CHANGELOG.md line references to match actual source ([a55b802](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/a55b802f8f9c032af718432ea67dc5b9d17c2443))

### Security
- fix(bandit): use sanitizedModelId for proper error punishment ([fa480e1](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/fa480e11490c927c1761a188a50763f5ffa9f388))

## [0.33.0] - 2026-11-03

### Added
- feat(proxy): stop failure spiral for exhausted provider credentials ([c7e2ca0](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/c7e2ca0ac540331deec42c8866c9a5c8cce10ec8))
- feat(dashboard): add dynamic non-active stats and colorize badges ([91058de](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/91058dec2dd878fc3754ec5e376f35b359a482db))
- feat(dashboard): fix - show x/y non-active counts in detail lines, restore percentage display ([19b9449](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/19b9449745a4e1004caa0a4b8c9fab623838b0eb))
- feat(bandit): emergency relaxation and fallback chain improvements ([3f6c454](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/3f6c4542aa2ea4609903c87c39334a01291f486e))
- feat(dashboard): enhance Unified Chronology with per-model selection history ([5311f3a](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/5311f3aeef32bb5acea4df76407941b95e731e9c))

### Changed
- chore(repo): update version to 1.14.0 and CHANGELOG.md with auto-git workflow documentation ([f2e2e4f](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/f2e2e4f0459701df7af576859df4de7e20c43205))
- chore(build): deduplicate CHANGELOG.md entries and update project version ([f9b6733](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/f9b6733dd1cc02dfd83f6b3504860e75046a1fa8))
- chore(repo): auto-git workflow v1.14.7 - repository maintenance and documentation updates ([1e52730](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/1e52730299374f0870c0fdb2f042f18af47b6df4))
- chore(repo): clean up temporary files ([2e324ad](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2e324ad754b71be4a7c76b466008571d15d628c1))
- chore(repo): auto-git workflow execution v1.13.14 Repository cleanup, version bump, documentation updates, and project utilities tracking ([5e652ec](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/5e652ecd4044a14e8ccaae511e2bd343efa76c02))
- chore: optimize git history and consolidate automation commits - Squash consecutive generic/automated commits (v1.13.6 to v1.13.7 workflow) - Update documentation structure and changelog formatting - Consolidate auto-git workflow updates and version bumps - Update dashboard configuration and project rules - Clean up temporary files and planning artifacts - Update bandit model pruning and README references - Consolidate provider metrics and documentation updates ([f2146ae](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/f2146ae6fab813c16d29c747ea64f90fe0ed5571))
- chore(version): bump to v1.14.10 and update documentation\n\n- Updated CHANGELOG.md with new version entry v1.14.10\n- Updated README.md to reflect v1.14.10\n- Updated package.json version to 1.14.10 ([fd3dbcc](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/fd3dbcc3ccae1cbb9024d3ad51d1209bfa17d669))

### Fixed
- fix(streaming): add safeWrite helper for client disconnect handling and buffer management ([1ef4ed6](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/1ef4ed65940a42a04f87674c111d4dcc74574fb9))
- fix(dashboard): reduce unified chronology table height and remove bottom margin ([4816a76](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/4816a769cfc7add6982772c9a476e8f3b25a5587))

### Security
- fix(bandit): optimize error classification and fallback chain reliability ([18adc0c](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/18adc0c7f470a78b73041a36d3b79869f41a3813))
- fix(bandit): improve continuity with exponential backoff and emergency relaxation ([dad204d](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/dad204da1c4aa7bad2fea32fb69dc57d42dc4f3b))

## [0.32.0] - 2026-11-02

### Added
- feat: merge training status into top model card ([8350dba](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/8350dba20aede6f17023767e940bb6bc4342307e))
- feat: active events display, metric percentages, unified history row height, and train-daemon functionality ([25da083](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/25da083596b674d606ee3b4f793f9dad7f777ac2))
- feat: move provider metrics to providers tab, quantize unified history, fix session deduplication, fix ITPM emergency tier ([ceb474e](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/ceb474e1d9e8ad21be7b1bf6d9fad5c01dcee569))
- feat(dashboard,proxy): move provider metrics to provider box, add color-coded log filters, fix session dedup and TDZ errors ([c3805b9](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/c3805b9c8581b1cf748488c1fff4feb86e856ebb))
- feat(ui): add log message expansion to dashboard ([2ad72fa](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2ad72fa3f8917e385cfd15d142d843b22699fe3d))

### Changed
- chore: bump version to v1.13.6 and update docs ([13c13e9](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/13c13e9b112bc5bbe6372ca1e6e4496c454c6718))
- chore(docs): auto-git workflow v1.13.7 - cleanup, changelog standardization, version bump ([1bad5d1](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/1bad5d1f668ed585262de1888d355b8271f7201b))
- chore: bump version to 1.13.9 and update changelog ([d73ff8c](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d73ff8c775503e6fe6903b71bc82d67071f7e17c))
- chore: auto-git workflow execution with version bump to v1.13.10 ([c40f6c5](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/c40f6c50dc0ab272a62db6f1cadc0c71825a27db))
- docs: rewrite README.md to reflect actual project capabilities; dashboard: add provider % metrics, redesign pricing filter, add filter tooltips ([c726bdb](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/c726bdbd329a7a9944024c599b00f0780b0d98b7))

### Fixed
- fix(ui): resolve syntax error in dashboard logs ([abf8bef](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/abf8bef7055bff9abb3f68b18c501d29be241cc1))
- fix(ui): resolve syntax error in dashboard logs ([856bb2a](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/856bb2a16db017e254f1f006151fbd2f059fe2b1))

### Security
- fix(dashboard,bandit): update log colors and emergency relaxation filter ([f5e98dd](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/f5e98dd3e5536db43417a0d5713348a5fa20136a))
- fix(bandit): re-evaluate error classification and punishment system ([042f4c0](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/042f4c02695a43074a2dc055e9207fcf7bc94d8a))
- fix(dashboard,bandit): update log colors and emergency relaxation filter ([ea56a6e](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/ea56a6e09a67ea624af4dabbbd04ead357c58469))

## [0.31.0] - 2026-11-01

### Changed
- docs(roo): ripristina auto-git.md globale e sincronizza documentazione workflow git automatizzato ([97bd2a6](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/97bd2a6d19d19b391ca8891b1296faebc6cb90a1))
- docs(CHANGELOG,README): update version 1.0.0 changelog and documentation ([64b3a30](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/64b3a30c10fb89dd998ab831065a2c52c0a3a91f))
- chore(docs,src): update changelog v1.0.2, README version bump and bandit model pruning ([ebadb86](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/ebadb86404b5e0f978ca480be3a37bd4262066e3))
- docs: update version to v1.13.5 and documentation ([6c3449a](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/6c3449a199335fd69c3f190f8cba740b6d56f464))

### Fixed
- fix(scripts): fix check-nvidia.mjs double database connection bug ([48a3ea8](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/48a3ea8158ed37979f702852f8fb4bce7045855c))
- fix(scripts): enhanced restart-safe.sh with sudo and facial recognition support ([b169fad](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/b169fadbb12b462adbb0a7e609c0ec38e8075789))
- fix(changelog,docs): recalculate version numbers and format changelog ([5e58ba0](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/5e58ba0446ddfe0b13707b88e65943fde385b2b7))

### Security
- fix(bandit): emergency relaxation ignores already_tried and non_chat_model_excluded ([6ff73cf](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/6ff73cfc2379cf46738286476d350a2023fbcb7f))
- fix: respect ignoreTokenLimit flag in dynamic_max_tokens check ([3bca826](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/3bca826165f277a393fe12e432877579764700b1))
- fix(bandit): resolve emergency cooldown relaxation and vision filtering ([5de4214](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/5de4214e8e8439da452b51a2d8de4dfd47cc01e8))

## [0.30.0] - 2026-10-31

### Added
- feat(src): automated commit ([dae10a2](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/dae10a213e1b6a38add24817e1ecb33859f03caa))
- feat(src): fix error classification ([ded55a2](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/ded55a2daad7ccb8efed154174e03bf690e46baa))
- feat(src,docs): update bandit logic ([faadf07](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/faadf07c6c6a5db5145e703d1c039a1245dc23df))

### Changed
- chore(src,config,changelog): automated commit ([9e88b1b](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/9e88b1b2cb126a6842ff0bb5d0adf1a35260d589))
- chore(src,config): update provider limits ([1b4450c](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/1b4450ce2cf78668747778ab941b393a6d9faee1))
- chore: update documentation ([0721a03](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/0721a03a8e16a63dad527ef8d0d327dd080ff9d5))
- chore(scripts): update omniroute-bandit-proxy.service ([e61a30b](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e61a30bcaf799fd6d353bfe402f0aa7cad1a12eb))
- chore: update dashboard.html ([2d87449](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2d874496f7a664290b1c8bdc4eb2ea839cb99794))
- chore: automated update ([e8ee864](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e8ee864572ed3b4863b64a06ad57c7f526a3a59e))

### Fixed
- fix(ops): migliora restart-safe.sh con rilevamento binding porta multi-metodo e controllo stato failed ([0364bf9](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/0364bf977f99bffaccdaa6c69abd41d87d91f6f0))
- fix(ops): gestisci stato servizio inactive/dead post-start in restart-safe.sh ([345d585](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/345d585f499b5dc6ef1e1e08c3e791ca50b3da3f))
- fix(ops): migliora gestione stato servizio con attesa graduale ([a447be4](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/a447be4e06a1d086f0d1c274aaa80b7beba062d2))
- fix(ops): correggi priorità systemd system prima di user in restart-safe.sh ([a1100f5](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/a1100f5ad769ac4f6c431e11ff1141e7afb948b5))

## [0.29.0] - 2026-10-30

### Changed
- chore: v1.1.90 — 2026-10-30 ([f88bb76](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/f88bb76661b5c8b2ea9b28abb41ac2c52787ce31))

### Fixed
- fix: revert incorrect ZOO mode addition; fix dashboard CSS alignment and filter overflow ([af0293d](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/af0293d3b93c8a56d5efbbd92c43d31e21c110ad))
- fix(proxy): fail fast on model-not-found errors and fix status reporting ([0d09d07](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/0d09d0722dc6b41e5316c93ef340be330aeaae0e))
- fix: remove duplicate isHardError variable declaration causing service startup crash ([6992fe5](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/6992fe59951913bf331c55835eced18dbed5f3dc))

### Security
- fix: prevent model re-selection loop in bandit emergency relaxation ([7137d7e](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/7137d7e927eb1beda622a8b7b3a4c950d263fdde))
- fix: enforce cooldown in bandit emergency relaxation tiers ([1fa82d2](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/1fa82d2a682a31f8628f8e0054cfcad043d4add9))
- fix: universal provider_cooldown rejections - fix noteProviderFail error type filtering, reduce maxAttempts, set EXPLOIT_ONLY=false, add provider cooldown reset via health check ([4365d84](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/4365d84d9b0893ad9621514847f48eb98505d2af))
- fix: clear cooldown_until on successful requests in recordFeedback() ([706de4f](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/706de4f4dd6b9c330e5d4418d76f69837c749e9c))
- fix: model sanitization validation, error classification improvements, and provider cooldown fixes ([7160d37](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/7160d3758cd98dbd1826cc949aed4e9fab7b6e5b))

## [0.28.0] - 2026-10-29

### Added
- feat(bandit-proxy): add auto-git workflow and cleanup test files ([4a178c6](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/4a178c61337d6c8d821ef2b5c8d8111b31c5168f))

### Fixed
- fix(dashboard): resolve column overlap in Cronologia Unificata table ([7ccb5a9](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/7ccb5a9e4d041cbdc07f5be83d0da65724801374))
- fix(dashboard): fix template literal syntax error in fmtRow return ([ad5ef71](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/ad5ef71587c96a338a56f92fa3aa01db19006270))
- fix(dashboard): stop polling /v1/models when models tab is not active ([118c37a](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/118c37a2bef17582618eea6c83fc15062f2e53b0))
- fix(dashboard): fix log streaming column alignment, message truncation, and container height ([54591e0](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/54591e06ec489953af87cca26b71fdac1d1ebb2d))
- fix(dashboard): prevent connection errors by adding try/catch to chat/completions route handler ([21a11b3](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/21a11b3a7743eec3c161c92ba242f3acb6fff125))
- fix(dashboard): remove try text from Cronologia Unificata timestamp to resolve column overlap ([67e3a8f](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/67e3a8f3a9051215e5b6f14dde2a6f9369ed624e))

### Security
- fix: prevent repeated provider errors in bandit model selection ([aa4a7ab](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/aa4a7ab717d6185a878f2ff8d2f20e478f2d72a1))

## [0.27.0] - 2026-10-28

### Added
- feat(dashboard): comprehensive dashboard overhaul with enhanced metrics, logs, unified history, and controls ([41c8882](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/41c88824a8c3210279aaf889118ff29bb41641b7))

### Changed
- chore: add auto-git command and skill definitions, update changelog and readme ([feb12d1](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/feb12d149a3447f804703168b402a8d64b4a3d1d))

### Fixed
- fix(dashboard): resolve structural issues in public/dashboard.html ([85c7e5f](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/85c7e5f8c0c9f66fc294593a493188ad73962d7e))
- fix(dashboard): resolve syntax error in public/dashboard.html ([cbaf8c1](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/cbaf8c13a49df501ce5374e811667b517996704d))
- fix(dashboard): fix log streaming rendering and copy button ([93e7a41](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/93e7a418b944644d8ade12559364d0ae99141c3d))
- fix: CSS overlap fix for 'Osservazioni OK' in dashboard stats (display: inline-flex with gap) ([e8afce7](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e8afce7fee53f9e6922dcb8e46cbd5a1c7db3f42))
- fix: resolve 'no such column: N' error in getDashboardStats() ([46260d1](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/46260d1eecafbce881dc8751f0109908eeac9ce2))
- fix(dashboard): align metrics numbers, hide scrollbars, optimize half-screen view ([94e5779](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/94e5779360c31e6e703479528fcbb4848957e76e))
- fix(dashboard): align numbers, optimize columns, invert unified history order ([600bccd](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/600bccd9fa7deec8a4959827cf6adfe86d0adc1e))

## [0.26.0] - 2026-10-27

### Added
- feat: separate reset endpoints for models and providers ([2ca801c](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2ca801c9199f349261562f770b267b974e11b68b))

### Fixed
- fix: dashboard reset buttons now call correct API endpoints ([edcc953](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/edcc95373c93e63362d69f48643dc92f2093f42a))
- fix: resetProvider endpoint now passes provider name correctly ([774de70](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/774de70cb74c83d7d1f085aaa7d7d014cdd50346))
- fix(dashboard): resolve SyntaxError and ReferenceError in dashboard.html ([afdf627](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/afdf6270cf3bdfb0e3bd27d09823a773b1449442))
- fix(dashboard): render logs in log streaming panel ([8ee9901](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/8ee9901e708403338e09cd67fcdafdaf9bd0c2e6))
- fix: render log buffer string entries correctly in dashboard ([dcdbfe1](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/dcdbfe18ac8f20127f099185801282c7ad392eee))
- fix: resolve 'source is not defined' unhandled rejection in selectModel function ([2be83f7](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2be83f72f8760d66d0647e170c1835412ad9c7ca))

## [0.25.0] - 2026-10-26

### Changed
- chore: update documentation, service config, and maintenance scripts ([5d67066](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/5d670660a189c1d1fa96ebb38dd2dfe7b7860bff))
- Remove project-local auto-git.md (moved to global) ([899966a](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/899966a11a08eaaaa11cdb277344423b814ca01a))

### Fixed
- fix(restart): resolve port 8080 conflicts and improve restart safety ([19d4462](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/19d44623082c6fd8079a6730783f888e99fb7327))
- fix(scripts): enhance restart-safe with failed state reset and active job handling ([2524852](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2524852ee248453c93959431d44477544de7ec04))
- fix(server): move SO_REUSEPORT option before socket bind to prevent EADDRINUSE on restart ([4b1a6b6](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/4b1a6b6be03df1e12158c988b8ce592565a57a40))
- fix(script): show only recent logs in restart-safe to avoid displaying historical errors ([b5692e4](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/b5692e427efcedabc4e9770668178b36a13d479e))

### Security
- fix(bandit): resolve model filtering, duplication, and sync issues ([20090bc](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/20090bca89b141333c068f3e580d913303fcb188))
- fix(bandit): fix totalObservations counter timing and enhance resetGlobalCounters ([ef65255](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/ef6525524e8a41cb7f0ccda6180c2add64860555))
- fix(bandit): fix proxy error handling for cfp 502, antigravity 429, and stream retry blocking ([a01a146](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/a01a14693c889317c9d0d5b5347d6a2aaea11f90))

## [0.24.0] - 2026-10-25

### Changed
- chore: configure auto-git command in .roo/commands/auto-git.md ([9bbf8ab](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/9bbf8ab84a84e46e10da1dda7b5192991615d4bd))
- chore(automation): improve auto-git staging workflow description ([d659320](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d6593202006be6fe6c109adce0f91c8c7f1d5207))

### Fixed
- fix: resolve EADDRINUSE on port 8080 during service restarts ([5d187c8](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/5d187c8a03715749c25cc925e398ee563fcc26db))
- fix: prevent auto-git from skipping production scripts during cleanup ([6d5cd19](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/6d5cd1980ee1421b5822148f5b41a480a232f93d))
- fix: correct syntax error in src/index.mjs after graceful shutdown changes ([d926f14](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d926f147daf3e19f59458a43648b18a907052088))

### Security
- fix(db): reset provider flags to resolve ban/cooldown issues ([c6887e2](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/c6887e222effef3b1038fef2e600797b725a8c9f))
- fix(bandit): add ignoreDegraded support to emergency relaxation tier ([a56e14b](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/a56e14b0625c8be5ab0f0a95543737c8bd5488a7))

## [0.23.0] - 2026-10-24

### Added
- feat: implement fluid typography for dashboard stats ([d6072de](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d6072de26bfc71764f405b5507ffd4028408c5ee))

### Changed
- chore(scripts): update automation and utility scripts\n\nStaged files:\n- .roo/commands/auto-git.sh\n- scripts/auto-git.mjs ([00e6ede](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/00e6ede868d6eeaa46ddc7ceaf21b252ebde601e))
- docs: update project documentation and architectural plans\n\nStaged files:\n- .roo/commands/auto-git.md\n- .roo/commands/auto-git.sh\n- scripts/auto-git.mjs\n- scripts/fix-db.mjs ([ba501e6](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/ba501e69b08b33e93f72d0eb347d0ebd3e85e1c7))
- docs: update project documentation and architectural plans\n\nStaged files:\n- .roo/commands/auto-git.md ([3c73a7d](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/3c73a7dc76ae43de624e45a7b797bd736bd32ccd))
- chore: project cleanup and documentation update ([833fe35](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/833fe353871ee3085123783adeed3398b1476ee8))
- chore: cleanup and maintenance ([d02b2bd](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d02b2bdab9ec85874ddd02ff6c03d58e349f9067))
- chore: remove accidentally staged .env file ([3f3d814](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/3f3d81411079d4ecc5bb080936d80cab6a0c49cc))
- chore: ignore .env file ([012211a](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/012211a85028b5ac33549abc24f9d40d416152fa))

### Fixed
- fix: update systemd service paths and update changelog ([287003f](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/287003fdb9c7e74751da731832efaf7424a8e7c8))
- fix: refine fluid typography scaling for stats boxes ([2b060ed](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2b060ed279a5b586e8ac974f6844f8d91bd3db2b))
- fix: use viewport-based scaling for stats boxes in dashboard ([110bb2b](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/110bb2bcde4321e6575c9e5d11ab17077c0da78c))
- fix: remove duplicate latency unit from dashboard observations/catalog ([c890d1e](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/c890d1eef461264ce853d162408d053b8e05500c))
- fix: correct observations/catalog stats rendering in dashboard ([f3c9d2e](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/f3c9d2e2958b3a5e4e92072f21cf1ac756580eee))

### Security
- fix(db): reset provider cooldown, permanent ban and attention flags for no-think, cfp, xao, xai-oauth, openrouter ([160a755](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/160a7554b3e9a699a8e7d32e17fd6857a39e2137))
- fix(bandit): ignore vision constraints in emergency relaxation and update catalog vision capabilities ([fdadb77](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/fdadb77a807c6fb7c472e5ce19d4f52781857083))
- fix: reset attention flags and add emergency relaxation to bandit logic ([15d30e4](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/15d30e4802fa75400b9abc2dd8fa10dc2f63202d))

## [0.22.0] - 2026-10-23

### Added
- feat(dashboard): add script manager with live output polling and enhanced UI ([520d2c9](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/520d2c939bb3c087a1ae8290a2fc2e787bd22e11))
- feat: implement 5 enhancements - auto-clear needs_attention after health checks, provider circuit breaker, improved token estimation, fallback model scoring, per-provider health check frequency ([7644e0b](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/7644e0b80b2941e6ea3627048413fbe31bca5d48))
- feat(bandit,index): implement vision capability support and catalog migration ([e0e7ec9](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e0e7ec93e348f417b9eb09f5ecaaee58fd5c54b8))

### Changed
- dashboard: compact 2-column stats grid, split models/providers, reduce padding ([b9772d7](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/b9772d7ed1ac0d47e7a2ba24e8c93949183c86be))
- dashboard: 4-col grid, models+providers 2-col inside same box, keep all data, reduced padding ([f53b9aa](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/f53b9aa51932a7a84d50b3dedef65d5445f38b94))
- dashboard: 1 row 4 col stats grid, separate Provider box, copy-all button unified table, fix status rejection logic ([c9c0bcc](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/c9c0bccb8f22b2f224897448d84fb3367b9d6d31))
- dashboard: 2-col internal grid per stats box, Top model name on second line ([d0c1a27](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d0c1a27d4c4aabb3a8195217b9cbd0aa7d483d7f))

### Fixed
- fix(dashboard): prevent top model truncation and parameter/value separation, group stats into 3 boxes ([e6f68f6](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e6f68f68cb41e9705443244b0c58a0ababc509bf))
- fix(dashboard): remove overflow clipping and text truncation from stats boxes ([f8ffde2](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/f8ffde2345236867743e9a224745e7dd63f80f78))
- fix(dashboard): let stat boxes size to content instead of forcing equal width ([10f79ca](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/10f79ca5c555161ee17e9619f6947f8595fb26af))
- fix(dashboard): remove inline flex:2 conflicting with flex:0 0 auto on top model stats box ([e58c093](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e58c093fc46209022efd22938912df83ef4bedea))
- fix(dashboard): allow stat boxes to shrink and stay on single line row ([4d06877](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/4d06877589e99a282316e814d0a3a2092111fc0f))
- fix(dashboard): use grid 3 columns for stat boxes single row ([a53fbb9](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/a53fbb925d79ec5b7867cca4f7fec8bc2fb19102))
- fix(dashboard): increase stat box height 3x for single row grid ([4b27cb7](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/4b27cb79c3094fadd5cb7b2bc2e547cccb62fbd9))
- fix(dashboard): allow line breaks inside stat boxes ([748b920](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/748b920c917584f5a2d0e4e2c40e7d718f36b4e8))
- fix(dashboard): make each stat box use 3 columns internally ([aee7774](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/aee77742db85cb67e51b8a44fef0b598acb8db19))
- fix(dashboard): split stats into 4 columns with name value pairs side by side ([dbe950a](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/dbe950a49a2341a4d08d2a646ae9f805fdaf02b7))
- fix(dashboard): restore full stats data set with optimized 3-column grid and variable widths ([3756a42](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/3756a42a8433d5a4b01119270c3779fcc0fbe9f5))

### Security
- fix(dashboard,bandit): resolve 6 dashboard issues and restore backward compatibility ([4472530](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/4472530b31112009bf0c36d9e42b9765beb5bed6))
- fix(dashboard): clean duplicate HTML blocks, add top model cooldown/N metrics, expand scrollbar hiding rules ([b070c4f](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/b070c4fe265b5b6fecaa4dd87989c531fc53f11a))
- fix(bandit,index): improve error classification and session affinity logic ([2719527](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2719527cfb69a1b3fe49e6c83392f8cf63d1e2ac))
- fix(bandit): improve error classification, timeout handling, and cleanup unused files ([7e88018](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/7e88018b117daf7a361f481aae1769babbe116b0))
- Fix provider handling: hard-exclude dva for vision, change 402/403 non-resetting quota to 24h cooldown ([47a478a](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/47a478a52d8f6ce75f532cd38be0e6ed5440b6c4))

## [0.21.0] - 2026-10-22

### Added
- feat(api): implement POST /v1/images/generations endpoint ([7a477e1](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/7a477e154359684072dfe0afb151c37734287fcb))
- feat(log-noise): add request throttling and log-noise filtering to reduce console spam and improve polling efficiency ([784a232](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/784a232b24070bf5d890de5bcd6abca239b502b0))

### Changed
- docs: update CHANGELOG.md and README.md for log-noise reduction feature ([c6bff9d](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/c6bff9d663656cfcadbc5355f944d95b61c4b80d))

### Fixed
- fix(dashboard): fix Chat Catalogo and Totali Grezzi statistics discrepancy ([7b00a85](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/7b00a8545591fc989d194b8032b9409108c6918c))
- fix(src): resolve false-positive image generation detection ([27d2086](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/27d20868b018eaa0fcd8903c302a228aa858ecc9))
- fix(dashboard,proxy): resolve model double prefix parsing, timestamp/elapsed seconds formatting, trend indicators, degraded model count, session affinity persistence, and observation counting ([a42e976](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/a42e9767fe94d999f3c92065dc70a09240ac4d64))
- fix(dashboard,proxy): fix timestamp display, consolidate error logging, optimize layout, remove unused scripts and plans ([2805569](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2805569a11948df4aadb3c83ff2d2f75c5d0ba58))

### Security
- Fix dynamic_max_tokens bug and dashboard polling; reset corrupted model limits ([8fc2c3b](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/8fc2c3b34518db0263a2df1de12bae69b235f4bf))

## [0.20.0] - 2026-10-21

### Added
- feat: enhance model selection candidate tracking and consideration history buffer across relaxation tiers ([232c045](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/232c045bda4bcb843a7c9bd7cab3fcef3dcdaaed))
- feat(dashboard): unify active requests and ucb1 specchietto into compact scrollable panel ([bdb18ff](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/bdb18ff7b2d2f6084c87be13bfd4482894b8e218))
- feat(dashboard): redesign unified panel cronologia operativa & stato ucb1 table ([35aa6cb](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/35aa6cb14eb8e1ad37102e435aef7a3fd5a575d8))
- feat: capture failing models and 400 errors explicitly in request logs and dashboard specchietto ([4cbc902](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/4cbc9020d372e57cd0e325724710ba61743c9155))
- feat(dashboard): integrate provider stats, separate provider and model columns, absolute timestamps, compact row heights ([b3a7828](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/b3a7828e5a96508a575355ea5e7e0a8b1b6c9bf8))

### Changed
- perf(dashboard): optimize RAM usage via consolidated polling and DOM patching ([ff08f1b](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/ff08f1b3f348d1a944d4c573460fa18c52340d40))
- perf(dashboard): optimize DOM reflow, debouncing, memory management, and sanitization ([e5578d5](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e5578d525f5e7ca30844996bf65cfdf9e5c309d1))
- Refactor dashboard unified panel: flat header, single scrollable row list without double titles or collapsible toggles ([385f58d](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/385f58da79bc47f38b08088dcbc72c71848afb82))
- Update dashboard UI: unified card, icon reset button, model stats clarity, remove consideration tab and title, real model/provider and timestamps ([1db6644](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/1db664402862f030c22902897cd40ac859a4e53e))
- Refine image generation detection in src/index.mjs to eliminate false positives on chat completions ([d46244d](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d46244d54cfb8f8b0913a501bb5a1cc363c13260))

### Fixed
- fix(dashboard): optimize RAM usage, fix tab switching lag and requests tab bugs in public/dashboard.html ([2d57811](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2d57811e4486293e3e04aba695400bb772d22b9c))
- fix(dashboard): fix floating action button changelog and developer handlers ([5270543](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/527054331e560410e4ea78f248420237e1c21a89))
- fix(dashboard): update dashboard interface and configuration ([4d1b58b](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/4d1b58b5e6bacaae346e8c707572b65cb9609b5e))
- fix(src): record and log HTTP 400 errors in middleware and request handler for Zoo proxy ([6af11f2](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/6af11f2d0c841528f0adbccd203e76ca7d8cacd1))
- fix(dashboard): fix refreshing reference error and providers is not iterable TypeError in renderProviderQuota ([613a8e6](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/613a8e6c3c55baf751ad0943258866463d24a901))
- Fix dashboard reset button, request logging, and 400 validation errors ([4063f15](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/4063f15ef4e7c97c6770a66912aaac8b2adc243c))
- fix(sw): update service worker to use network-first strategy for dashboard and HTML assets ([2650720](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2650720d8e902ed6062860a21050a58f91817250))
- fix: update nginx static root path and bump service worker cache version for dashboard visibility ([7ef9b51](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/7ef9b519392b08854d00030ec9e8f737d5b33751))
- fix(cors): add CORS headers and OPTIONS preflight support to resolve Firefox network fetch error ([7ae1d80](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/7ae1d80c713179de621d99550af4ab6b704d4be5))
- Fix dashboard layout, log table columns, reset counters button, and stats text format ([21318f0](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/21318f0ba17cfd2b85d55b93033f08c844fb2698))

### Security
- fix(dashboard,bandit): refactor stats container layout and streamline request logging ([13b9c48](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/13b9c484dae343e702a98f9e806c24652a193a45))

## [0.19.0] - 2026-10-20

### Added
- feat(dashboard): fix syntax errors in public/dashboard.html and update changelog ([9193c6f](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/9193c6f31550353f03994beb600fdc2b7cecb3a5))

### Changed
- refactor(bandit): refine model selection relaxation tiers and optimize debug logging ([08f1ac9](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/08f1ac91f323cc8d2b9e9add8e5e2143c98af330))
- docs: update CHANGELOG.md for v1.1.63 ([64643cc](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/64643cc9ab18cfe6af980a3752e5113495178365))
- refactor(dashboard): improve UI efficiency and event handling ([21d4453](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/21d4453bad4896f9e6a7b804129a76707052f2f1))
- docs(changelog): update for dashboard refactor ([4ec60d5](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/4ec60d59668bab9cb9324ceabf7336d67db45f57))

### Fixed
- fix(dashboard): resolve application version, metrics panel, and log viewer issues ([422d075](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/422d075951918d2840f18427a1dfd7f667f36baf))
- fix(logging): fix log buffer pointer corruption in ring buffer and restore log streaming ([b491f23](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/b491f231ad0a87381cda3f4bd25cd3414a88fba4))
- fix(dashboard): enhance JSON safety and data rendering in public/dashboard.html ([675613b](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/675613b8190d8680433949a7007c77bc0a95ce96))
- fix(dashboard): bypass service worker caching and installation for /v1/ API endpoints ([7f828e1](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/7f828e1127cc23eb9c856b328a3cb2bd9276bdf0))
- fix(dashboard): correct indentation and syntax in public/dashboard.html ([57246d0](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/57246d08da4af31dbd8761b038364d960f3d8efe))

### Security
- fix(dashboard): fix TypeError assignment to constant variable API_TOKEN restoring dashboard functionality ([4b624f7](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/4b624f754774ed2c339641fbde388734f2e60c6e))
- fix(dashboard): handle authentication 401 errors, token persistence, and auth prompts ([eda783e](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/eda783e047f3f1ac1bf63d26183c1b6c5f18bc90))
- fix(dashboard): resolve silent 401 failures and improve token prompting in dashboard ([1769d28](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/1769d28efbaa4a2bc29951fa918796114c1cee43))
- fix(dashboard): resolve dashboard regressions in version display, metrics, logs, and conditional auth ([8c095c8](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/8c095c8a0ca5cd601b27aed5b13130cdbadf0781))
- fix(bandit): refine error handling and ranking in src/bandit.mjs ([2bbc2ff](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2bbc2ff612cf2c1613cee32df4b24b1a22a4acba))
- fix(dashboard): fix auth placeholder bypass and dashboard stats database resilience ([65254ab](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/65254ab95081f19bd5737bdfdcadf7b5e258a72e))
- fix(bandit): harden getMetrics and getDashboardStats with robust try/catch and ignore placeholder tokens for REQUIRE_AUTH ([f524331](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/f524331c360f2333006d52dd5b9fe64a47d73668))

## [0.18.0] - 2026-10-19

### Added
- feat(proxy,ui): update dashboard UI polling/timeout logic and conditional session affinity bypass, update changelog ([65f30ba](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/65f30ba46d1d75d3c3c992151dacaf25afeffa47))
- feat: add chronological discarded models spec sheet and per-group provider quota handling ([9a396ca](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/9a396ca15bbae64bd557fd9e8abedc6c85d45e3d))
- feat(dashboard): integrate model evaluation specchietto into top panel ([7983c63](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/7983c636c4168d01be0fe651ae3ecc0800ee4efa))
- feat(dashboard): remove Considerazioni tab and integrate selection/discard timeline into Live Logs tab, fix proxy error classification & retry loop, and fix /v1/metrics bug ([9bd064b](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/9bd064b3b522dc50693326474d20efbcc17c7646))
- feat(dashboard): embed chronological selection & discard spec sheet directly inside ⚡ In corso tab ([e24e8f4](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e24e8f487f81a27880141cf01907311ad2b1a347))
- feat(dashboard): refine metrics fix and dashboard UI refactoring ([44d5499](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/44d54999569acac3ab00c928c47b275ff5ad2413))
- feat(dashboard): deeply merge active requests history and selection rejection spec sheet into unified persistent component ([1a0cc96](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/1a0cc963049c2c72fa8657b442ef0ba518ad8686))
- feat(dashboard): perform true structural fusion of active requests and selection rejection spec sheet ([6fc85a5](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/6fc85a5bbbe283e213e9a56c94d170f1f0292b12))

### Changed
- docs: add changelog entry for v1.1.58 (discarded models spec sheet & per-group provider quota) ([70fc0f1](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/70fc0f159c192049a0cf9a462c5dba2e29b381f5))

### Fixed
- fix(notifier): prevent telegram url parameter mutation and update changelog ([adda237](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/adda237832568d038634851763af0a4659326fc2))
- fix(proxy): fix sessionKey assignment to constant variable error in src/index.mjs ([fbea512](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/fbea5129f81caa1e553b31e38cee348a2e74eeb0))
- fix(dashboard): fix dashboard metrics remaining at 0 with null-coalescing and debug logging ([47bc375](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/47bc375087d9909a61609b5a969fa83c494dc8cc))
- fix(dashboard): fix metrics polling/API and optimize vertical spacing for dashboard tools ([ca588e1](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/ca588e17c52439b79f24c547532db249430097f2))

### Security
- fix(bandit): include non-chat models in catalog sync, update capability classification, reset rank cache and update metadata ([d36695e](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d36695efaaa39d9a460e22fa3a942cbd561056e8))
- fix(dashboard): fix consideration fetch via apiFetch and add 401 handling ([360430f](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/360430f5362314a1b9c5a7e2c0fd6fa67e69a905))
- fix(dashboard): handle 401 unauthorized and token prompting for metrics polling ([2f7e666](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2f7e6667e605a2ac3fa370ec299e9dd74fa0be19))

## [0.17.0] - 2026-10-18

### Added
- feat(bandit/dashboard): refine model selection with N=0 prioritization and quality-to-speed metrics, add vertical consideration panel and 100ms polling ([b31b800](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/b31b800e804714bcac1684fd4c59c93608cc1632))
- feat(bandit/dashboard): add model metrics (N, reward, latency, score) to consideration history and dashboard ([e530397](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e53039776d3df123b8c9e23ffc87b735b5bccc85))
- feat(proxy): add SPA fallback route for non-API requests and update changelog ([b63cc9b](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/b63cc9badc5009e4e2cafabc93e8f2b85e56573d))
- feat(bandit): implement model categorization and capability filtering ([7e344e4](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/7e344e4232db96c2e005a8cd2d6c5648cf42e43d))
- feat(bandit): implement round-robin exploration for unvisited models and fix image-generation filtering ([2bad266](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2bad2660526c91e2e2e6811a470ab020226925fb))
- feat(bandit): enforce strict capability filtering for tool requests and image generation models ([18a415c](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/18a415c898b7ce7822c826cc2e4804757236c7c6))

### Changed
- chore: exclude aihorde image models from chat completions, update tests and CHANGELOG ([365875d](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/365875d53eb7b571e3a3853ec06a67e174e58fca))
- Add image generation request check and NULL capability guard ([b40ec94](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/b40ec9432c194be3e44a9cf8596ab8c1d634100f))

### Fixed
- fix: filter out image-generation models for chat completions and make active requests panel scrollable with attempt rows ([d72a33b](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d72a33b1a5fa166eca0cb7190135b4ccefafc5c3))
- fix(proxy): fix image-generation model fallback loop in chat completions ([fd65b64](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/fd65b64c53a9fab19b5b9fe14d2e8808e61bcda7))
- fix: correct parameter order in selectModel call to prevent image-generation model selection for text requests ([20595ae](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/20595ae08747693ddc27cf1a7f11cf4f15cd118a))
- fix(spa): add server-side SPA fallbacks and enhance client-side route synchronization ([e078b91](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e078b918dc6f462a509e245d8066f4cd1946cbdd))
- fix(dashboard): optimize RAM and CPU usage by reducing polling frequency and capping log size ([4800779](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/480077969fe47ca80c685834084f9f4c3bf7b499))
- fix(proxy): fix streaming retry block by eagerly reading first upstream chunk before sending headers ([d8c5c97](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d8c5c97bde29c7cc29e52ddc7d0c51a26b22ff32))
- fix(dashboard): prevent 404 on tab refresh using hash-based routing ([e87dfda](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e87dfdaea587c472be3bb7dc7ab84fcb36a5ee35))

### Security
- fix(bandit): exclude image-generation models from chat completions and tool usage ([614d03b](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/614d03b91676441b34c20ab2edbd2b2550a19f3d))
- fix(bandit): relax tool and token filtering constraints during model selection recovery ([29d0b6a](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/29d0b6a729e6958f6501ea27f800f23b521b7e91))
- fix(bandit): improve model filtering relaxation tiers and fallback passes ([0ec56f1](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/0ec56f1f9acaca7c248246f23635a0be07a1f698))
- fix(bandit): exclude image-generation models in emergency last-resort fallback selection and update changelog ([090bb5b](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/090bb5b4ad06e451e1729bb01968645252ac9dda))
- fix(bandit): exclude image-generation models from chat completions and handle 400 bans ([59ac724](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/59ac724718dac22be2f93170afb1a9d89bb9efd6))
- fix(bandit): strictly filter out image-generation models and permanently ban 400 capability mismatches ([f5c20b4](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/f5c20b429dfb59b675508ec418cf128cc198d768))
- fix(bandit): prevent image-generation models from being selected for text requests in isModelAvailable ([702f176](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/702f1766d43d0ff989c85d1fb0668e65c4adab7a))

## [0.16.0] - 2026-10-17

### Added
- feat: enhance request token size estimation for system prompts, tools, and tool calls ([1abbd0c](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/1abbd0c86af7099785f7f2375ff5ab7f2b3515e4))
- feat(dashboard,scripts): add script arguments input and default status in train-ctl ([16c732b](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/16c732b0f7dd972cade9b4f8f7e7cbc60ff2fe0a))
- feat(image-generation): add image generation detection, routing, and support for /v1/images/generations ([759c3ef](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/759c3efa1d8306ce129342fc03332af3409823e4))
- feat(proxy): add image generation request detection and conversion helpers ([04ffe21](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/04ffe21f7989ab0ac7360d0a3d687d2361cd29c1))

### Security
- fix(bandit): classify Playwright browser launch 502 errors as ban-provider ([1789cab](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/1789cab1a60501459385506cb78b9bd234cd55e7))

## [0.15.0] - 2026-10-16

### Added
- feat(itpm): configure provider ITPM limits and update changelog for 413 error handling and session affinity fixes ([d22f56a](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d22f56a2f29d2d25bd70da7eead375541ebfaa31))
- feat(proxy): enforce dynamic token limits and refine session affinity TPM blacklisting ([a5682d4](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/a5682d4f8e91dc97bd79bcc74a489babfde99c6d))
- feat(bandit): exclude tts/audio/image models during sync and enhance selection banner logging transparency ([c049a2c](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/c049a2ce2fdd3fd7d42002a5595ad653d2ba4d98))

### Changed
- chore: cleanup obsolete scripts and plans, update changelog and docs ([2bf3ae5](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2bf3ae51173d8396bfe1fb449f5cc81180503018))
- test(quota): add test case for 413 TPM-exceeded dynamic max tokens adjustment and model filtering ([ab61def](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/ab61def0a8e9c62ccfcbaf75d8279eb96f639596))
- docs: update changelog and clean up design plans ([d9408ab](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d9408ab3c92a629d59901a77e7425205e5ad4f53))

### Fixed
- fix: invalidate session affinity on model errors and failures ([b9fa9f4](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/b9fa9f43ed26717b9f640481b0052543b0f4f4c1))

### Security
- fix(bandit): dynamically extract and persist model token limits from 413 errors ([61ee09c](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/61ee09c84d32ff7ec38936f556ca0b2041e2baca))
- fix(bandit): prevent selection of cooling down and token-exceeded models ([63d620a](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/63d620a8fb1bbbf0897d1b27c47b658fca390f20))
- fix(bandit): prevent zero-cooldown loops on 500 errors and enforce strict tool filtering ([6d501ef](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/6d501ef5f6b2caedc87497ed0e5e907b0b97e7db))
- fix(bandit): pre-filter models exceeding provider ITPM quota before UCB1 selection ([ffea17f](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/ffea17fc5096210daa5813eff82e833d0597e69f))
- fix(bandit): robust classification for rate-limit queue timeouts and high-demand 503 errors ([91cc961](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/91cc961eae65c5879035783e8c5d127005038f53))
- fix: prevent infinite selection loop on models exceeding ITPM/413 token limits ([6ec2f36](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/6ec2f364aaa875b84ef6565a1e07ec15adbfe127))
- fix(bandit): improve error recognition for 429 quota and 503 queue timeouts, and enhance dashboard model selection UI ([51f76f7](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/51f76f7e7da06c67589b6c1a51fe0fd0985c4d0f))
- fix(bandit): improve robust handling and cooldown for 413 ITPM / TPM exceeded errors ([61d1a97](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/61d1a9746bde89063834ec83bf65e331f7ef93c2))

## [0.14.0] - 2026-10-15

### Added
- feat(dashboard): add color-coded badges to model statistics ([20d65e6](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/20d65e658fd5d126d6c313beaad0d6e45b0aceb2))
- feat(dashboard): optimize log frequency, top panel metrics & UI style unification ([c25c3b3](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/c25c3b35f5bbb04f4817c5fc73ff15f298ec2030))
- feat(bandit,session): ensure model existence in feedback recording and add 413/tpm session invalidation test ([2fbcfd3](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2fbcfd33baab4838590a60867370595863bedb3e))

### Changed
- refactor: generalize installation paths and improve script path resolution ([4eb6d08](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/4eb6d08cecb614932a81d14252de9253ecb9358c))
- docs: update CHANGELOG.md for v1.1.8 ([bef609b](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/bef609b500740745abcad58f683eeae8e218bc12))

### Fixed
- fix(proxy): replace recursive compressBody with iterative loop and update changelog ([1aab17a](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/1aab17a986fad7b24072ded3416d9a93fc272506))
- fix: improve error classification and session affinity handling for TPM and 413/429 limits ([8aec374](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/8aec3746a194b0815301f2423cc336986ca4f22b))
- fix(dashboard): move Monitorati metric to the left of dashboard summary ([96d5901](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/96d5901a19d6549023f9367e7bf584cad439b7f0))

### Security
- fix(bandit): enable optimistic exploration for unobserved catalog models in selectModel() ([c23729b](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/c23729bf8f865e9b7b8699003572fa11a9e11df2))
- fix(service): fix unreplaced placeholders in omniroute-bandit-proxy.service and service restart logic ([1d10a82](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/1d10a82249dc857b0e2ac50ab164b06da7f2b46d))
- fix(bandit,proxy): fix session affinity blacklist check and 413/TPM error handling ([f1e7ff4](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/f1e7ff43f00501bdf4b774d18565022c0d616882))
- fix(dashboard & bandit): fix metrics display, reset buttons, and upstream error classification ([4be3ef5](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/4be3ef5b64671da8be69b8c5dda7328975692759))
- fix(bandit): permanent ban and proactive filtering for environment and missing model errors ([6d798ee](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/6d798ee37b30659fd96806e2b6aa644a93e911dd))
- fix(bandit): refine error classification and token limit validation & update docs ([b0dc9f0](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/b0dc9f038ecc431041e4d7de199caccbd0f5369f))
- fix: resolve CFP browser, Antigravity catalog, and Groq TPM token limit errors ([b8d06c3](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/b8d06c33679f3477acdcc4560e6f1764711596e0))
- fix(bandit,dashboard): handle TPM/token limit errors and refine dashboard metrics styling ([5f9fcf2](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/5f9fcf2cd442efbbae0777abb3cf9a37f7ff2392))

## [0.13.0] - 2026-10-14

### Added
- feat: enhance multi-armed bandit proxy routing, error classification, and metrics dashboard ([d8d740e](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d8d740ebd2308bd9b8dc322ec9aa0be085056d3e))
- feat: enhance bandit routing, health checks, retry handling, and add comprehensive test suite ([9b0dc27](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/9b0dc27c3caf675ce258ac175345775dc52f57aa))
- feat: clean up unused skill scripts, add update_changelog custom tool, and update CHANGELOG.md ([264d159](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/264d159a37c5bbd886a200c3186f417dba94170e))

### Changed
- docs: update project documentation and architectural plans\n\nStaged files:\n- .roo/commands/git-auto-commit.md\n- package.json\n- plans/auto-git-workflow-design.md\n- scripts/auto-git.mjs ([8de53ce](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/8de53ce9f6951af9edf5e413f876ca9f434ccb70))
- chore(scripts): update automation and utility scripts\n\nStaged files:\n- scripts/auto-git.mjs ([aa968c2](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/aa968c21bd0ac984d6a2bc924d8ee717e97e866c))
- chore: clean up temporary test scripts, artifacts and auto-git script ([bba8c43](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/bba8c436f98fa3fb7cedc59f975833a0a2e78d33))
- chore: clean up artifacts, update dashboard stats verification, and update changelog ([32294d2](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/32294d2cab66557c9b973f0a475da4ac522c1d31))
- refactor(proxy): enhance dashboard, quota checks, bandit reliability and operational scripts ([bce13a0](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/bce13a0c60134be0b7c7f2a87e4837dcd805eca3))

## [0.12.0] - 2026-10-13

### Changed
- ci:git-auto-commit: git-auto-commit.sh ([b3bf28a](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/b3bf28a6257de4010f90ee792dd3236af3057719))
- test: message ([1a9c068](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/1a9c068d7e6ced283283079f3442bfb596e51199))
- test(test_debug.txt ): test_debug.txt ([bfbe06f](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/bfbe06fc0a85dcf0f4a701a7b6297164ceca8689))
- ci(scripts): git-utils.sh ([80ef5b1](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/80ef5b10e474b9f2e91065decab06434e668eff1))
- ci(scripts): git-utils.sh ([34941eb](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/34941ebb4060c5ff278290f308bd8a32d3b48eff))
- test: message ([a1b2f83](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/a1b2f83278712c9a7021865872e90e29cd0f2a7a))
- test(test_debug.txt ): test_debug.txt ([3146057](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/314605791cc97ee03ba0a2f2c6bc7a7389abf469))
- ci(scripts): git-utils.sh ([afeb472](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/afeb4720f7f5d24c900c973b43a9afcfc3d605c6))
- Merge branch 'main' of https://github.com/CherrugDeveloper/omniroute-bandit-proxy ([ed5bed6](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/ed5bed645176ee11a8a02fc60b483d2f8df60b11))
- ci(scripts): git-utils.sh ([23f781a](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/23f781a31f929773d76d6d8c139ada4327cb8d77))
- test: add test file for git-auto-commit ([ca402f4](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/ca402f422a0781a860873a7823d2700a19914524))

### Fixed
- fix: resolve git-utils.sh merge conflicts and syntax errors ([097b8c9](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/097b8c984577114de198c71f0ded6463ad0c3f6b))

## [0.11.0] - 2026-10-12

### Changed
- refactor: reorganize git-auto-commit skill and command files ([0322a50](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/0322a50f387b4b2c7ea24a3eb7e5f5ee5b39a340))
- ci:scripts: git-utils.sh ([2a57abb](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2a57abb1ebd94686a63a4dbe733d30e74374217f))
- ci:scripts: git-utils.sh ([14cabe5](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/14cabe5923f9c636a59f86991aad5452bb54cade))
- docs:git-utils.sh scripts: wrapper-test.sh ([7484c6d](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/7484c6dbb57955cbeb3f5174e644d1d824a80a9f))
- ci:scripts: git-utils.sh ([b000d95](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/b000d953652ad1a59c84185569dc96083a108408))
- ci:git-auto-commit: git-auto-commit.sh ([9819cf7](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/9819cf7f1700538954719de5f24184644c403457))
- ci:scripts: git-utils.sh ([3ad3b86](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/3ad3b86d0e50c63d45f02db194abe320d9eef52e))
- ci:scripts: git-utils.sh ([beaa50c](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/beaa50ca3c074fa1160da79059a9a6113f4be1f2))
- ci:scripts: fix auto-squash unbound variable error ([d881ebb](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d881ebbb53e0795923665faea987d767a83972e4))
- ci:scripts: git-utils.sh ([d66d401](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d66d401f807e6815e065e298f880425e8b465bdc))
- docs:git-utils.sh scripts: wrapper-test.sh ([2c1fe3b](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2c1fe3b50908d3c8f8806f8087aa503620bb43a7))
- ci:git-auto-commit: git-auto-commit.sh ([c558839](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/c558839f1eee2412d3f859414f3f4468f891f61a))
- ci:scripts: fix auto-squash unbound variable error ([3206acd](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/3206acda0c6ebbae2f9f7154251378d94a82c129))

## [0.10.0] - 2026-10-11

### Changed
- docs:.roo: .env.example ([cbf4cd9](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/cbf4cd9d4895ab1f5192352b2f8f64c6a902a1a6))
- chore: optimize git-auto-commit script ([d362095](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d362095e6428b0750fe27d79b9b77b5a8be38c39))
- chore(git-auto-commit): add GIT_AUTO_COMMIT_WSL_EXEC environment variable support ([6016f43](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/6016f434659b88ff17e58992f4002ea5239f5883))

## [0.9.0] - 2026-10-10

### Added
- feat: provider quota system - dashboard table, needs_attention filter, CHANGELOG v1.1.0 ([d316b5a](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d316b5ae26713c4329f6ea10813a8f71f1c0536c))
- feat: provider quota system - dashboard table, needs_attention filter, CHANGELOG v1.1.0 ([495a489](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/495a489963fc6ce43d15803eecd8d1621c00e633))

### Changed
- chore: normalizza line ending (LF forzato per tutti i text file) ([b5f0965](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/b5f09652f92c5b6e95eb22d57e98f93b8eaa3429))
- revert(index): 98a9fe5 rompeva la sintassi ([57697e2](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/57697e2e216640ede422576d72d4385dab580299))
- revert(index): c6483bd di nuovo rotto, ripristino 57697e2 ([4579510](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/45795104ccb91d3f7e499ea4d9774726a01ffc65))
- chore(scripts): train-ctl.sh eseguibile ([b1d3c10](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/b1d3c103c4844df05828394ba66e932fdac474dc))
- wip(quota): abbozzo sistema quota provider (non integrato) ([57fe80f](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/57fe80fa1ea7c6131517b3c5469810f0a01ee18d))
- v1.1.1: API modelli/provider, fix HTML dashboard, CHANGELOG ([fc5d495](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/fc5d49585a3bd15d6a8d4273599517c47e918949))
- chore: sync local branch with remote and cleanup files ([d154b48](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d154b48cb65a3b9353d3add0bcc10aab54cdd4c8))
- ci:scripts: git-auto-commit.sh ([4bc28f8](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/4bc28f8d77eb9d7dc87f47cb4e46fc5f7f322bd6))
- chore: fix git-auto-commit command metadata ([f8ef4f7](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/f8ef4f789188b3bd05c63e07356545a36721225a))
- chore: add GIT_AUTO_COMMIT_WSL_EXEC to documentation ([e77353e](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e77353e6c9c5c34d32f5e35a91fd3d1ba96697a4))

### Fixed
- fix(dashboard): log system non ereditano source zoo/train ([bc4aff7](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/bc4aff79e1ba44b4b25dd64acd8a51702fd5b24b))
- fix(dashboard): aggiunge graffa mancante else if SYSTEM_LINE_RE ([46c6ef6](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/46c6ef60e6c61f69c19a719d3aff367a80ea91f8))
- fix(index): estrai la riga data: che contiene "error" (non il keepalive) ([5624396](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/5624396f1899858a877e0b25de28fecd22a8994b))
- fix(index): fallback non loopa se già tentato o non disponibile ([98a9fe5](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/98a9fe5ac3656011bdad7d4562e614026c6f6c7e))
- fix(index): fallback non loopa se già tentato o non disponibile ([c6483bd](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/c6483bddf9027eb4dc5c2fff564680d04282be4c))
- fix(index): fallback non loopa se già tentato o non disponibile ([d6fcaee](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d6fcaee9dc2534ca122f61c7f98472270481b8e6))
- fix(index): strip reasoning_details/reasoning_content/reasoning dalle richieste ([ca66ee8](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/ca66ee82d95156e50b901145816a44b25f1c8880))

### Security
- fix(bandit,index): 410 model-shutdown ban + SSE error propaga status ([c4d9c08](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/c4d9c08063930b4595fcbcd5a41ef933500013e2))
- fix(bandit): isModelAvailable controlla permanent e degraded ([3963bfa](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/3963bfa5228e502f5c88f48355983c8aeab9faf1))
- fix(bandit): selectModel carica anche i modelli permanent=1 ([9d5a8d0](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/9d5a8d084c1c29f8a6b8ed06e8bfabfae1d827fd))
- fix(bandit): ban-model con UPSERT su models ([30ce065](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/30ce0659170d7da35b2b270dc4d4ac8a1beecd73))
- fix(bandit): 403 Key limit exceeded → cooldown-provider con reset time ([19d4392](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/19d4392682b39d81f98b577b773e2094fd8c701a))
- fix(bandit): migrazione quota + rimuovi needs_attention dal filter ([a57f274](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/a57f274242c995d6fb647136a88c10254a01e59c))

## [0.8.0] - 2026-10-09

### Changed
- docs:.roo: git-auto-commit.md ([7a14bab](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/7a14bab287339f3fa11afcd7fd717792eb153375))
- ci:scripts: git-utils.sh ([67e7a83](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/67e7a83bd010237053133a1d273f258aff0d8bd4))
- ci:scripts: git-utils.sh ([7cef3e9](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/7cef3e981679b676f0b6722688a3fea253557b20))
- test:test.txt: test.txt ([a6fdaaf](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/a6fdaafbb09c64644ac2164b11aaa511eb884971))
- test:test2.txt: git-auto-commit.sh ([bc35618](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/bc35618a9dc46cd7f88dc2b0b8950173c2aad62b))
- test:test3.txt: git-auto-commit.sh ([864701b](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/864701ba951cac61e5b4d26810b0d7b7d2644362))
- test:test4.txt: git-auto-commit.sh ([6381bc8](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/6381bc838405762c5c97b5153be9c3db0b95deee))
- test:test5.txt: git-auto-commit.sh ([5a5e916](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/5a5e9169f751f0e1a04f600e6df4a5df0dc21481))
- test:test6.txt: git-auto-commit.sh ([965fa25](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/965fa25a598aa0fc6b06efbca05fc98ae5baf89a))
- test:test7.txt: git-auto-commit.sh ([eb44837](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/eb44837d81247f42c86b9ecfa32a2d101fac57be))
- test:test9.txt: git-auto-commit.sh ([cf67f4e](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/cf67f4eadd2eec2e399f01d719d157c7b1581e0d))
- test:scripts: git-utils.sh ([d4f717d](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d4f717d0d905b26e1540355515ecc75d15529593))
- test:test11.txt: git-auto-commit.sh ([90dd655](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/90dd6557b4818780240aa88e76e8452ef55217d4))
- test:test12.txt: git-auto-commit.sh ([25ba065](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/25ba065c6e08d05a60956ff252dbb8244354fe75))
- test:test13.txt: git-auto-commit.sh ([39735fc](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/39735fce126e620553d5a90aff1aa1ac4422bd4e))
- test:scripts: git-utils.sh ([854490f](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/854490fbac90a7f51242c2cc354b7f0259b245d2))
- test: final verification ([cf5fbb4](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/cf5fbb483bc5df9bb6fbd2d8eb0df50b14356ca2))
- chore: Roo rules + utility scripts (check-db, clean-cjs, verify-server) ([1ffd169](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/1ffd16996d77880cfb93547aae58ca36fcdc8623))
- chore(gitignore): ignore training.log.old, analysis reports ([edd9d27](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/edd9d27dd67108743021ddf1c0325c4968566aab))
- docs: AGENTS.md per agenti AI (Roo, Zoo, ecc.) ([896bb7e](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/896bb7ec16882501495deab364fe3efbf071493f))

### Fixed
- fix(index): selectModel con 5 argomenti (rimosso null legacy) ([7d74c11](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/7d74c11ad9aa1a9787720365265071d7400e40f6))
- fix(index): log raw SSE error per diagnosi gemini/mistral ([5942830](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/59428306cf946bbf094141e46222d8fe9b4077a7))

### Security
- fix(bandit): getUnhealthyModels args, unlock reset needs_attention ([2bcda4d](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2bcda4db7092328681d6bf52e3cba0111e91c80e))
- fix(bandit): getModelMaxInput usa dynamic_max_tokens per models ([64eadce](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/64eadceb150cd97e9b3c5882012137475469ddb5))
- fix(bandit): needs_attention non blocca, solo cooldown_until ([0daf9d5](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/0daf9d5ed0411336d5123f432788c426aaa7bd7c))
- fix(bandit): _classifyError riconosce 'unknown provider' e 'no longer available' ([b27d4c9](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/b27d4c92a334b21f642d75e3f31af6800940ae94))
- fix(bandit): _classifyError riconosce 502 'CLI not found' / 'not configured' ([ab64e41](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/ab64e41125e1ad0ca175a3bd31454f21e76fc897))

## [0.7.0] - 2026-10-06

### Added
- feat(dashboard): checkbox ZOO/TRAIN unificate (log + In corso) ([2d948c3](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2d948c354137c62dbcc8d7624825ba36124207ae))
- feat(bandit+dashboard): reward per tool, loop detection, orchestrator→reasoning ([f8193f5](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/f8193f5119d150e13175189f871f0e0d7fc3e883))
- feat(dashboard): adds debug log filtering ([10c630d](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/10c630de8e0c83fb4a253ba132368182d702cfe4))
- feat(bandit): handles 429 retries with fallback ([2573aa1](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2573aa1e89429ab652ff7fcc3d42b6da5069c8aa))

### Changed
- chore(scripts): updates control scripts ([1f43a8d](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/1f43a8d2d7237993c02d7aa443ece4df0a189610))
- test(bandit): adds rate-limit fallback coverage ([f3111e4](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/f3111e470cfdd0de14bdc9617f4ebe7540bf582d))
- chore: ([4343cac](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/4343cac565692b67bf336f76ca6eb07b8964df40))
- chore(.gitignore): add venv/ to gitignore and update linting rules ([b9e1649](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/b9e1649908da32e9bded8ab81dd353e82fd84d9f))

### Fixed
- fix(context): compresses oversized requests ([d303c6a](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d303c6a39e0eef766554eb5adf52d09d858478cd))
- fix(tools): ignores failed write calls ([2cd0bcd](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2cd0bcd932f38caf13b9f3574cdb22ac8729f00e))
- fix(index): improves affinity loop diagnostics ([c42c197](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/c42c197609b36e1e4ea258b6b926b3cb583f9ce2))

### Security
- fix(bandit): unlock simmetrico provider+modelli, soft/hard cooldown ([0142c1d](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/0142c1d1f60b7dedf518d71e636b32a122805545))
- fix(bandit): cooldown simmetrico provider+modelli, soft/hard, no loop unlock ([03f502f](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/03f502f6c2dd226095ed19d834e5835ede8db256))

## [0.6.0] - 2026-10-05

### Added
- feat(bandit): dynamic_max_tokens appreso dai 413 (self-learning) ([6bf9ee5](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/6bf9ee581f6ef11e8c8b337dafe73010ddec9650))
- feat(dashboard): tabella In corso con header e colonne fisse ([60306cb](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/60306cb76e1ca03cc6e085031de5e6cfba160023))

### Fixed
- fix(dashboard): fmtInfo con colonne uniformi (avg=-, new) ([3fec718](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/3fec7180c0822ce46751d08968bc1daf22e7e9b0))
- fix(affinity): struggling detection solo sull'ultimo tool_result ([fdc68d8](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/fdc68d8d4870b5bb09e8a201a67db16d3a686a79))
- fix(dashboard): rimuove "In corso" duplicato, colonne "In corso" più larghe ([5aee4f2](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/5aee4f2af5bcb5ae160c2b42febd1ab0393c96d8))

### Security
- fix(bandit+dashboard): migrazione dynamic_max_tokens fuori dal blocco is_paid ([4d967f1](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/4d967f12f5514dd21f649e7fc0d3b5ffd691f528))

## [0.5.0] - 2026-10-04

### Added
- feat: session affinity, mode routing, training isolation, debug toggle ([48dace3](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/48dace384506fa753e6a146e2215e0082140686c))
- feat(dashboard+bandit): rank modello, trend, esclusione health check ([ed46ea8](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/ed46ea8d1ff6e9444fdc70ee2a06e0daaf65a01b))
- feat: low TPM filter, unpin 413, new models badge, training exclude ([50edac9](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/50edac901ab83f38d4c918c85385a42e269fd2d3))
- feat(dashboard): CSS Grid per riquadro "In corso", badge "test" per N<1 ([731529f](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/731529ff7abf07ab480cce637643b9eb1641073f))
- feat(dashboard): changelog formattato + badge "nuovo" sul FAB ([57768f4](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/57768f4fb7834e7529e14510e4874e414490b103))
- feat(backend): endpoint /v1/changelog + file CHANGELOG.md ([7442af5](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/7442af5b4b041e383a0107c0ebc54f4b1f61f08c))

### Changed
- wip: info N/avg/trend, ranking, distinzione zoo/training ([43b3de1](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/43b3de1a9eed36f8a6a2786f4a03c2e20feb2bc7))

### Fixed
- fix: gestione errori provider saturi, timeout proporzionale, summarizer TPM ([e1de73c](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e1de73ca14971eef7518f7bfe35659ec18950ec4))
- fix(dashboard): padding-top per PWA window-controls-overlay ([ea11de4](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/ea11de409981333ea345c8fd47ae8c84c0ed2d78))
- fix(dashboard): rimosso script duplicato dev-card (listener doppi) ([1096dea](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/1096dea555ce035b29e32c961ede10f4d8b8ac93))
- fix(dashboard): dev-card con DOMContentLoaded, scroll tab Modalità ([1279d02](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/1279d02625a1394db624b525ff2ac5b4925890d9))
- fix(train-daemon): aggiunto header x-source: training ([7d3c6a6](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/7d3c6a661399f3d7f920d4a4790959460d42c6fe))

## [0.4.0] - 2026-10-03

### Added
- feat(proxy): auto-compress per-model invece di max-catalog ([aba2e6d](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/aba2e6d8b532ece637f1101faa31f2d5aab67e7a))

### Changed
- chore(scripts): restart.sh con feedback log su stdout ([18dce18](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/18dce18ddcb4421abd5779f206ca2bb9598ffb12))
- chore(scripts): update restart, switch-mode, train-ctl, and train-daemon scripts ([be77b0a](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/be77b0a19d02996a02e96ff63d92c820b2910a69))
- chore(scripts): rende eseguibili tutti gli script (bit 755 tracciato in git) ([0ccbb62](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/0ccbb622d0993c712d6228a71754015c244db021))

### Fixed
- fix(proxy): rimuove if(stream) duplicato; fix accumulated->raw; log 503; auto-compress per-model ([4f8d392](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/4f8d392c56bb0ae319123e1af7049d4abc57d46d))
- fix(proxy): rimosso reference a model out-of-scope in validateStreamAccumulated ([e8245b4](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e8245b49408c99072261827c3ac0c314aedf7fed))
- fix(proxy): non richiede tool_calls per richieste di summarization ([3ed30a8](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/3ed30a873f481cd1915577afce5aaaf5a7246734))
- fix(proxy): rimuove tools dal body per summarization (no più tool_calls su condense) ([2b49375](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2b49375c721f51d97d169bb815a2078b7d96d17c))

### Security
- fix(bandit): stima token ÷4 (JSON) per supportare contesti 100k+ ([c5c920e](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/c5c920e9c72840263ef857afa27d5094f08a161b))
- fix(bandit): esclude FIM models dal pool tool-capable (diff imprecisi) ([8ff155e](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/8ff155eb730eb5924fd20f78df3a34d315eb2846))

## [0.3.0] - 2026-10-02

### Added
- feat(dashboard): contatori needs_attention, colore viola, tasso di successo ([b54a03e](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/b54a03ec9786a1f52a717a198e433f2a06df2832))
- feat(bandit): max_input_tokens in catalog, filtro token, x-force-model, auto-compress ([3743f89](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/3743f89a73152ea5d599660f1980fb09affd1b79))
- feat(bandit): degraded mode - modelli con 5xx mantengono priorita ridotta (score*0.3) e si riabilitano al primo successo ([7fb2424](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/7fb24248b2af4778f0a0655cd47de12dfb392e1c))
- feat(bandit): degraded mode (score*0.3), auto-riabilitazione, catalogRawCount in metrics ([19fa45e](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/19fa45e0a6e0681f1c2529769c3bfda1c20475be))
- feat(dashboard): pulsante Cosa fare sui provider needs_attention con istruzioni contestuali ([511d2f7](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/511d2f7fcd8907643b825da28655b027b34b68bf))
- feat(dashboard): modale Cosa fare con pulsante copia (rimuove alert non copiabile) ([4272c75](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/4272c75b8fa8fcc09b20bfec79fed967e9fe39e1))
- feat(notifier): webhook Slack/Discord su eventi critici ([74be9a3](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/74be9a34becabf936b6eaabbd25d058dcc9c0afb))
- feat(notifier): supporto Telegram con chat_id configurabile ([20240e7](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/20240e713a5d8c6ed936e70a3dc66e3865f80405))
- feat(bandit): free/paid detection, filtri ONLY_FREE/EXCLUDE_PAID, is_paid su 402, catalogRawCount ([67dc62d](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/67dc62d32f997a5f2521f0fcd9cd87cb00592f48))
- feat(bandit): free/paid detection, filtri ONLY_FREE/EXCLUDE_PAID, 403 model-level non banna provider, catalogRawCount ([d5ff1cf](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d5ff1cf13aa68d4fb062f996910950c482008104))
- feat(training): timeout non skippa provider, soglia 5 fail, esclude pattern openrouter problematici ([805fb10](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/805fb104a9fa71ab6d378c0a8e54eaaf24fe4c64))
- feat(dashboard): pulsante reset contatori globali (richieste + osservazioni) ([d8d2c57](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d8d2c57a8cce0726ec6875baa15b33b01869932f))
- feat(pwa): display_override per nascondere barra del titolo (window-controls-overlay) ([cf41df9](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/cf41df9f9bd3bef3d764cdd8cb300895e0fd5a91))
- feat(metrics): summary aggregato (attivi, reward, latenza, free, topModel); fix cooldown provider spurio ([893406c](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/893406ca6459b44ac8502871924af35e19dccf22))
- feat(bandit): EXPLOIT_ONLY (solo modelli N>=3) per uso produttivo <2s ([93768cb](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/93768cbacb88ede02c78596a14590924fc23c865))
- feat(scripts): switch-mode.sh per alternare prod/train con un comando ([e66c682](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e66c6829bf998ec0230a7a8c5a90ce640f03a30d))
- feat(bandit): EXCLUDE_THINKING + EXPLOIT_ONLY + switch-mode.sh per prod/train ([46ce17c](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/46ce17c5848d7e05e96933fbda100dda8222ba20))
- feat(scripts): modalità train-gentle per training in parallelo all'uso reale ([de2f4d1](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/de2f4d15e83d6515fff92b3b7a2349a1b8f4d8f3))
- feat(dashboard): pannello richieste in-flight (modello, tentativo, tempo) ([b33725d](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/b33725d6f88509037f4cf270591aeafc420a36bf))
- feat(dashboard): pannello attività sempre visibile (attive + ultime richieste) ([bef3763](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/bef3763f0e983082c15f326c347b1629e26de69d))
- feat(dashboard): modelli raggruppati per provider con collapse/expand ([c946353](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/c94635344526bd26f6c09152ac479c401c8aeba1))
- feat(dashboard): modelli raggruppati per provider con collapse/expand ([d6775b6](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d6775b6452d69c64d082f1c4dda799a202b33838))
- feat(dashboard): modali custom in stile dark (no più alert/confirm nativi) ([e58508e](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e58508ec8fdc8647bed45ee4ed1f1e9d6baba153))
- feat(dashboard): pulsante Blocca modello (permanent=1), cambia in Sblocca se già bannato ([a299711](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/a2997117331bb6f43ccf4ce5f5a06331871f3f64))
- feat(proxy): requireTools penalizza modelli che non chiamano tools ([2473d46](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2473d46223765e625bca1782f2840b1debfa0472))

### Changed
- chore(training): aggiunge demone round-robin con start/stop/status/logs ([b23397a](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/b23397a9b9c8d4136016dcee5cff9c747aea7360))
- chore(env): documenta variabili HEALTH_CHECK_* ([adc9f9d](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/adc9f9d6e6365cd481f5a6e16c666fa6b5ba0780))
- chore(gitignore): ignora file temporanei SQLite ([1252c85](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/1252c85d1aaadd3603c259a81bf09097fc1f7c8d))
- chore: forza LF, fix auto-registrazione modelli forzati, script eseguibili ([6c4a774](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/6c4a774f599c997f0205827bcce8a11cc4d7afcc))
- ui(dashboard): badge DA CONFIGURARE cliccabile apre Cosa fare (rimuove pulsante ridondante) ([e93af91](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e93af911220fee84243a327caf35f48f8e77621a))
- chore(gitignore): ignora file di backup ([418cc7d](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/418cc7d983254d7ff9f884d6ebb27422ee160907))

### Fixed
- fix(training): hard-fail su x-force-model non disponibile, skip :batch/tts/lyria nel daemon ([072eb67](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/072eb678da1d1d06d0813fc6e0b37ff341a7ec21))
- fix(dashboard): messaggio più chiaro quando attention_message è vuoto ([1957be8](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/1957be89ab37357f17437482c3ac569bdef8a33b))
- fix(training): daemon salta tutti i modelli di un provider dopo primo 404 ([cf39115](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/cf39115ab19aec823b9686a86729b040b2ae2a16))
- fix(pwa): theme-color coerente + fix training (timeout no-skip-provider, exclude pattern) ([4f08771](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/4f0877111d9524b6e993144aded178f392717760))
- fix(dashboard): success rate invece di avg tentativi; top model mostra avg ([e0c98a8](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e0c98a853b743526381a6e52464d5b86f9960642))
- fix(proxy): rimuove else duplicato e righe irraggiungibili dopo continue ([e4c8f14](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e4c8f14c95092fa2021913f219db965f6cd08fe2))
- fix(dashboard): script completo pulito con renderAll unificata ([93c5c76](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/93c5c76dc6fca76b107d01c7b506188e21814e2e))
- fix(proxy): riconosce 'run out of usage' come errore (non premia la risposta) ([419d9cb](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/419d9cb308874f9f4e34c69f24a9de0aeee51c3a))

### Security
- fix(bandit): isModelAvailable accetta un solo parametro SQL ([c806b4f](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/c806b4f80ac6aa7938360f61553c454535a39d2f))
- fix(bandit): ban permanente modello dopo 3 errori transitori consecutivi (soglia 5xx) ([6578c91](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/6578c91e83e75adf4eecabdf8814274774600cef))
- fix(bandit): recordFeedback auto-registra modelli non presenti (fix training daemon via x-force-model) ([c0b6af9](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/c0b6af9d70befc1ab0afa2f22ff3aa3e3a0b43cf))
- fix(bandit): provider granulare per ID senza slash (evita che un modello rotto banni l'intero gruppo default) ([0d35024](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/0d35024cf5c7ba63945a1d4fecc1ff2b231b1887))
- fix(bandit): isModelAvailable filtra anche cooldown modello e provider ([a533ad5](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/a533ad5c2449b990caabaaa37c3ce13e10fb28c7))
- fix(bandit): _flagProviderAttention ora imposta correttamente il flag (era invertito) ([60ad507](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/60ad507c8874bdf864d0edbeb4b8bdd1aaac200f))
- fix(bandit): validation error → ban-model invece di rate-limit ([e4ded40](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e4ded40169fbb46f318522c4a35c46b97cc38bff))
- fix: 403 model-level non banna più l'intero provider; il daemon salta i modelli in timeout nel ciclo corrente ([192f86a](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/192f86acdb8b1283c52bfe9dcf1a760bf9a4c27b))
- fix(training): rimuove filtro cooldown da loadModels (il proxy lo gestisce); EXCLUDE_PROVIDERS e circuit-breaker 404 ([e2cff7c](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e2cff7c1e83375dc495803e7aadd69af2199b7fb))
- fix(bandit): Key limit exceeded → flag-provider (non banna ogni modello) ([08f7fc4](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/08f7fc4ea7c2299442c9dbf636d6763d83424eae))
- fix(bandit): key-quota-exceeded → cooldown solo paid, free restano attivi ([77a5eab](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/77a5eab789be57ee79b1193b74dd44de213d1ee7))
- fix(dashboard): avg tentativi invece di successo %; fix(bandit): vLLM tool_choice → ban-model ([2c2e4fe](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2c2e4fe1148b815243f016780892d878fa62ed12))
- fix(bandit): rimuove graffa di troppo in _classifyError; riconosce prompt-too-long ([5dc8b72](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/5dc8b72ea1455a004633e8bcfa1560d404628e1f))
- fix(bandit): ripristina hasCatalogIsFree + supports_tools popolato dal payload ([ad2f5b4](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/ad2f5b42b03f131788725e42f7509583b7177379))
- fix(bandit): distingue demo-limit da input-too-long (cfp flag-provider) ([e174ca3](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e174ca397ab977dd80624d7510600517c45cfd44))

## [0.2.0] - 2026-10-01

### Added
- feat(security): auth token su API di controllo e dashboard ([9dc003f](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/9dc003f0b70023d2bded637a9828a220dea8b145))
- feat(bandit): catalog chat-only, lazy registration, provider cooldown su quota o fail ripetuti; fix abort spurio ([1628691](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/16286911fd005a8b585154628f4ffa5152f023c3))
- feat(bandit): cooldown proporzionati (24h misconfig, 6h anti-abuse), riconosce bug upstream e reset_seconds, safety provider 30m ([234287e](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/234287e7cacf84c8cc2e5fc42bf77606350de96e))
- feat(dashboard): auto-refresh 2.5s, layout full-height senza scroll, rimozione colonna cooldown ridondante ([a3c515e](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/a3c515e03a5332ed9ccb906bc94a76b48a2acc47))
- feat(dashboard): colore distinto (viola) per needs_attention vs cooldown (giallo) ([161e526](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/161e526ce30ffcf12b3353f8c048d388bfa43372))
- feat(dashboard): indicatore tasso di successo accanto a Osservazioni ([d9247e6](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d9247e6f32b6acbebe87bae41ad7ca6d1699559f))

### Changed
- Migrazione a ES modules (.mjs), nuova dashboard e icon set PWA ([b9486e7](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/b9486e7464900ca9859de6d1987be352233bc364))
- chore(icons): sostituisce icon set con RealFaviconGenerator, aggiorna link e manifest ([cb04ab2](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/cb04ab2fdb9950b55f4ad90f90329d4fb68bee2d))
- chore(log): rimuove middleware access-log duplicato ([766edd0](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/766edd012c89c8ac25e6a523dd2756706b3cb8af))
- docs: riscrive README allineata al codice attuale, aggiunge licenza MIT ([e9377fd](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/e9377fd863abbd94438e0b3414c5e786871ff2bd))
- test: aggiunge suite di unit test per bandit.mjs (classifyError, selectModel, recordFeedback, meta) ([0ecc260](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/0ecc26028d2e3fdbb206e27a27bfc0df62f3bd1b))

### Fixed
- fix(dashboard): aggiunge pulsante Aggiorna Dati mancante ([d1bac3c](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/d1bac3cf9f9513347ed9d4441bcc857f46e222e3))

### Security
- fix(dashboard): no-cache HTML, rimozione onclick inline residui, fetchLogs robusto a 401 ([00d7604](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/00d7604411c9bf3178cce93b32843a8b787e950d))
- fix(dashboard): script completo, valori numerici normalizzati, banner 401 non distruttivo ([8d8c4f6](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/8d8c4f67bd542e5c79db6380b6db883970d2bca4))
- fix(bandit): 5xx su modello non uccide più l'intero provider; aggiunto pattern 402 payment ([6ed0971](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/6ed09712c08ed6218caadc1bfd8a54b41004dd4d))

## [0.1.0] - 2026-09-30

### Added
- feat: integrate DiscountedUCB1Bandit engine with Zoo Code compatible Zod metadata and Express proxy ([331fa08](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/331fa08164c2f424ca113a95a27197483428994c))
- feat(telemetry): add granular real-time logging for UCB1 evaluation, scores, rewards, and feedback metrics ([9d76562](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/9d765621d28defeeb6c08180765332415457a457))
- feat: aggiunta sincronizzazione dinamica dei modelli da OmniRoute via /v1/models e ottimizzazione selezione bandit ([f795b66](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/f795b669343c28a0684f8e697d5edada0d7fa53e))
- feat: trasforma la dashboard in PWA con service worker, manifest e pulsante di installazione ([611f879](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/611f879e340c6003b8e8c0caa55e62f1c0f46841))

### Changed
- chore: ensure .env and proxy.log are excluded from git ([2c6f3df](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/2c6f3dfe971ca7740ec72f87192dbafb48189698))
- chore: ignore sqlite wal and shm files ([73eae23](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/73eae23c8c06ae1a297dfe81bad8a22c2fc0db96))
- Add live proxy logs and precise cooldown countdown to the dashboard ([a090a6e](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/a090a6e839f6db31a20ff36842b51e1dce1be1a8))
- Add provider-level health tracking, exponential cooldown, and n+1 rotation pointer with updated dashboard UI ([83d200f](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/83d200fc7edbbec1f59baf3651325fc6399fe115))

### Security
- Fix dashboard binding on 127.0.0.1 and stabilize Bandit proxy error handling ([a9250ec](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/a9250ec67a7933427fd8ce6cd30201c12dc7ba52))
- fix(proxy): add AbortController timeout, client disconnect handler (499), and immediate bandit fallback ([00f9289](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/commit/00f928923648bdcac0bc3873d2748e69a30e255c))


