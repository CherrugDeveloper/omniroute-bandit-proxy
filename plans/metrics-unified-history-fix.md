# Fix Plan: Metrics and Unified History Issues

## Problem Analysis

### Issue 1: Attempt Counter Key Mismatch (Critical Bug)

**Location:** `src/request-tracker.mjs` lines 4 and 18

**Root Cause:** The `||` operator treats `0` as falsy, causing `attempt: 0` to become `1`.

```javascript
// CURRENT (BROKEN):
const attempt = meta.attempt || 1;  // 0 becomes 1!
```

**Flow:**
1. `trackRequestStart(requestId, { attempt: 0, ... })` at `src/index.mjs:1608` creates key `${id}-att1`
2. Retry loop at `src/index.mjs:1922` uses `let attempt = 0;` and `while (++attempt <= maxAttempts)`
3. First iteration: `attempt = 1`
4. `trackRequestUpdate(requestId, { model, attempt, ... })` at `src/index.mjs:2140` looks for key `${id}-att1`
5. BUT if there was no update yet, it creates a NEW entry instead of updating

**Fix:** Use nullish coalescing (`??`) instead of `||`:

```javascript
// FIXED:
const attempt = meta.attempt ?? 1;  // 0 stays 0, null/undefined become 1
```

### Issue 2: Broad Pattern Matching in `trackRequestEnd` and `getRequest`

**Location:** `src/request-tracker.mjs` lines 45 and 62

**Root Cause:** The pattern `k.startsWith(\`${id}-\`)` is too broad and could match unintended keys.

**Fix:** Make patterns more specific by including `att`:
- Line 45: `k.startsWith(\`${id}-att\`)`
- Line 62: Already correct with `k.startsWith(\`${id}-att\`)`

### Issue 3: Duplicate Entry Risk in `trackRequestUpdate`

**Location:** `src/request-tracker.mjs` lines 17-41

**Root Cause:** When `activeRequests.get(key)` returns undefined, the code falls back to searching for any key starting with `${id}-att`. This can create duplicate entries.

**Fix:** Ensure the key is constructed correctly before checking.

## Implementation Steps

- [ ] Fix `trackRequestStart` to use `??` instead of `||` for attempt
- [ ] Fix `trackRequestUpdate` to use `??` instead of `||` for attempt  
- [ ] Fix `trackRequestEnd` pattern matching to be more specific
- [ ] Review `getRequest` pattern matching
- [ ] Run tests to verify fixes

## Files to Modify

1. `src/request-tracker.mjs` - Core fix location
2. `__tests__/request-tracker.test.js` - May need additional tests for edge cases