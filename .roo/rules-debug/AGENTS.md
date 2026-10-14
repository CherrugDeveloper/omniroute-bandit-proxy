# Debug Mode - OmniRoute Bandit Proxy AGENTS.md

## Debugging Workflow & Specialized Diagnostics

### 1. Server Health & Status Diagnostics
- **Health Check Status**: Inspect [`GET /v1/health-check/status`](src/health-check.mjs:1) via curl or dashboard to monitor automated model probes (runs every 5 min, batch size 20, 15s timeout).
- **In-flight & Active Requests**: Check [`GET /v1/inflight`](src/index.mjs:1) and [`GET /v1/active`](src/index.mjs:1) to diagnose hung connections or concurrency bottlenecks.
- **Ring Buffer Logs**: Query [`GET /v1/logs`](src/index.mjs:1) for the last 200 log entries (automatically deduplicated with count suffix).

### 2. Database Diagnostics (`better-sqlite3`)
- **Querying State**: Use [`scripts/check-db.mjs`](scripts/check-db.mjs:1) or [`scripts/inspect-db.mjs`](scripts/inspect-db.mjs:1) to inspect table states (`models`, `models_train`, `provider_history`, `catalog`, `meta`, `request_logs`).
- **Connection Issues**: SQLite uses single-connection synchronous execution (`better-sqlite3`). Ensure no file lock issues during concurrent training daemon writes (`models_train`) and proxy reads (`models`).

### 3. Error Classification Troubleshooting (`_classifyError` in [`src/bandit.mjs`](src/bandit.mjs:100))
Diagnose error routing behavior by inspecting classification outputs:
- `ban-provider`: Triggered by 401/403 auth, 404 deleted, 418 teapot, 429 org-quota, 5xx repeated.
- `ban-model`: Triggered by 400 context-length, 404 model-not-found, 410 gone.
- `cooldown-provider`: Triggered by 429 rate-limit (respects `retry-after` header in seconds or HTTP-date), 5xx transient.
- `cooldown-model`: Triggered by 429 model-specific, 503 overloaded.
- `flag-provider`: Triggered by 400 validation, 408 timeout, 422 unprocessable, 502/504 gateway.

### 4. Common Debug Scenarios & Resolution
- **Provider Quota Lockout**: Check [`src/provider-quota.mjs`](src/provider-quota.mjs:1) rolling minute/day limits from [`config/provider-limits.json`](config/provider-limits.json:1). Quota exhaustion triggers permanent ban with reason `quota_exhausted`. Reset via [`POST /v1/reset/provider/:provider`](src/index.mjs:1).
- **Persistent Attention Flags**: Health checks do *not* auto-clear `needs_attention` on [`provider_history`](src/bandit.mjs:1). Must explicitly invoke [`POST /v1/provider/retry/:provider`](src/index.mjs:1) or `clearProviderAttention()`.
- **Session Affinity Failures**: MD5 signature mismatch [`src/index.mjs`](src/index.mjs:1) (systemPrompt + firstUserMessage). Stored in `sessionModelMap` with 30-min TTL. Invalidated automatically on non-2xx response or validation failure.
- **Token Limit Exceeded**: Verify [`src/bandit.mjs`](src/bandit.mjs:1) `estimateTokens()` (4 chars/token heuristic). Context compression auto-triggers when estimated tokens > 80% of `max_input_tokens`.
