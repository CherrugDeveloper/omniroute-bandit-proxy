# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Build/Lint/Test Commands
- `npm start`: Starts the service (node src/index.mjs)
- `npm run check`: Syntax checks for src/index.mjs and src/bandit.mjs
- `npm test`: Runs all tests (77 total)
- Critical: `npm run check` must pass before any code changes

## Code Style & Conventions
- **Imports**: Always use `import` syntax (no require)
- **Error Handling**: Use `try/catch` around all async operations; never swallow errors
- **Database**: All SQLite operations must use the query builder pattern (raw SQL queries will fail)
- **API Calls**: Must use the retry mechanism in src/api/providers/utils/ - never make direct fetch calls without retry logic
- **WebSocket**: All connections to /v1/events/punishment must implement the exponential backoff reconnection logic from events.mjs

## Critical Patterns
- **Port 8080 Conflicts**: Always run `./scripts/free-port-emergency.sh` before restarting if port 8080 is in use (service may be hung)
- **Service Restart**: Use `./scripts/restart-safe.sh -q` for silent restarts; `-f` to follow logs
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

## Directory Structure Notes
- .roo/ contains AI agent rules (must follow these precisely)
- src/ contains VSCode extension code (not the web app)
- public/ is the webview UI - has CORS restrictions and limited APIs
- All API endpoints must go through the bandit proxy (never call OmniRoute API directly)
