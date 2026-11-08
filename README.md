# OmniRoute Bandit Proxy

Multi-Armed Bandit reverse proxy for LLM traffic with dynamic provider routing, fallback chains, quotas, exponential backoff punishments, and real-time dashboard analytics.

## Description

OmniRoute Bandit Proxy acts as an intelligent proxy layer for Large Language Model (LLM) APIs across multiple providers (OpenAI, Anthropic, Groq, Google Gemini, DeepSeek, etc.). It optimizes routing using Discounted UCB1 Multi-Armed Bandit algorithms, monitors provider error patterns, enforces quotas and rate limits, and provides a real-time web dashboard for telemetry, debugging, and training management.

## Features

- **Multi-Armed Bandit Routing**: Uses `DiscountedUCB1Bandit` (0.99 discount factor) with profile multipliers and real-time scoring.
- **Robust Error Classification & Punishment**: 5-tier classification scope with exponential backoff cooldowns (15s up to permanent ban) and 3-strike aggressive punishment for critical failures.
- **Provider Quota Management**: Atomic minute and day window checks at the provider level.
- **Comprehensive Real-Time Dashboard**: Tabbed interface (`public/dashboard.html`) for monitoring models, providers, training status, consideration logs, and system stats.
- **SQLite Persistence**: Powered by `better-sqlite3` with additive-only schema migrations.

## Installation

```bash
git clone https://github.com/your-username/omniroute-bandit-proxy.git
cd omniroute-bandit-proxy
npm install
```

## Usage

Start the production proxy server:
```bash
npm start
```

Start the development server with auto-reload:
```bash
npm run dev
```

## Configuration

Configure environment variables in a `.env` file (see [.env.example](.env.example)):
- Proxy port and host settings
- API keys and provider endpoints

Configure routing behavior, fallback models, and error classifications in [`config/bandit.json`](config/bandit.json:1).

## Testing

Run the test suite:
```bash
npm test
```

Perform syntax checks:
```bash
npm run check
```

## License

MIT License. See [LICENSE](LICENSE) for details.
