## [v1.14.10] - 2026-11-03

### Chore
- **Documentation & Versioning**: Performed date-based semantic version increment to `v1.14.10` (patch) based on `2026-11-03` date. Updated `CHANGELOG.md` to ensure structural consistency and chronological ordering.

## [v1.14.9] - 2026-11-03

### Chore
- **Documentation & Versioning**: Performed date-based semantic version increment to `v1.14.9` (patch) based on `2026-11-03` date. Updated `CHANGELOG.md` to ensure structural consistency and chronological ordering.

## [v1.14.8] - 2026-11-03

### Chore
- **Documentation & Versioning**: Performed date-based semantic version increment to `v1.14.8` (patch) based on `2026-11-03` date. Updated `CHANGELOG.md` to ensure structural consistency and chronological ordering.

## [v1.14.7] - 2026-11-03

### Chore
- **Repository Maintenance**: Executed cleanup of temporary artifacts and untracked files identified in the repository root.
- **Workflow Automation**: Ran `auto-git` workflow, validating workspace integrity via `npm run check`.
- **Documentation & Versioning**: Performed date-based semantic version increment to `v1.14.7` (patch) based on `2026-11-03` date. Updated `CHANGELOG.md` to ensure structural consistency and chronological ordering.

## [v1.14.6] - 2026-11-03

### Feat
- **Dashboard**: Enhanced Unified Chronology panel with per-model selection history
  - Each model considered during bandit selection now occupies its own row with timestamp, provider, model, status, error type, countermeasure, and reason
  - Increased table height from 84px to 280px with scrollbar to remove empty space below
  - Added "Mostra cronologia selezione" checkbox to toggle selection history display
  - Real-time active model info shows duration (e.g., "🟢 ATTIVO 12.3s") with green background
  - Historical rows show discarded models with rejection reasons (tier_min_score, health, max_retries, etc.) with red background
  - Visual indicators: ✅ for selected, ❌ for rejected models
- **Dashboard**: Updated copy button to include Error Type and Countermeasure columns

### Chore
- **Repository Maintenance**: Executed cleanup of temporary artifacts and untracked files identified in the repository root.
- **Workflow Automation**: Ran `auto-git` workflow, validating workspace integrity via `npm run check`.
- **Documentation & Versioning**: Performed date-based semantic version increment to `v1.14.6` (patch) based on `2026-11-03` date. Updated `CHANGELOG.md` to ensure structural consistency and chronological ordering.

## [v1.14.5] - 2026-11-03

### Chore
- **Repository Maintenance**: Executed cleanup of temporary artifacts and untracked files identified in the repository root.
- **Workflow Automation**: Ran `auto-git` workflow, validating workspace integrity via `npm run check`.
- **Documentation & Versioning**: Performed date-based semantic version increment to `v1.14.5` (patch) based on `2026-11-03` date. Updated `CHANGELOG.md` to ensure structural consistency and chronological ordering.

## [v1.14.4] - 2026-11-03

### Fix
- **Bandit**: Implemented exponential backoff for 5xx/SSE errors
  - Cooldown formula: `min(15s * 2^fails, 5m)` in [src/bandit.mjs](src/bandit.mjs:1364)
- **Bandit**: Added null guard for error classification to prevent crashes
  - Validates `_classifyError()` output in [src/bandit.mjs](src/bandit.mjs:996)
- **Bandit**: Relaxed emergency mode to improve service continuity
  - Enabled selection of degraded models via `ignoreDegraded: true` in [src/bandit.mjs](src/bandit.mjs:2601)
- **Bandit**: Enabled provider-level quota checking in emergency mode
  - Set `ignoreQuota: false` in emergency `selectModel()` tier in [src/bandit.mjs](src/bandit.mjs:2601)

### Chore
- **Repository Maintenance**: Executed cleanup of temporary artifacts and untracked files identified in the repository root.
- **Workflow Automation**: Ran `auto-git` workflow, validating workspace integrity via `npm run check`.
- **Documentation & Versioning**: Performed date-based semantic version increment to `v1.14.4` (patch) based on `2026-11-03` date. Updated `CHANGELOG.md` to ensure structural consistency and chronological ordering.

## [v1.14.3] - 2026-11-03

### Fix
- **Bandit**: Emergency relaxation and fallback chain improvements
  - Added `bypassCooldown` parameter to `isModelAvailable()` for fallback chain reliability
  - Emergency relaxation preserves `ignorePermanent: false` and `ignoreDegraded: false` to avoid routing to broken models
  - Absolute last resort no longer filters by cooldown since emergency mode already attempted

### Chore
- **Repository Maintenance**: Executed cleanup of temporary artifacts and untracked files identified in the repository root.
- **Workflow Automation**: Ran `auto-git` workflow, validating workspace integrity via `npm run check`.
- **Documentation & Versioning**: Performed date-based semantic version increment to `v1.14.3` (patch) based on `2026-11-03` date. Updated `CHANGELOG.md` to ensure structural consistency and chronological ordering.

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
  - Colorized "Monitorati" and "Catalog" provider stats using `.badge-monitorati` and `.badge-catalog` classes
  - Updated `public/dashboard.html` to improve visual consistency
