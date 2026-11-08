---
description: Comprehensive documentation and reproducibility guide for Omniroute Bandit Proxy.
---

# Omniroute Bandit Proxy

Multi-Armed Bandit reverse proxy for LLM traffic with advanced fallback chains, dynamic model training, exponential backoff punishment systems, and real-time dashboard monitoring.

## Overview

Omniroute Bandit Proxy acts as an intelligent router and load balancer for Large Language Model (LLM) requests. It uses Discounted UCB1 Multi-Armed Bandit algorithms to dynamically select the best performing models while tracking health, quotas, errors, and performance metrics across multiple providers.

## Key Features

- **Multi-Armed Bandit Routing**: Discounted UCB1 (`0.99` discount factor) with soft bias (`profileMultiplier`) and exploit-only modes.
- **Robust Error Handling**: 5 classification scopes (ban, cooldown, flag, etc.) with exponential backoff cooldowns and 3-strike aggressive punishment for critical failures (403, 429, timeout, safeWrite errors).
- **Provider Quota Management**: Atomic minute and day window checks for rate limits (RPM/RPD) and token limits (ITPM).
- **Real-Time Dashboard**: Optimized frontend dashboard with debounced filters, AbortController request cancellation, Page Visibility API integration, and live telemetry.
- **SQLite Persistence**: Powered by `better-sqlite3` with additive-only migrations.

## Installation & Reproducibility

### Prerequisites
- Node.js (v18+ recommended)
- npm

### Installation
```bash
git clone https://github.com/your-username/omniroute-bandit-proxy.git
cd omniroute-bandit-proxy
npm install
```

### Configuration
Copy `.env.example` to `.env` and configure your proxy settings and upstream API keys:
```bash
cp .env.example .env
```

## Running the Proxy

- **Start production server**:
  ```bash
  npm start
  ```
- **Start development server (watch mode)**:
  ```bash
  npm run dev
  ```

## Testing & Quality Assurance

- **Syntax check**:
  ```bash
  npm run check
  ```
- **Run test suite**:
  ```bash
  npm test
  ```

## License

MIT License. See [LICENSE](LICENSE).
