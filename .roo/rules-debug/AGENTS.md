# Debug Mode - OmniRoute Bandit Proxy AGENTS.md

## Debug Mode Specific Instructions

### Debugging Techniques

#### Server Health Checks
- The server runs on `127.0.0.1:8080`
- Health check endpoint is available via the `healthChecker` module
- Check `training.log` for training-related events
- Use `console.log()` statements in production code (already present)

#### Database Debugging
- Database contains all interaction logs
- Use `better-sqlite3` for database operations
- Check `provider_history` table for provider status and attention flags
- Use `bandit.getMetrics()` to get system metrics

#### Error Classification
- Errors are classified in `_classifyError()` method
- Actions include: ban-provider, ban-model, cooldown-provider, cooldown-model, flag-provider
- Check `training.log` for error classification details

### Common Debugging Issues

1. **Provider Attention Flags**: Check `needs_attention` flag in `provider_history` table
2. **Database Migrations**: Ensure new columns are added via migration
3. **Session Management**: Sessions expire after `SESSION_TTL_MS` (default 24h)
4. **Token Estimation**: Use `estimateTokens()` for accurate context window validation

### Debugging Commands

#### Check Server Status
```bash
# Check if server is running
ps aux | grep "node src/index.mjs"

# Check server logs
# Server logs are written to console
```

#### Database Queries
```bash
# Use Node.js to query database
node -e "const Database = require('better-sqlite3'); const db = new Database('bandit.db'); console.log(db.prepare('SELECT * FROM provider_history').all());"
```

#### Health Check
```bash
# Check health endpoint
curl http://127.0.0.1:8080/health
```

### Debugging Tips

1. **Check `training.log`**: Contains training-related events
2. **Use `console.log()`**: Already present in production code
3. **Database Logs**: All interactions are logged in the database
4. **Health Check**: Available for monitoring

### Common Debugging Scenarios

#### Provider Not Responding
1. Check `provider_history` table for `needs_attention` flag
2. Check `cooldown_until` field
3. Check `permanent` flag

#### Model Selection Issues
1. Check `models` table for model status
2. Check `catalog` table for model metadata
3. Check `getModelRank()` method

#### Token Limit Issues
1. Use `estimateTokens()` for accurate token estimation
2. Check `max_input_tokens` in `catalog` table
3. Check `max_input_tokens` in `models` table