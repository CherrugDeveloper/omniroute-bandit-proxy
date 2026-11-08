# OmniRoute Bandit Proxy

[![Test Suite](https://github.com/omniroute/omniroute-bandit-proxy/actions/workflows/test.yml/badge.svg)](https://github.com/omniroute/omniroute-bandit-proxy/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Semantic Versioning](https://img.shields.io/badge/SemVer-2.0.0-blue.svg)](https://semver.org/)

Multi-Armed Bandit reverse proxy for LLM traffic with advanced routing, dynamic model weighting, provider-level quota tracking, exponential backoff cooling, and real-time operational dashboard.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture & Design](#architecture--design)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Proxy](#running-the-proxy)
- [Running Tests](#running-tests)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

OmniRoute Bandit Proxy acts as an intelligent HTTP reverse proxy and load balancer optimized for LLM inference providers. It utilizes a Discounted UCB1 Multi-Armed Bandit algorithm to dynamically route requests across available models and providers, maximizing success rates, minimizing latency, and respecting quota limits while ensuring robust failure isolation and automatic circuit breaking.

---

## Key Features

- **Discounted UCB1 Bandit Routing**: Intelligent multi-armed bandit selection with a 0.99 discount factor per event and 30-second rank caching.
- **Robust Error Classification & Punishment**: 5 classification scopes (ban, cooldown, flag, provider, model) with exponential backoff cooling (15s to permanent) and a 3-strike aggressive punishment system for critical failures.
- **Provider-Level Quota Tracking**: Atomic minute and day window checks preventing rate-limit overflows across shared provider infrastructure.
- **Session & Stream Management**: 30-minute session TTL (`SESSION_TTL_MS`) and 60-second idle stream timeouts (`STREAM_IDLE_MS`) resetting on any chunk or heartbeat.
- **Interactive Real-Time Dashboard**: Comprehensive web UI (`public/dashboard.html`) featuring metrics, model status, training controls, and live request tracing.
- **Zero-Dependency SQLite Storage**: Built on [`better-sqlite3`](package.json:14) with additive-only schema migrations.

---

## Architecture & Design

```
[ Client Request ] ---> [ OmniRoute Bandit Proxy ] ---> [ UCB1 Bandit Selector ]
                                  |                             |
                                  v                             v
                        [ Request Tracker & DB ]       [ Provider Inference API ]
                                  |
                                  v
                        [ Operational Dashboard ]
```

The system separates production routing from background training (`models_train` table) and utilizes robust circuit breakers to degrade or ban unhealthy endpoints automatically.

---

## Requirements

- Node.js >= 18.0.0
- npm >= 9.0.0

---

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/omniroute/omniroute-bandit-proxy.git
   cd omniroute-bandit-proxy
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables (copy [`env.example`](.env.example:1) to `.env`):
   ```bash
   cp .env.example .env
   ```

---

## Configuration

Configuration files are located in the [`config/`](config/) directory:
- [`config/bandit.json`](config/bandit.json:1): Error patterns, routing weights, fallback chains, and classification rules.
- [`config/provider-limits.json`](config/provider-limits.json:1): Provider RPM, RPD, and token limits.

---

## Running the Proxy

- **Production Mode**:
  ```bash
  npm start
  ```
- **Development Mode (Watch)**:
  ```bash
  npm run dev
  ```

---

## Running Tests

Execute the comprehensive test suite (`node:test` + in-memory SQLite):
```bash
npm run test
```

Perform static syntax checks:
```bash
npm run check
```

---

## Project Structure

- [`src/`](src/): Core proxy engine, bandit implementation, health checks, and request trackers.
- [`public/`](public/): Dashboard frontend (`dashboard.html`), service worker, and assets.
- [`__tests__/`](__tests__/): Comprehensive unit and integration test suite.
- [`config/`](config/): Routing rules, provider limits, and bandit configuration.
- [`scripts/_`](scripts/): Database inspection, migration management, and daemon control utilities.

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes using Conventional Commits (`type(scope): subject`)
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License - see the [`LICENSE`](LICENSE:1) file for details.
