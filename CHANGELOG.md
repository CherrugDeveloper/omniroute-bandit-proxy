## [v1.15.0] - 2026-11-04

### Feat
- **Bandit**: Implemented exponential backoff cooldowns for consecutive failures
  - Cooldown progression: 15s → 5m → 30m → 2h → permanent ban after 5+ failures
  - Added `total_failures` tracking per model with cap at 50
  - Emergency relaxation now respects cooldown bans (only bypasses for last resort)
  - Consecutive 5xx counter resets on successful request
- **Bandit**: Added safeWrite initialization error pattern to config/bandit.json
  - Matches "safeWrite|cannot access safeWrite|safeWrite before initialization|safeWrite is not initialized" → ban-model scope

### Fix
- **Dashboard**: Adjusted Unified Chronology table dimensions and column widths
  - Table height: 110px → 114px with line-height: 1.2 for better readability
  - Column widths: Error Type 8%→12%, Countermeasure 8%→14%, Reason 40%→30%
  - Provider prefix stripped from model names in selection history for cleaner display

### Chore
- **Repository Maintenance**: Executed cleanup of temporary artifacts and untracked files
- **Workflow Automation**: Ran `auto-git` workflow, validating workspace integrity via `npm run check`
- **Documentation & Versioning**: Performed date-based semantic version increment to `v1.15.0` (minor) based on `2026-11-04` date

## [v1.14.10] - 2026-11-03

### Feat
- **Dashboard**: Enhanced Unified Chronology panel with per-model selection history
  - Each model considered during bandit selection now occupies its own row with timestamp, provider, model, status, error type, countermeasure, and reason
  - Increased table height from 84px to 280px with scrollbar to remove empty space below
  - Added "Mostra cronologia selezione" checkbox to toggle selection history display
  - Real-time active model info shows duration (e.g., "🟢 ATTIVO 12.3s") with green background
  - Historical rows show discarded models with rejection reasons (tier_min_score, health, max_retries, etc.) with red background
  - Visual indicators: ✅ for selected, ❌ for rejected models
- **Dashboard**: Updated copy button to include Error Type and Countermeasure columns
- **Dashboard**: Added dynamic calculation for non-active providers and non-operational models
  - Displays "Provider non attivi" and "Modelli non operativi" con conteggi in tempo reale
  - Sostituisce placeholder hardcoded con aggiornamenti UI dinamici in `public/dashboard.html`
- **Dashboard**: Enhanced UI with CSS badges for status numbers
  - Colorati "Monitorati" e "Catalog" provider stats using `.badge-monitorati` e `.badge-catalog` classes
  - Aggiornato `public/dashboard.html` per migliorare la coerenza visiva

### Fix
- **Bandit**: Improved error classification for stream/keepalive/connection errors in `_classifyError()`
  - Extended 5xx handling to include stream/chunk/keepalive/connection related errors (via message matching)
  - Reduced cooldown from 30s to 15s for transient stream/server errors
  - All changes in [src/bandit.mjs](src/bandit.mjs:1315-1324)
- **Bandit**: Added `bypassCooldown` parameter to `isModelAvailable()` for fallback chain reliability
  - Fallback chain now bypasses cooldown checks while respecting permanent bans and degraded models
  - Emergency relaxation preserves `ignorePermanent: false` and `ignoreDegraded: false` to avoid routing to broken models
  - Absolute last resort no longer filters by cooldown since emergency mode already attempted
  - All changes in [src/bandit.mjs](src/bandit.mjs:2050-2110) e [src/index.mjs](src/index.mjs:1860-2095)
- **Bandit**: Emergency relaxation and fallback chain improvements
  - Added `bypassCooldown` parameter to `isModelAvailable()` for fallback chain reliability
  - Emergency relaxation preserves `ignorePermanent: false` and `ignoreDegraded: false` to avoid routing to broken models
  - Absolute last resort no longer filters by cooldown since emergency mode already attempted
- **Bandit**: Implemented exponential backoff for 5xx/SSE errors
  - Cooldown formula: `min(15s * 2^fails, 5m)` in [src/bandit.mjs](src/bandit.mjs:1364)
- **Bandit**: Added null guard for error classification to prevent crashes
  - Validates `_classifyError()` output in [src/bandit.mjs](src/bandit.mjs:996)
- **Bandit**: Relaxed emergency mode to improve service continuity
  - Enabled selection of degraded models via `ignoreDegraded: true` in [src/bandit.mjs](src/bandit.mjs:2601)
- **Bandit**: Enabled provider-level quota checking in emergency mode
  - Set `ignoreQuota: false` in emergency `selectModel()` tier in [src/bandit.mjs](src/bandit.mjs:2601)

### Chore
- **Repository Maintenance**: Executed cleanup of temporary artifacts and untracked files identified in the repository root (multiple runs consolidated)
- **Workflow Automation**: Ran `auto-git` workflow, validating workspace integrity via `npm run check` (multiple runs consolidated)
- **Documentation & Versioning**: Consolidated duplicate patch versions (v1.14.1 through v1.14.10) into single entry for 2026-11-03
