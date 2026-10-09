# OmniRoute Bandit Proxy - AGENTS.md

## Overview
This project is a Multi-Armed Bandit reverse proxy router for dynamic LLM traffic distribution. It intelligently routes requests to different LLM providers based on performance metrics and feedback.

## Build/Lint/Test Commands

### Build
- `npm start` - Start the proxy server
- `npm run dev` - Start with file watching
- `npm run check` - Validate TypeScript and JavaScript syntax

### Testing
- `npm test` - Run all tests
- `node --test tests/*.test.mjs` - Run tests directly

### Single Test
To run a specific test, you can use the node --test flag with a specific file:
```bash
node --test tests/bandit.test.mjs
```

## Code Style Guidelines

### JavaScript/TypeScript
- Uses ES modules (`.mjs` extension)
- TypeScript with strict mode
- Uses `better-sqlite3` for database operations
- Follows functional programming patterns with classes

### Database Schema
- `models` table: Tracks individual model performance
- `provider_history` table: Tracks provider status and attention flags
- `catalog` table: Stores model metadata from OmniRoute API
- `meta` table: Stores global counters

### Key Patterns
- **Bandit Algorithm**: Uses Discounted UCB1 for model selection
- **Error Classification**: Comprehensive error handling with specific actions
- **Caching**: 30-second cache for model rankings
- **Session Affinity**: Maintains model selection per session

## Critical Project-Specific Patterns

### Model Selection
1. **Catalog vs Database Models**: Prefers database models over catalog when conflicts exist
2. **Provider Status Checks**: Filters out providers with cooldown, permanent bans, or attention flags
3. **Token Limit Validation**: Ensures estimated tokens don't exceed model capabilities

### Error Handling
- **Provider Banning**: Permanent bans for critical errors
- **Cooldown Management**: Temporary cooldowns for rate limits and errors
- **Attention Flags**: Non-blocking warnings for provider issues

### Configuration
- Environment variables drive behavior (EXCLUDE_PAID, ONLY_FREE, etc.)
- Database migrations handle schema evolution
- Health checks automatically revive models

## Common Pitfalls

1. **Provider Attention Flags**: Remember to clear `needs_attention` flags when providers recover
2. **Database Migrations**: New columns are added via migration, not schema changes
3. **Session Management**: Sessions expire after `SESSION_TTL_MS` (default 24h)
4. **Token Estimation**: Use `estimateTokens()` for accurate context window validation

## API Endpoints
- `POST /v1/chat/completions` - Main proxy endpoint
- `GET /v1/metrics` - Metrics endpoint (auth required)
- `POST /v1/reset/provider/:p` - Reset provider
- `POST /v1/provider/retry/:p` - Clear provider attention

## Monitoring
- Health checks every 5 minutes
- Metrics available via `/v1/metrics`
- Logs written to `training.log`
- Database tracks all interactions