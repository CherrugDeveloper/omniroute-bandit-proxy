# Security Review Mode — OmniRoute Bandit Proxy AGENTS.md

Non-obvious, project-specific guidance for security audits.

## Authentication & API Protection
- Dashboard & management endpoints protected via `DASHBOARD_TOKEN` token validation (`x-api-token` header or `?token=` query parameter).
- Proxy upstream auth uses provider-specific API keys via environment variables (e.g. `OMNIROUTE_API_KEY`).

## Input Validation & Proxy Safety
- [`src/bandit.mjs`](src/bandit.mjs:1) validates request bodies and estimated tokens (`estimateTokens()`) against model `max_input_tokens` limits.
- Error classification (`_classifyError`) handles upstream responses without exposing raw internal stack traces to downstream clients.
- Token estimation = 4 chars/token.

## Data Protection & Logging
- SQLite via `better-sqlite3` stores interaction logs (`request_logs`), provider states, and training metrics locally. Ensure proper file system permissions on database files.
- Ring buffer (`GET /v1/logs`) collapses consecutive identical log lines with a count suffix to prevent log flooding / DoS via logging.

## Error Pattern Security
- `config/bandit.json` maps `safeWrite|cannot access safeWrite|safeWrite before initialization|safeWrite is not initialized` to **ban-model**.

## Quota
- Provider-level quota; atomic minute+day window check; background roller runs every 60s even without requests.
