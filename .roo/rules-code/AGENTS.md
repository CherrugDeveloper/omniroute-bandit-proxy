# Code Mode - OmniRoute Bandit Proxy AGENTS.md

## Code Mode Specific Instructions

### Key Code Patterns

#### Bandit Algorithm Implementation
- The `DiscountedUCB1Bandit` class in `src/bandit.mjs` implements the core algorithm
- Uses `getModelRank()` method for ranking models (30-second cache)
- `selectModel()` method combines catalog and database models, preferring database models
- Error classification in `_classifyError()` determines actions (ban, cooldown, flag)

#### Database Operations
- Uses `better-sqlite3` for all database operations
- Schema migrations are handled in `_migrateDB()` method
- Tables: `models`, `provider_history`, `catalog`, `meta`, `models_train`
- Connection is established in constructor with automatic initialization

#### Error Handling Patterns
- Comprehensive error classification with specific actions
- Provider banning, cooldown management, and attention flags
- Transient vs permanent error handling
- Model-level vs provider-level error scopes

### Common Code Issues to Avoid

1. **Duplicate Methods**: Ensure `getModelRank()` appears only once in `bandit.mjs`
2. **Provider Attention Flags**: Remember to clear `needs_attention` flags when providers recover
3. **Database Migrations**: New columns are added via migration, not direct schema changes
4. **Token Estimation**: Always use `estimateTokens()` for accurate context window validation
5. **Session Management**: Sessions expire after `SESSION_TTL_MS` (default 24h)

### Testing Best Practices

- Tests use `node:test` framework
- Database is in-memory for tests (`:memory:`)
- Helper functions: `makeBandit()`, `seedCatalog()`
- Test coverage includes error classification, model selection, and provider management

### Configuration Management

- Environment variables drive behavior
- `.env.example` contains all configuration options
- Key variables: `EXCLUDE_PAID`, `ONLY_FREE`, `EXCLUDE_THINKING`, `EXPLOIT_ONLY`
- Database path configurable via `DATABASE_PATH`

### Performance Considerations

- 30-second cache for model rankings (`_rankCache`)
- Health checks every 5 minutes
- Session cleanup every 5 minutes
- Efficient database queries with proper indexing

### Debugging Tips

- Check `training.log` for training-related events
- Use `console.log()` statements in production code (already present)
- Database contains all interaction logs
- Health check endpoint available for monitoring