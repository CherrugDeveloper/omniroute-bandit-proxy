## [v1.14.2] - 2026-11-03

### Fix
- **Bandit**: Improved error classification for stream/keepalive/connection errors in `_classifyError()`
  - Extended 5xx handling to include stream/chunk/keepalive/connection related errors (via message matching)
  - Reduced cooldown from 30s to 15s for transient stream/server errors
  - All changes in [src/bandit.mjs](src/bandit.mjs:1315-1324)

- **Bandit**: Added `bypassCooldown` parameter to `isModelAvailable()` for fallback chain reliability
  - Fallback chain now bypasses cooldown checks while respecting permanent bans and degraded models
  - Emergency relaxation preserves `ignorePermanent: false` and `ignoreDegraded: false` to avoid routing to broken models
  - Absolute last resort no longer filters by cooldown since emergency mode already attempted
  - All changes in [src/bandit.mjs](src/bandit.mjs:2050-2110) and [src/index.mjs](src/index.mjs:1860-2095)

### Chore
- **Repository Maintenance**: Executed cleanup of temporary artifacts and untracked files identified in the repository root.
- **Workflow Automation**: Ran `auto-git` workflow, validating workspace integrity via `npm run check`.
- **Documentation & Versioning**: Performed date-based semantic version increment to `v1.14.2` (patch) based on `2026-11-03` date. Updated `CHANGELOG.md` to ensure structural consistency and chronological ordering.

## [v1.14.1] - 2026-11-03

### Feat
- **Dashboard**: Added dynamic calculation for non-active providers and non-operational models
  - Displays "Provider non attivi" and "Modelli non operativi" with real-time counts
  - Replaces hard-coded placeholders with dynamic UI updates in `public/dashboard.html`
- **Dashboard**: Enhanced UI with CSS badges for status numbers
  - Colorized "Monitorati" and "Catalogo" provider stats using `.badge-monitorati` and `.badge-catalog` classes
  - Updated `public/dashboard.html` to improve visual consistency

### Chore
- **Repository Maintenance**: Executed cleanup of temporary artifacts and untracked files identified in the repository root.
- **Workflow Automation**: Ran `auto-git` workflow, validating workspace integrity via `npm run check`.
- **Documentation & Versioning**: Performed date-based semantic version increment to `v1.14.1` based on `2026-11-03` date. Updated `CHANGELOG.md` to ensure structural consistency and chronological ordering.

## [v1.14.0] - 2026-11-03

### Fix
- **Bandit**: Changed 402 billing errors from `cooldown-provider` (1h) to `flag-provider` with `quota-exhausted` reason
  - Prevents exhausted-credential providers from re-entering the rotation after short cooldowns
  - `flag-provider` sets `needs_attention=1` in provider_history, removing provider from consideration in `isModelAvailable()`
  - Requires manual clearance via `POST /v1/provider/retry/:provider` or `clearProviderAttention()`
  - All changes in [src/bandit.mjs](src/bandit.mjs:1324-1328)

- **Bandit**: Fixed log streaming filters for `source=train` in `getModels()`
  - The `models_train` table lacks `cooldown_until`, `permanent`, `degraded` columns
  - Status filter conditions (active, cooldown, degraded, banned) were incorrectly applied to training source
  - Added `source !== "train"` guard around status filter switch statement
  - All changes in [src/bandit.mjs](src/bandit.mjs:2751-2770)

### Chore
- **Repository Maintenance**: Executed cleanup of temporary artifacts and untracked files identified in the repository root.
- **Workflow Automation**: Ran `auto-git` workflow, validating workspace integrity via `npm run check`.
- **Documentation & Versioning**: Performed date-based semantic version increment to `v1.14.0` (patch/minor reset) based on `2026-11-03` date. Updated `CHANGELOG.md` to ensure structural consistency and chronological ordering.

## [v1.13.13] - 2026-11-02

### Fix
- **Bandit**: Re-evaluated error classification and punishment system for better reliability
  - Reduced 402 billing error cooldown from 24h to 1h in `_classifyError()` to allow faster credit recovery
  - Reduced 403 non-resetting quota cooldown from 24h to 2h for transient key limits
  - Reduced 418 anti-abuse cooldown from 6h to 1h to prevent prolonged provider outages
  - Changed 502 misconfiguration/environment errors from `ban-provider` to `cooldown-provider` (30m) enabling auto-recovery
  - All changes in [src/bandit.mjs](src/bandit.mjs:1111-1343)

### Perf
- **ProviderQuota**: Added 5-second TTL in-memory caching to `canCall()` eliminating redundant DB queries
  - Cache key includes provider+group for per-group quota isolation
  - New `_quotaCache` Map with 5s TTL in [src/provider-quota.mjs](src/provider-quota.mjs:1)

- **Bandit**: Optimized `isModelAvailable()` to use single LEFT JOIN query instead of two separate queries
  - Fetches both model and catalog data in one DB round-trip in [src/bandit.mjs](src/bandit.mjs:2052-2125)

## [v1.13.12] - 2026-11-02

### Fix
- **Dashboard**: Updated log row color mapping for source types
  - Renamed `source-train` to `source-training` in CSS
  - Changed debug color from `#ff5858` to `#00bcd4`
  - Changed cooldown color from `#f1c40f` to `#ff9800`
  - Changed flag color from `#e6ac00` to `#ffeb3b`
  - Changed degraded color from `#e74c3c` to `#9c27b0`
  - Changed proxy color from `#f0883e` to `#ffffff`
