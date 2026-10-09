# Ask Mode - OmniRoute Bandit Proxy AGENTS.md

## Ask Mode Specific Instructions

### Asking Questions About the Codebase

#### Understanding the Bandit Algorithm
- The `DiscountedUCB1Bandit` class in `src/bandit.mjs` implements the core algorithm
- Uses `getModelRank()` method for ranking models (30-second cache)
- `selectModel()` method combines catalog and database models, preferring database models
- Error classification in `_classifyError()` determines actions (ban, cooldown, flag)

#### Database Structure
- Uses `better-sqlite3` for all database operations
- Schema migrations are handled in `_migrateDB()` method
- Tables: `models`, `provider_history`, `catalog`, `meta`, `models_train`
- Connection is established in constructor with automatic initialization

#### Error Handling
- Comprehensive error classification with specific actions
- Provider banning, cooldown management, and attention flags
- Transient vs permanent error handling
- Model-level vs provider-level error scopes

### Common Questions to Ask

1. **How does the bandit algorithm work?**
   - The algorithm uses Discounted UCB1 for model selection
   - It ranks models based on their performance
   - It has a 30-second cache for model rankings

2. **How are errors classified?**
   - Errors are classified in `_classifyError()` method
   - Actions include: ban-provider, ban-model, cooldown-provider, cooldown-model, flag-provider

3. **How are providers managed?**
   - Providers are tracked in `provider_history` table
   - They can be banned, put in cooldown, or flagged for attention
   - Attention flags can be cleared with `clearProviderAttention()`

4. **How are models selected?**
   - Models are selected in `selectModel()` method
   - It combines catalog and database models, preferring database models
   - It filters out models that are unavailable (in cooldown, permanently banned, needs attention)

5. **How are tokens estimated?**
   - Use `estimateTokens()` method for accurate context window validation
   - It estimates tokens based on message content

### Configuration Questions

1. **What environment variables are available?**
   - `EXCLUDE_PAID`: Exclude paid models
   - `ONLY_FREE`: Only use free models
   - `EXCLUDE_THINKING`: Exclude thinking models
   - `EXPLOIT_ONLY`: Only exploit known good models
   - `DATABASE_PATH`: Database path (default: bandit.db)

2. **How is the server configured?**
   - Server runs on `127.0.0.1:8080`
   - Health checks are enabled by default
   - Session management is enabled

### Testing Questions

1. **How are tests structured?**
   - Tests use `node:test` framework
   - Database is in-memory for tests (`:memory:`)
   - Helper functions: `makeBandit()`, `seedCatalog()`

2. **What tests are available?**
   - Tests for error classification
   - Tests for model selection
   - Tests for provider management

### Debugging Questions

1. **How to debug the server?**
   - Check `training.log` for training-related events
   - Use `console.log()` statements in production code (already present)
   - Database contains all interaction logs

2. **How to check provider status?**
   - Check `provider_history` table for provider status
   - Check `needs_attention` flag
   - Check `cooldown_until` field

### Common Issues to Ask About

1. **Provider Attention Flags**: Remember to clear `needs_attention` flags when providers recover
2. **Database Migrations**: New columns are added via migration, not schema changes
3. **Session Management**: Sessions expire after `SESSION_TTL_MS` (default 24h)
4. **Token Estimation**: Use `estimateTokens()` for accurate context window validation

### Asking for Help

When asking for help, provide:
1. The specific issue or question
2. Relevant code snippets
3. Error messages
4. Expected vs actual behavior
5. Any debugging information you've already gathered