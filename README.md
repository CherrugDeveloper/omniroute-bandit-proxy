# OmniRoute Bandit Proxy

Multi-Armed Bandit reverse proxy for LLM traffic with advanced features:
- **Discounted UCB1 Bandit**: Uses 0.99 discount/event with rank caching (30s TTL).
- **Isolated Training Data**: Separate `models_train` table for training daemon evaluation.
- **Robust Error Classification & Punishment**: 5 error classification scopes and 3-strike aggressive punishment for critical failures.
- **Quota Management**: Provider-level rate limiting (RPM/RPD) with atomic checks.
- **Session Tracking & Dashboard**: Real-time operational dashboard at [`public/dashboard.html`](public/dashboard.html:1).

## Build & Test

- `npm start` - Start the proxy server
- `npm run dev` - Start development server with watch mode
- `npm run check` - Syntax check source files
- `npm test` - Run test suite (`node:test`)
