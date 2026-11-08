# Omniroute Bandit Proxy

[![Build & Test](https://github.com/marco/omniroute-bandit-proxy/actions/workflows/test.yml/badge.svg)](https://github.com/marco/omniroute-bandit-proxy/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.28.14-blue.svg)](package.json)

Omniroute Bandit Proxy is a high-performance, intelligent multi-armed bandit reverse proxy designed for LLM traffic routing, load balancing, dynamic reward optimization, and robust error management.

---

## Table of Contents
1. [Overview](#overview)
2. [Key Features](#key-features)
3. [Architecture & Design Patterns](#architecture--design-patterns)
4. [Installation & Requirements](#installation--requirements)
5. [Configuration](#configuration)
6. [Usage & Execution](#usage--execution)
7. [Testing & Reproducibility](#testing--reproducibility)
8. [Dashboard & Management UI](#dashboard--management-ui)
9. [Error Handling & Punishment System](#error-handling--punishment-system)
10. [License](#license)

---

## Overview

Omniroute Bandit Proxy sits between client applications and large language model (LLM) providers. It dynamically selects the optimal model/provider combination using Discounted UCB1 multi-armed bandit algorithms, tracks request performance and latency, applies soft bias multipliers (`profileMultiplier`), enforces provider-level rate limits (RPM/RPD), and executes aggressive 3-strike multi-tier failure recovery.

---

## Key Features

- **Discounted UCB1 Bandit**: Optimizes routing decisions with a 0.99 discount factor per event and a 30s rank caching TTL.
- **Isolated Training & Production**: Maintains isolated `models_train` and production tables with seamless blended scoring.
- **Multi-Tier Error Classification & Punishment**: 5 classification scopes (ban, cooldown, flag, etc.) featuring exponential backoff cooldowns and an aggressive 3-strike system for critical failures.
- **Provider-Level Quota Management**: Atomic minute and day window checks across provider requests.
- **Advanced Management Dashboard**: Real-time web console [`public/dashboard.html`](public/dashboard.html) featuring responsive table layouts, sanitized model names, request logs, and system controls.

---

## Architecture & Design Patterns

- **ES Modules**: Built on modern JavaScript (ESM) running on Node.js.
- **Database**: Uses `better-sqlite3` with additive-only schema migrations (`ADD COLUMN` in `_migrateDB`).
- **Proxy/Sessions**: 30-minute session TTL (`SESSION_TTL_MS`) and 60-second stream idle timeout (`STREAM_IDLE_MS`) refreshed on any chunk or heartbeat.

---

## Installation & Requirements

- **Node.js**: `v18.x` or higher
- **Dependencies**: [`package.json`](package.json)

```bash
git clone https://github.com/marco/omniroute-bandit-proxy.git
cd omniroute-bandit-proxy
npm install
```

---

## Configuration

Configuration files are located in [`config/`](config/):
- [`config/bandit.json`](config/bandit.json): Bandit hyperparameters, fallback chains, and error pattern regex mapping.
- [`config/modes.json`](config/modes.json): Available operating modes and signatures.
- [`config/provider-limits.json`](config/provider-limits.json): Provider rate limits (RPM/RPD).

Copy [` .env.example`](.env.example) to `.env` to configure environment variables.

---

## Usage & Execution

- **Start Proxy Server**:
  ```bash
  npm start
  ```
- **Start Development Server (Watch Mode)**:
  ```bash
  npm run dev
  ```
- **Syntax Check**:
  ```bash
  npm run check
  ```
- **Run Test Suite**:
  ```bash
  npm run test
  ```

---

## Testing & Reproducibility

Testing uses Node's built-in `node:test` runner combined with in-memory SQLite databases (`:memory:`), using test helpers like `makeBandit()` and `seedCatalog()`.

```bash
npm run test
```

---

## Dashboard & Management UI

The management dashboard is served at root and available in [`public/dashboard.html`](public/dashboard.html). It features:
- **Modelli & Train Tabs**: Optimized 11-column tables with sanitized model names (removing explicit provider prefixes) and responsive column layouts.
- **Live Logs & Metrics**: Real-time activity tracking, success rates, and token estimation (4 chars/token).

---

## Error Handling & Punishment System

- **5 Scopes**: Ban, cooldown, flag provider/model.
- **Consecutive 5xx Tracking**: `consecutive_5xx ≥ 3` transitions models into degraded mode.
- **3-Strike System**: Permanent ban after 3 consecutive critical failures (403 forbidden, 429 rate limit, timeout, safeWrite errors), tracked via `consecutive_critical_failures`.

---

## License

MIT License. See [`LICENSE`](LICENSE) for details.
