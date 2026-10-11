# Reduce [DASHBOARD_STATS_DEBUG] Log Verbosity - Plan

## Problem
The `[DASHBOARD_STATS_DEBUG]` logs are repeating excessively, polluting the dashboard logs. Each poll of `/v1/dashboard/stats` triggers one log line: `isApi=true, isPolling=true, condition=false`.

## Root Cause Analysis

### 1. Log source (server-side)
- **File**: `src/index.mjs`, lines 275-277
- The Express middleware logs `[DASHBOARD_STATS_DEBUG]` on **every request** to `/v1/dashboard/stats`:
```javascript
if (req.path === '/v1/dashboard/stats') {
  console.log(`[DASHBOARD_STATS_DEBUG] isApi=${isApi}, isPolling=${isPolling}, condition=${isApi && !isPolling}`);
}
```

### 2. Request frequency (dashboard-side)
- **File**: `public/dashboard.html`, line 2367
- The dashboard polls `/v1/dashboard/stats` every **250ms**:
```javascript
setInterval(refreshAll, 250);
```
- This generates ~4 `[DASHBOARD_STATS_DEBUG]` logs per second, all identical (`isApi=true, isPolling=true, condition=false`).

### 3. The log is diagnostic-only
- The logged data (`isApi`, `isPolling`, `condition`) is derived from the request path, not actual bandit state
- The meaningful dashboard stats (`totalRequests`, `avgReward`, etc.) are returned in the JSON response, not the log

## Existing Precedent in Codebase

The `/v1/models` endpoint uses a proven throttling pattern (`src/index.mjs:702-726`):
```javascript
const MODELS_LOG_THROTTLE_MS = parseInt(process.env.MODELS_LOG_THROTTLE_MS || "60000", 10);
let modelsLogState = { lastLogAt: 0, suppressed: 0 };
```

## Proposed Solution: Change-Based Logging Throttling

Implement a similar throttling state for `/v1/dashboard/stats` that only logs when the returned stats **actually change**, not on every poll.

### Implementation Plan

1. **Add throttle state after the `modelsLogState` definition** (around line 703)
   - Track the last logged stats snapshot and suppressed request count

2. **Modify the middleware at line 275-277** to:
   - Generate a hash/summary of the stats data when logging
   - Only log if data differs from last log
   - Optionally add a maximum interval fallback (e.g., log at least every 60s)

### Alternative Solutions Considered

| Approach | Pros | Cons |
|----------|------|------|
| **Change-based throttling (RECOMMENDED)** | Keeps diagnostic info; reduces logs to meaningful state changes only | Slightly more complex |
| **Time-based throttle (e.g., every 60s)** | Simple; consistent with `/v1/models` pattern | Less responsive to fast changes |
| **Remove the log entirely** | Maximum verbosity reduction | Loses diagnostic capability |
| **Switch to `console.debug`** | Logs hidden by default | Still generated; may clutter in debug mode |
| **Reduce dashboard polling interval** | Reduces server load | Slower UI updates; requires frontend change |

## Recommended Code Changes

In `src/index.mjs`:

**Line 275-277** (current):
```javascript
if (req.path === '/v1/dashboard/stats') {
  console.log(`[DASHBOARD_STATS_DEBUG] isApi=${isApi}, isPolling=${isPolling}, condition=${isApi && !isPolling}`);
}
```

**Line 275-277** (proposed):
```javascript
if (req.path === '/v1/dashboard/stats') {
  const last = dashboardStatsLogState.lastLogAt || 0;
  if (Date.now() - last >= DASHBOARD_STATS_LOG_INTERVAL_MS) {
    dashboardStatsLogState.lastLogAt = Date.now();
    dashboardStatsLogState.suppressed = 0;
    console.log(`[DASHBOARD_STATS_DEBUG] isApi=${isApi}, isPolling=${isPolling}, condition=${isApi && !isPolling}`);
  } else {
    dashboardStatsLogState.suppressed++;
  }
}
```

**Configuration constant** (add near line 702, after `MODELS_LOG_THROTTLE_MS`):
```javascript
const DASHBOARD_STATS_LOG_INTERVAL_MS = parseInt(process.env.DASHBOARD_STATS_LOG_INTERVAL_MS || "60000", 10);
let dashboardStatsLogState = { lastLogAt: 0, suppressed: 0 };
```

## Benefits

1. **Dramatic verbosity reduction**: From ~4 logs/sec to ~1 log/min under normal conditions
2. **Maintains diagnostics**: Logs still appear when needed for debugging
3. **Configurable**: `DASHBOARD_STATS_LOG_INTERVAL_MS` env var allows tuning
4. **Consistent**: Follows the existing `/v1/models` throttling pattern in the codebase
5. **No frontend change required**: Dashboard polling interval (250ms) remains unchanged

## Validation Steps

After implementation, verify:
1. Server restarts without syntax errors
2. Dashboard continues to update with correct stats
3. `[DASHBOARD_STATS_DEBUG]` logs appear at the configured interval (default 60s)
4. Logs can be enabled more frequently by setting `DASHBOARD_STATS_LOG_INTERVAL_MS`
