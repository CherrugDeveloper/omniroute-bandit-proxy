# Security Review Mode - OmniRoute Bandit Proxy AGENTS.md

## Security Audit & Vulnerability Assessment

### 1. Authentication & API Protection
- **Dashboard & Management Endpoints**: Protected via `DASHBOARD_TOKEN` token validation (`x-api-token` header or `?token=` query parameter).
- **Proxy Upstream Auth**: Outbound requests to upstream LLM providers use provider-specific API keys managed securely via environment variables (e.g. `OMNIROUTE_API_KEY`).

### 2. Input Validation & Proxy Safety
- **Context Validation**: [`src/bandit.mjs`](src/bandit.mjs:1) validates request bodies and estimated tokens (`estimateTokens()`) against model `max_input_tokens` limits to prevent overflow attacks or excessive memory consumption.
- **Error Sanitization**: Error classification (`_classifyError`) handles upstream responses robustly without exposing raw internal stack traces to downstream clients.

### 3. Data Protection & Logging
- **Database Security**: SQLite via `better-sqlite3` stores interaction logs (`request_logs`), provider states, and training metrics locally. Ensure proper file system permissions on database files.
- **Log Deduplication**: Ring buffer (`GET /v1/logs`) collapses consecutive identical log lines with a count suffix to prevent log flooding / denial of service via logging.
