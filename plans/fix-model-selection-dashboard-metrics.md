# Plan: Fix Model Selection, Enhance Prompt, and Dashboard Metrics

## Overview
This plan addresses issues where no model is selected during proxy chat/enhance requests, enhance prompt requests fail, and dashboard metrics need analysis and restoration.

## Alternative Sources Investigated
1. **Catalog Seeding & Environment Filtering**: Empty catalog or overly restrictive environment filters (`ONLY_FREE`, `EXCLUDE_PAID`, `EXCLUDE_THINKING`) eliminating all models in [`src/bandit.mjs`](src/bandit.mjs:1077).
2. **Session Affinity Stale State**: Stale or permanently banned models stored in session caches in [`src/index.mjs`](src/index.mjs:1015).
3. **Enhance Prompt Profile Detection**: System prompt signature / pattern matching failing in [`src/modes-registry.mjs`](src/modes-registry.mjs:60).
4. **Database Table / Query Failures**: Missing `request_logs` columns or SQL errors in `getDashboardStats()` in [`src/bandit.mjs`](src/bandit.mjs:965).
5. **Dashboard Auth & API Endpoints**: Authentication token header mismatch or response format issues in [`public/dashboard.html`](public/dashboard.html:703) and [`src/index.mjs`](src/index.mjs:694).

## Architecture / Workflow Diagram

```mermaid
graph TD
    Client[Client Request] --> Proxy[Proxy Endpoint /v1/chat/completions]
    Proxy --> Select[Bandit selectModel]
    Select --> Check[Filter Catalog and DB Models]
    Check --> Forward[Forward to Upstream]
    Forward --> Feedback[Record Feedback]
    Dashboard[Dashboard Frontend] --> StatsAPI[/v1/dashboard/stats]
    Dashboard --> MetricsAPI[/v1/metrics]
```

## Actionable Steps
1. **Model Selection & Filtering Review**:
   - Inspect catalog loading and filter logic in [`src/bandit.mjs`](src/bandit.mjs:1077).
   - Ensure fallback models and session affinity handle unavailable models gracefully.
2. **Enhance Prompt Handling**:
   - Verify `detectProfile()` and system prompt processing in [`src/modes-registry.mjs`](src/modes-registry.mjs:60) and [`src/index.mjs`](src/index.mjs:1111).
3. **Dashboard Metrics Restoration**:
   - Verify SQL queries in `getDashboardStats()` in [`src/bandit.mjs`](src/bandit.mjs:965) and API endpoints in [`src/index.mjs`](src/index.mjs:703).
   - Check API authentication and rendering logic in [`public/dashboard.html`](public/dashboard.html:703).
4. **Verification**:
   - Run tests and verify server metrics.
