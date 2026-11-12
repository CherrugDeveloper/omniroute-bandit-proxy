# OmniRoute Bandit Proxy

A specialized proxy server for intelligent model routing, employing a bandit algorithm to optimize request distribution while managing provider health, quotas, and failures.

## Features
- **Bandit Routing**: Uses `DiscountedUCB1Bandit` to dynamically route requests based on performance, with a 30s ranking cache TTL.
- **Robust Failure Governance**: Advanced 3-strike system for critical failures, automatic cooldowns for transient errors (e.g., 5xx, timeouts), and escalation paths.
- **Unified History**: Synchronized tracking across `models` and `provider_history` tables for consistent state management.
- **Metrics Dashboard**: Real-time monitoring of model health, bans, and provider status.
- **Configuration-Driven**: Fine-grained control over fallback chains and error classification via `config/bandit.json`.

## Documentation
Technical guidelines and system architecture details can be found in [`AGENTS.md`](AGENTS.md).

## Build & Test
- `npm start` - Start the proxy server
- `npm run dev` - Start development server (watch mode)
- `npm run check` - Syntax check source files
- `npm run test` - Run test suite (Node.js test runner + in-memory database)

## License
MIT
