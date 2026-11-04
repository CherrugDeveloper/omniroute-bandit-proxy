# OmniRoute Bandit Proxy Technical Guidelines

- **Bandit**: `DiscountedUCB1Bandit` uses 0.99 discount/event; `_rankCache` (30s TTL).
- **DB**: `better-sqlite3`; schema migrations only `ADD COLUMN`.
- **Training**: Isolated `models_train` table; production reads `models` + `0.3*models_train` (if `N < 1`).
- **Error Handling**: 5 classification scopes (ban, cooldown, flag, etc.); `consecutive_5xx` triggers degraded mode.
- **Quota**: Provider-level (not model), atomic checks of minute/day windows.
- **Proxy/Sessions**: `SESSION_TTL_MS` = 30m; `STREAM_IDLE_MS` = 60s (reset on any chunk/heartbeat).
- **Soft Bias**: `profileMultiplier` (multipliers stack) applies to UCB1 score.
- **Testing**: `node:test` + in-memory `:memory:` DB.
- **Gotcha**: Fallback chain in `config/bandit.json` bypasses UCB1.
- **Recent Changes**: Exponential backoff cooldowns (15s→5m→30m→2h→permanent); `total_failures` tracking; emergency relaxation now respects cooldowns; consecutive fails reset on success; 3-strike aggressive punishment for critical failures
- **Error Pattern**: `config/bandit.json` now maps `safeWrite|cannot access safeWrite|safeWrite before initialization|safeWrite is not initialized` to ban-model
- **Dashboard**: `public/dashboard.html` - table dimension changes, column width adjustments, model name prefix stripping
- **3-Strike System**: Aggressive punishment for critical failures (403 forbidden, 429 rate limit, timeout, safeWrite errors) - permanent ban after 3 consecutive critical failures; `consecutive_critical_failures` counter tracks the streak and resets on success

## Build & Test Commands

- `npm start` - Start the proxy server
- `npm run dev` - Start development server with watch mode
- `npm run check` - Syntax check all source files
- `npm run test` - Run tests

## Git Workflow

- Use conventional commit format: `type(scope): subject`
- Types: feat, fix, docs, style, refactor, test, chore
- Include detailed body describing functional changes
- Reference source files using [filename:line] format

## Project Conventions

- Use modern JavaScript (ES modules)
- Follow consistent indentation and formatting
- Add comments for complex logic
- Keep functions focused and well-named
