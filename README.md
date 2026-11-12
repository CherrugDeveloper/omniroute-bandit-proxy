# OmniRoute Bandit Proxy

A multi-armed bandit-powered LLM proxy with intelligent model selection, error classification, punishment system, and real-time dashboard.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [API Endpoints](#api-endpoints)
- [Dashboard](#dashboard)
- [Bandit Algorithm](#bandit-algorithm)
- [Error Classification & Punishment](#error-classification--punishment)
- [Database](#database)
- [Development](#development)
- [License](#license)

## Overview

OmniRoute Bandit Proxy is a Node.js-based LLM proxy that uses a Discounted UCB1 (Upper Confidence Bound) multi-armed bandit algorithm for intelligent model selection. It routes requests across multiple providers and models, automatically learning which models perform best while handling errors, cooldowns, and bans intelligently.

## Features

- **Multi-armed bandit model selection** using Discounted UCB1 with 0.99 discount factor
- **Error classification** with transient vs permanent error patterns
- **3-strike punishment system** with exponential backoff cooldowns
- **Real-time dashboard** with WebSocket events and unified history
- **Provider-level quota management** with atomic minute/day windows
- **SQLite database** with better-sqlite3 for persistence
- **Training daemon** with isolated round-robin writes
- **Session affinity** with 30-minute TTL
- **Fallback chain** that bypasses UCB1
- **Profile bias** with stackable multipliers

## Architecture

The project consists of:

- `src/bandit.mjs` - Core bandit algorithm, model selection, punishment system
- `src/index.mjs` - Express proxy server, request handling, middleware
- `src/events.mjs` - EventEmitter singleton, punishment event logging
- `src/request-tracker.mjs` - Request tracking and metrics
- `src/provider-quota.mjs` - Provider quota management
- `src/modes-registry.mjs` - Mode signatures and profile multipliers
- `src/health-check.mjs` - Provider health checking
- `src/log-throttle.mjs` - Log noise reduction
- `src/notifier.mjs` - Notification system (Telegram, Slack, Discord)
- `public/dashboard.html` - Real-time monitoring dashboard
- `scripts/train-daemon.mjs` - Training daemon
- `config/bandit.json` - Bandit configuration

## Installation

```bash
npm install
```

## Configuration

Configuration lives in `config/bandit.json`:

- `fallbackModels` - Fallback chain (bypasses UCB1)
- `errorConfig.classification` - Error pattern classification
- `degradationThreshold` - Consecutive 5xx threshold for degraded mode (default: 3)
- `rehabilitationPeriodMs` - Rehabilitation period (default: 172800000ms / 48h)

## Usage

```bash
npm start
```

The proxy runs on port 8080 by default. The dashboard is available at the root path.

## API Endpoints

- `GET /v1/models` - List available models
- `POST /v1/chat/completions` - Chat completions endpoint
- `GET /v1/metrics` - Proxy metrics
- `GET /v1/active` - Active requests and punishment events
- `GET /v1/events/punishment` - WebSocket for punishment events
- `POST /v1/reset` - Reset counters

## Dashboard

The dashboard provides real-time monitoring of:

- Model and provider metrics
- Punishment events (bans, cooldowns, flags)
- Unified history of requests
- Training status
- Script manager

## Bandit Algorithm

`DiscountedUCB1Bandit` applies a **0.99 discount per event**; `_rankCache` has a **30s TTL**.

`_sanitizeModelId()` strips a duplicated provider prefix (e.g. `mistral/mistral-x` → `mistral-x`) only when the sanitized id exists in `catalog`; otherwise returns the original id.

## Error Classification & Punishment

Error config lives in `config/bandit.json`. `errorConfig.classification.transientErrors` and `permanentErrors` are pattern→action lists.

- `safeWrite` errors map to **ban-model** (scope: model)
- **5-strike system**: 5 consecutive critical failures (403, 429) → permanent ban. `consecutive_critical_failures` counter resets on success.
- `safeWrite` infrastructure errors are classified as **transient (cooldown-model)**, NOT critical.
- Timeout errors are **transient (cooldown-model)**, NOT critical.
- `consecutive_5xx ≥ 3` triggers degraded mode.
- Exponential backoff cooldowns: 15s → 5m → 30m → 2h → permanent.
- Cascade ban guard prevents re-banning models already permanently banned.
- Emergency rejection downgrades to cooldown-model (no permanent ban).
- **Real-time statistics**: StatsAggregator maintains live punishment event counters and unified history.

## Database

`better-sqlite3`; migrations are additive-only (`ADD COLUMN` in `_migrateDB`).

- Isolated `models_train` table; production reads `models` + `0.3*models_train` (when `N < 1`).
- Training daemon runs in isolated round-robin writes to `models_train`.
- `models` and `provider_history` tables stay in sync on bans/cooldowns via `recordFeedback()`.

## Development

```bash
npm test
```

## License

MIT
