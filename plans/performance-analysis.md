# Performance Analysis & Optimization Report: OmniRoute Bandit Proxy

This report presents a thorough static code analysis of the `omniroute-bandit-proxy` codebase, identifying performance bottlenecks, architectural risks, and actionable recommendations.

## 1. Critical Performance Bottlenecks

### A. Schema Introspection on Every Quota Check (`src/provider-quota.mjs`)
- **Location**: [`src/provider-quota.mjs:40`](src/provider-quota.mjs:40) and [`src/provider-quota.mjs:93`](src/provider-quota.mjs:93)
- **Issue**: `this.db.pragma("table_info(provider_history)")` is invoked inside `_rollWindows()` and `canCall()` on **every single API request and quota evaluation**. Table schema introspection queries SQLite internal metadata tables (`sqlite_master`) every time, causing severe database contention, CPU overhead, and blocking latency under high concurrency.
- **Recommendation**: Cache the table column existence check once in the `ProviderQuota` constructor (or lazily initialize a boolean flag `this._hasGroupCols`) rather than querying `pragma` per request.

### B. SQLite Statement Compilation & Execution Contention
- **Location**: Across [`src/bandit.mjs`](src/bandit.mjs) and [`src/provider-quota.mjs`](src/provider-quota.mjs)
- **Issue**: Many methods call `this.db.prepare(...)` inline on every execution. While `better-sqlite3` caches prepared statements internally by SQL string hash, caching statement objects in class fields or initialization reduces JS-to-C++ binding overhead and query parsing overhead.
- **Recommendation**: Pre-compile all frequently used SQLite statements in constructors and store them as class properties (e.g., `this.stmtUpdateQuota = this.db.prepare(...)`).

### C. JavaScript-Side Model Filtering & Sorting
- **Location**: [`src/bandit.mjs`](src/bandit.mjs) (`selectModel()`)
- **Issue**: Filtering through the entire model catalog, merging database models with catalog models, applying soft bias multipliers, and sorting by UCB1 scores happens frequently. Although buffered by the 30-second `_rankCache`, cache misses during heavy traffic spikes can saturate the event loop with sorting and filtering operations across hundreds of models.
- **Recommendation**: Ensure `_rankCache` keys include all relevant profile and filtering flags, and consider indexing model metadata in memory if model counts scale beyond 1,000.

---

## 2. Memory Sizing, Caching, and TTL Management

### A. Session Map LRU Eviction & Cleanup (`src/index.mjs`)
- **Location**: [`src/index.mjs`](src/index.mjs) (`sessionModelMap`)
- **Issue**: `sessionModelMap` maintains session affinity with a max capacity of 10,000 entries and a 30-minute TTL. While LRU eviction prevents unbounded memory growth, stale sessions that are never accessed again remain in memory until capacity is reached or periodic timer sweeps execute.
- **Recommendation**: Ensure periodic cleanup intervals (e.g., every 5 minutes) actively purge expired entries rather than relying solely on lazy eviction during insertion.

### B. Rank Cache Invalidation Granularity (`src/bandit.mjs`)
- **Location**: [`src/bandit.mjs`](src/bandit.mjs) (`_rankCache`)
- **Issue**: The 30-second rank cache speeds up routing significantly. However, feedback events (success/failure recording) should immediately invalidate or update the rank cache for the affected model/profile rather than waiting up to 30 seconds for stale UCB1 rankings to expire.
- **Recommendation**: Invalidate or update `_rankCache` entries instantly upon `recordFeedback()` or provider status changes.

---

## 3. Concurrency, Async/Await, and Resource Cleanup

### A. Synchronous SQLite Operations in Async Handlers
- **Location**: [`src/index.mjs`](src/index.mjs) and [`src/bandit.mjs`](src/bandit.mjs)
- **Issue**: `better-sqlite3` is synchronous. While this eliminates async mutex locking overhead in single-process Node.js, heavy SQLite queries or transactions will block the event loop if executed during high-throughput proxy streaming.
- **Recommendation**: Keep transactions short, use SQLite WAL mode (`PRAGMA journal_mode = WAL;`), and set an appropriate busy timeout (`PRAGMA busy_timeout = 5000;`).

### B. Stream Timeout and Resource Cleanup (`src/index.mjs`)
- **Location**: [`src/index.mjs`](src/index.mjs) (Upstream fetch and SSE streaming handlers)
- **Issue**: Three-level timeouts (`UPSTREAM_TIMEOUT_MS`, `STREAM_IDLE_MS`, `STREAM_MAX_MS`) are well implemented with AbortControllers. However, ensure that active response streams and upstream connections are explicitly aborted and destroyed in `finally` blocks upon client disconnect or error to prevent socket leaks.
- **Recommendation**: Verify `req.on('close', ...)` handlers clean up all active upstream fetch `AbortController` instances.

---

## Summary of Actionable Next Steps
1. Remove `pragma("table_info(...)")` calls from [`src/provider-quota.mjs`](src/provider-quota.mjs) request path.
2. Pre-compile SQLite prepared statements in constructors.
3. Optimize rank cache invalidation on feedback recording.
4. Ensure robust abort controller cleanup on client disconnects in [`src/index.mjs`](src/index.mjs).
