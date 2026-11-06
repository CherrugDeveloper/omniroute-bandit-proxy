# Plan: Fix Startup Fetch Timeout and Non-Blocking Catalog Sync

## Problem Statement
During server startup (`startServer()` in `src/index.mjs`), the application calls `bandit.fetchAndSyncModels()`, which performs a network `fetch()` request to `router.omniroute.ai/v1/models` without a timeout or fallback. If network connectivity is unavailable, slow, or the upstream router is unreachable, `fetchAndSyncModels()` blocks indefinitely or hangs, preventing `app.listen()` from executing. As a result, the service fails to bind port 8080 within the 60-second window expected by `./scripts/restart-safe.sh`.

## Proposed Solution

1. **Add Timeout to `fetchAndSyncModels()`**:
   - Use `AbortController` with a configurable timeout (e.g. 5000ms) for the catalog sync fetch request.
   - Catch network errors or timeouts gracefully, log a warning, and fall back to existing database cache (`catalog` table) so the proxy can start immediately even without internet connectivity.

2. **Non-Blocking or Timeout-Protected Catalog Sync in Startup**:
   - Ensure `startServer()` does not block startup indefinitely if remote catalog sync fails.
   - Allow fallback to local cached models in SQLite.

## Actionable Steps

1. Update `src/bandit.mjs` to add an `AbortSignal.timeout(5000)` (or `AbortController` timeout) to `fetchAndSyncModels()`, catching fetch failures gracefully without crashing or hanging startup.
2. Verify startup behavior with offline/unreachable upstream simulation.
3. Test proxy startup and port 8080 binding.
