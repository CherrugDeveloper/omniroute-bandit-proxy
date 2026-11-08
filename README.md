# OmniRoute Bandit Proxy

Multi-Armed Bandit reverse proxy for LLM traffic with intelligent provider routing, dynamic reinforcement learning (Discounted UCB1), granular error handling, quota management, and automated training daemon.

## Features

- **Multi-Armed Bandit Routing**: Discounted UCB1 bandit algorithm (discount factor 0.99) with 30s rank caching and profile multipliers.
- **Robust Error Classification & Punishment**: 5 classification scopes (ban, cooldown, flag, etc.), exponential backoff cooldowns (15s → 5m → 30m → 2h → permanent), and 3-strike aggressive punishment for critical failures.
- **Training Daemon**: Automated background training cycles (`scripts/train-daemon.mjs`) with automatic 404 error auto-flagging (`permanent = 1`) to prevent dead model retry loops.
- **Atomic Quota Management**: Provider-level rate limit (RPM/RPD) and token (ITPM) atomic minute/day window checks.
- **Session Tracking**: Persistent request tracking with SQLite (`better-sqlite3`), 30-minute session TTL, and 60-second stream idle timeout.
- **Interactive Dashboard**: Real-time web UI (`public/dashboard.html`) for monitoring models, providers, logs, and training status.

## Installation

```bash
git clone https://github.com/your-org/omniroute-bandit-proxy.git
cd omniroute-bandit-proxy
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure your API keys and endpoints. Model and provider fallback configurations are located in [`config/bandit.json`](config/bandit.json:1).

## Usage & Scripts

- `npm start` - Start the proxy server
- `npm run dev` - Start development server with watch mode (`node --watch src/index.mjs`)
- `npm run check` - Syntax check all source files
- `npm test` - Run the test suite (`node --test __tests__/*.test.js`)

## Testing

The test suite runs with Node.js built-in test runner (`node:test`) and in-memory SQLite databases:

```bash
npm test
```

## License

MIT
