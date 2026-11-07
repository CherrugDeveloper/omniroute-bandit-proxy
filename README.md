# OmniRoute Bandit Proxy

OmniRoute Bandit Proxy is a high-performance, intelligent reverse proxy for Large Language Model (LLM) traffic, powered by a Multi-Armed Bandit (MAB) routing algorithm (`DiscountedUCB1Bandit`). It optimizes routing across multiple upstream providers and models based on success rates, latency, reward history, and provider quotas.

## Features

- **Multi-Armed Bandit Routing**: Uses Discounted UCB1 (0.99 discount factor) with 30s rank caching to dynamically select the best performing model/provider.
- **Provider Quota Management**: Atomic minute and day window checks for rate limits (RPM/RPD) at the provider level.
- **Robust Error Classification & Handling**: 5 classification scopes (ban, cooldown, flag, degradation) with exponential backoff cooldowns (15s up to permanent ban) and 3-strike aggressive punishment for critical failures.
- **Persistent State & Training**: Powered by `better-sqlite3` with additive-only migrations and isolated `models_train` table for background training daemon integration.
- **Real-Time Dashboard**: Responsive web dashboard (`public/dashboard.html`) providing live telemetry, model/provider management, metrics, and script output streaming via WebSockets.
- **Session Tracking**: Session TTL management (30m) and stream idle timeouts (60s).

## Prerequisites

- Node.js (v18+ recommended)
- npm

## Installation & Setup

```bash
# Clone repository
git clone <repository-url>
cd omniroute-bandit-proxy

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env
```

## Running the Proxy

- **Production Mode**: `npm start`
- **Development Mode (Watch mode)**: `npm run dev`

## Build & Test

- **Syntax Check**: `npm run check`
- **Run Test Suite**: `npm test`

## Configuration

Configuration files are located in [`config/`](config/):
- [`config/bandit.json`](config/bandit.json) - Bandit hyperparameters, fallback chains, and error pattern mappings.
- [`config/provider-limits.json`](config/provider-limits.json) - Upstream provider rate limits (RPM/RPD).

## License

MIT License. See [`LICENSE`](LICENSE) for details.