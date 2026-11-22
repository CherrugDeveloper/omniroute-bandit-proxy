# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Critical Patterns
- **Port 8080 Conflicts**: Always run `./scripts/free-port-emergency.sh` before restarting if port 8080 is in use (service may be hung)
- **Service Restart**: Use `./scripts/restart-safe.sh -q` for silent restarts; `-f` to follow logs; `--no-refresh`/`-n` to skip dashboard refresh
- **Dashboard Initialization**: Must wait for WebSocket connection to establish before making API calls (see apiFetch implementation)
- **Token Management**: API tokens are stored in localStorage as 'omniroute_token' - must persist across reloads
- **Model Fetch**: All model sync operations must use the `fetchAndSyncModels` function from bandit.mjs (never make direct API calls)

## Security Requirements
- All user input must be sanitized through the bandit's `_sanitizeModelId()` function before API calls
- Never trust client-side validation - all security checks happen server-side in bandit.mjs
- The 5-strike ban system (403/429 errors) requires 5 consecutive critical failures before permanent ban

## Common Pitfalls
- AbortError occurs when switching dashboard tabs - previous model fetch requests get cancelled
- WebSocket connections fail if the backend service isn't running on 127.0.0.1:8080
- Database migrations are additive-only - cannot drop columns, only ADD COLUMN
- Health checks run every 15 minutes for model rehabilitation (not immediately after ban)

## Cascade Ban Prevention (v0.53.10)
- 5-strike paid-group-ban now sets only `needs_attention = 1` on provider_history (NOT `permanent = 1`) — ban isolated to individual model
- Escalation permanent-ban now sets only `needs_attention = 1` on provider_history (NOT `permanent = 1`) — prevents provider-wide cascade bans
- Model-not-found pattern no longer includes "not found" — bare 404 status alone does not trigger permanent ban
- 403 key-limit-exceeded pattern no longer includes bare "403|" — requires specific phrases (lifetime limit, total limit, never resets, etc.)
- Default `UPSTREAM_TIMEOUT_MS` increased from 20000ms to 60000ms for slower models

## Config State Cascade Fix (v0.53.13)
- Generic 502/503/504 errors now classified as `cooldown-model` with `upstream-error` reason (TRANSIENT) instead of `provider-misconfigured` (PERMANENT) — prevents cascade of config state across all provider models
- `cooldown-model` punishment no longer sets `needs_attention = 1` on provider_history; config state only triggered by genuine user-intervention errors (auth-expired, anti-abuse, safeWrite-init-error)
- New `resetUnifiedHistory()` method and `POST /v1/reset/history` endpoint to clear stuck punishment events and old request logs
- Dashboard now has "🗑️ Reset" button in Unified History panel
- `PROXY` removed from default log denylist; runtime override via `LOG_BUFFER_DENYLIST` env var
- Polling intervals increased (main loop 1s→2s, fetch intervals 5s→10s) with `requestIdleCallback` for DOM updates
- `recentRequests` RingBuffer increased from 5 to 50 entries
