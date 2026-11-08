# OmniRoute Bandit Proxy

Multi-Armed Bandit reverse proxy for LLM traffic with dynamic provider routing, fallback chains, quotas, exponential backoff punishments, and real-time dashboard analytics.

## Overview

OmniRoute Bandit Proxy acts as an intelligent proxy layer for Large Language Model (LLM) APIs across multiple providers (OpenAI, Anthropic, Groq, Google Gemini, DeepSeek, etc.). It optimizes routing using Discounted UCB1 Multi-Armed Bandit algorithms, monitors provider error patterns, enforces quotas and rate limits, and provides a real-time web dashboard for telemetry, debugging, and training management.

## Features

- **Multi-Armed Bandit Routing**: Uses `DiscountedUCB1Bandit` (0.99 discount factor) with profile multipliers and real-time scoring.
- **Robust Error Classification & Punishment**: 5-tier classification scope with exponential backoff cooldowns (15s up to permanent ban) and 3-strike aggressive punishment for critical failures.
- **Provider Quota Management**: Atomic minute and day window checks at the provider level.
- **Comprehensive Real-Time Dashboard**: Tabbed interface (`public/dashboard.html`) for monitoring models, providers, training status, consideration logs, and system stats.
- **SQLite Persistence**: Powered by `better-sqlite3` with additive-only schema migrations.

## System Requirements

- Node.js (v18+ recommended)
- npm

## Installation

```bash
git clone https://github.com/marco/omniroute-bandit-proxy.git
cd omniroute-bandit-proxy
npm install
```

## Configuration

1. Copy [`[.env.example](.env.example)`] to [`.env`](.env) and configure required API keys and ports.
2. Review configuration files in [`config/bandit.json`](config/bandit.json) and [`config/provider-limits.json`](config/provider-limits.json).

## Usage

Start the production proxy server:
```bash
npm start
```

Start the development server with auto-reload:
```bash
npm run dev
```

## Testing & Verification

Run syntax checks and test suites:
```bash
npm run check
npm test
```

## License

This project is licensed under the MIT License - see the [`LICENSE`](LICENSE) file for details.
