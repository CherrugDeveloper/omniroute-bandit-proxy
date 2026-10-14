# Logging and Metrics Fix Documentation

This document details the architecture, implementation changes, test plan, and monitoring improvement suggestions for logging enhancements and metrics calculation fixes in the [`omniroute-bandit-proxy`](package.json:1) project.

---

## 1. Documentation of Changes

Recent updates to [`src/index.mjs`](src/index.mjs:1) and [`src/bandit.mjs`](src/bandit.mjs:1) address robust request logging and accurate metrics computation using SQLite database records as the single source of truth.

### A. Logging Enhancements (`src/index.mjs` & `src/bandit.mjs`)
- **Mandatory Fields**: All structured log entries and database transaction records now consistently capture and preserve:
  - [`timestamp`](src/notifier.mjs:89): High-precision UTC ISO timestamp or elapsed time when the event or request occurred.
  - [`request_id`](src/index.mjs:275): Unique correlation identifier assigned to each incoming request through the proxy middleware [`app.use()`](src/index.mjs:275) to trace flows across retries, bandit selection, and upstream forwarding.
  - [`status_code`](src/bandit.mjs:101): HTTP status code returned by the upstream provider or generated locally (e.g. `200`, `429`, `500`, `413`).
  - [`error_message`](src/bandit.mjs:101): Captured exception strings or validation error details when requests fail or trigger error classification [`_classifyError()`](src/bandit.mjs:100).
- **Buffer & Ring Storage**: [`pushLog()`](src/index.mjs:570) and [`logBuffer`](src/index.mjs:570) capture and deduplicate log entries, making them available via [`/v1/logs`](src/index.mjs:694) and the web dashboard [`public/dashboard.html`](public/dashboard.html:1).

### B. Metrics Calculation & Source of Truth (`src/bandit.mjs`)
- **[`request_logs`](src/bandit.mjs:101) Table as Source of Truth**: 
  - The SQLite table [`request_logs`](src/bandit.mjs:101) records request lifecycles with [`started_at`](src/bandit.mjs:103), [`ended_at`](src/bandit.mjs:104), status, latency, tokens, and error types.
  - [`getDashboardStats()`](src/bandit.mjs:1032) queries [`request_logs`](src/bandit.mjs:101) directly to compute throughput, average latency [`avgLatency`](src/bandit.mjs:1047), error rates, and model success distributions.
- **Robust Aggregations**:
  - [`getMetrics()`](src/bandit.mjs:1020) and [`getDashboardStats()`](src/bandit.mjs:1032) handle missing table columns gracefully through additive migrations [`_migrateDB()`](src/bandit.mjs:100) and fallback defaults.

---

## 2. Test Plan

To validate proper log collection and metric precision, execute the following test plan:

### Test Case 1: Log Entry Field Completeness
1. **Action**: Send a test chat completion request to [`POST /v1/chat/completions`](src/index.mjs:800) with valid payload and another request triggering an expected error (e.g., invalid token or upstream timeout).
2. **Verification**:
   - Query [`GET /v1/logs`](src/index.mjs:694) or inspect console output.
   - Confirm every request log entry contains non-empty values for [`timestamp`](src/notifier.mjs:89), [`request_id`](src/index.mjs:275), [`status_code`](src/bandit.mjs:101), and [`error_message`](src/bandit.mjs:101) (when errors occur).

### Test Case 2: Dashboard Metrics Precision against [`request_logs`](src/bandit.mjs:101)
1. **Action**: Send a known batch of $N$ requests (e.g., 50 successful requests and 10 rate-limited requests) through the proxy [`src/index.mjs`](src/index.mjs:1).
2. **Verification**:
   - Query the internal stats endpoint or [`GET /v1/metrics`](src/index.mjs:694).
   - Query the SQLite database directly: `SELECT COUNT(*), AVG(ended_at - started_at), SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) FROM request_logs;`.
   - Compare dashboard aggregation results with direct SQL query results to verify $100\%$ precision matching for throughput, latency, and error rates.

---

## 3. Monitoring Improvement Suggestions

To further strengthen observability and operational resilience, implement the following actionable improvements:

1. **Automated Alerting Thresholds**:
   - Set up webhook or notifier integrations [`src/notifier.mjs`](src/notifier.mjs:1) to trigger alerts when error rates in [`request_logs`](src/bandit.mjs:101) exceed $5\%$ over a rolling 5-minute window or when provider cooldowns spike.
2. **Advanced Dashboard Visualizations**:
   - Enhance [`public/dashboard.html`](public/dashboard.html:1) with time-series charts showing latency percentiles ($p_{50}$, $p_{90}$, $p_{99}$) derived from [`request_logs`](src/bandit.mjs:101).
3. **Structured Log Export**:
   - Implement JSON-formatted file rotation for [`request_logs`](src/bandit.mjs:101) to support external log shippers (e.g., Fluentd, Promtail, Datadog agent).
4. **Health Check Proactive Tracing**:
   - Correlate health check probe results from [`src/health-check.mjs`](src/health-check.mjs:1) with [`request_logs`](src/bandit.mjs:101) metrics to automatically flag degraded providers before cascading failures occur.
