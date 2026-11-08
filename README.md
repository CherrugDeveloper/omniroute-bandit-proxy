---
description: Comprehensive documentation and reproducibility guide for Omniroute Bandit Proxy.
---

# Omniroute Bandit Proxy

Omniroute Bandit Proxy is a high-performance, intelligent Multi-Armed Bandit (MAB) reverse proxy designed for Large Language Model (LLM) traffic routing, dynamic load balancing, automated error classification, provider quota enforcement, and fault-tolerant failovers.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture & Key Components](#architecture--key-components)
3. [Prerequisites & System Requirements](#prerequisites--system-requirements)
4. [Installation & Setup](#installation--setup)
5. [Configuration](#configuration)
6. [Running & Usage](#running--usage)
7. [Testing & Verification](#testing--verification)
8. [Health Checks & Rehabilitation](#health-checks--rehabilitation)
9. [License & Author](#license--author)

---

## Overview

Omniroute Bandit Proxy intercepts LLM API requests and dynamically selects the optimal model using Discounted UCB1 Multi-Armed Bandit algorithms, taking into account provider limits, historical reliability, soft biases, and real-time failure tracking. When errors occur, it classifies them into granular scopes (ban, cooldown, flag) and implements fallback chains and circuit breakers to maintain high availability.

---

## Architecture & Key Components

- **[DiscountedUCB1Bandit](src/bandit.mjs:30)**: Core MAB routing engine (`0.99` discount factor, 30s rank cache, exponential backoff cooldowns).
- **[RequestTracker](src/request-tracker.mjs:1)**: Persistent session and request attempt tracking with SQLite (`better-sqlite3`).
- **[ProviderQuota](src/provider-quota.mjs:5)**: Atomic provider-level rate-limiting (RPM/RPD windows).
- **[HealthChecker](src/health-check.mjs:44)**: Background probing service for rehabilitating unhealthy models and providers.
- **[Dashboard UI](public/dashboard.html:1)**: Real-time monitoring dashboard with debounced filters and AbortController request caching.

---

## Prerequisites & System Requirements

- **Node.js**: `v18.x` or higher (ES Modules support required)
- **SQLite3**: Managed via [`better-sqlite3`](package.json:14)

---

## Installation & Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/omniroute-bandit-proxy.git
   cd omniroute-bandit-proxy
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables (refer to [`.env.example`](.env.example:1)):
   ```bash
   cp .env.example .env
   ```

---

## Configuration

Configuration files are located in the [`config/`](config/) directory:
- [`config/bandit.json`](config/bandit.json:1): Fallback models and error classification regex patterns.
- [`config/provider-limits.json`](config/provider-limits.json:1): Provider rate limits and pricing tiers.

---

## Running & Usage

- **Start Proxy Server**:
  ```bash
  npm start
  ```
- **Start Development Mode (Watch)**:
  ```bash
  npm run dev
  ```

---

## Testing & Verification

Run the comprehensive test suite (`node:test` + in-memory SQLite database):
```bash
npm test
```

Run syntax checks:
```bash
npm run check
```

---

## Health Checks & Rehabilitation

The background health checker probes unhealthy models periodically (`[HealthChecker](src/health-check.mjs:44)`), automatically clearing attention flags and resetting cooldowns upon successful responses.

---

## License

Licensed under the MIT License - see the [LICENSE](LICENSE:1) file for details.
