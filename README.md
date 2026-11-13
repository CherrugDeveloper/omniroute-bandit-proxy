# OmniRoute Bandit Proxy

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/Tests-10%20suites-blue.svg)](https://nodejs.org/)
[![Version](https://img.shields.io/badge/version-1.29.1-blue.svg)](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/releases/tag/v1.29.1)

## Overview

The OmniRoute Bandit Proxy is a Multi-Armed Bandit (MAB) reverse proxy for LLM traffic that intelligently routes requests across multiple LLM providers using the **Discounted UCB1** algorithm. It dynamically balances exploration vs. exploitation based on observed rewards, automatically handles model bans, cooldowns, provider health, session affinity, and real-time punishment tracking via a WebSocket-connected dashboard.

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Discounted UCB1** | Multi-armed bandit algorithm with 0.99 discount factor per event for adaptive model selection |
| **Session Affinity** | Sessions pinned to models with 30m TTL; stream idle timeout of 60s (resets on any chunk/heartbeat) |
| **Punishment System** | 5-strike rule: 5 consecutive critical failures (403, 429) → permanent ban; counter resets on success |
| **Exponential Backoff** | Cooldowns: 15s → 5m → 30m → 2h → permanent |
| **Error Classification** | Transient vs. permanent errors mapped to actions (cooldown-model, cooldown-provider, ban-model, ban-provider, flag-provider) |
| **Training Daemon** | Isolated round-robin writes to `models_train` table; production reads `models` + `0.3*models_train` when N < 1 |
| **Real-time Events** | WebSocket-based punishment event stream with StatsAggregator singleton for dashboard updates |
| **Image Generation** | Detection and filtering of image-only models from chat routing |

## Features

- **Multi-Armed Bandit routing** — DiscountedUCB1 with profile-based multipliers (code, reasoning, general, summarizer)
- **Provider quota management** — Rolling quota windows with background recovery every 60s
- **Health checking** — Active probes on sick models (banned/cooldown) with auto-rehabilitation
- **Punishment & bans** — 5-strike permanent ban system, exponential backoff cooldowns, cascade ban guards
- **Real-time dashboard** — WebSocket-powered UI with live metrics, model tables, train tab, and punishment history
- **Notifiers** — Webhook support for Slack, Discord, and Telegram on critical events
- **Token estimation** — 4 chars/token approximation for budget tracking
- **Fallback chain** — Configurable fallback models in `config/bandit.json` that bypass UCB1 entirely
- **Modes registry** — Zoo Code compatible mode detection with profile bias multipliers
- **SQLite persistence** — `better-sqlite3` database with additive-only migrations
- **PWA dashboard** — Progressive web app with service worker, manifest, and install prompt
- **Session management** — 30m session TTL with stream affinity and idle reset

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Client (LLM Request)                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Express Reverse Proxy                    │
│  (src/index.mjs)                                              │
│  • CORS handling                                              │
│  • JSON body parsing (50mb limit)                             │
│  • WebSocket upgrade for dashboard                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              DiscountedUCB1Bandit (src/bandit.mjs)          │
│  • Model selection via UCB1 + profile multipliers           │
│  • Error classification & punishment                          │
│  • 5-strike ban system                                        │
│  • Exponential backoff cooldowns                              │
│  • Session affinity & stream tracking                         │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐  ┌─────────────────┐  ┌──────────────────┐
│ ProviderQuota│  │   HealthChecker │  │   Notifier       │
│ (quota mgt)  │  │ (model health)  │  │ (webhooks)       │
└──────────────┘  └─────────────────┘  └──────────────────┘
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐  ┌─────────────────┐  ┌──────────────────┐
│   SQLite     │  │  Punishment     │  │  StatsAggregator │
│  (better-sqlite3)│ │  Events (ring  │  │  (real-time stats│
│  models +    │  │   buffer)       │  │   for dashboard) │
│  models_train│  └─────────────────┘  └──────────────────┘
└──────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│                  Dashboard (public/dashboard.html)          │
│  • Live metrics, model tables, train tab                    │
│  • Punishment history (reverse chronological)               │
│  • WebSocket real-time updates                              │
└─────────────────────────────────────────────────────────────┘
```

## Core Modules

| Module | File | Responsibility |
|--------|------|----------------|
| Bandit Engine | [`src/bandit.mjs`](src/bandit.mjs) | Discounted UCB1 model selection, punishment, bans |
| Proxy Entry | [`src/index.mjs`](src/index.mjs) | Express server, WebSocket, request routing |
| Provider Quota | [`src/provider-quota.mjs`](src/provider-quota.mjs) | Rolling quota windows, background recovery |
| Health Check | [`src/health-check.mjs`](src/health-check.mjs) | Active model probing, auto-rehabilitation |
| Events | [`src/events.mjs`](src/events.mjs) | Punishment event system, ring buffer |
| Stats Aggregator | [`src/stats-aggregator.mjs`](src/stats-aggregator.mjs) | Real-time stats, per-model/provider tracking |
| Request Tracker | [`src/request-tracker.mjs`](src/request-tracker.mjs) | Active request tracking, recent request buffer |
| Modes Registry | [`src/modes-registry.mjs`](src/modes-registry.mjs) | Mode detection, profile multipliers |
| Log Throttle | [`src/log-throttle.mjs`](src/log-throttle.mjs) | Log deduplication, debug flags |
| Notifier | [`src/notifier.mjs`](src/notifier.mjs) | Slack/Discord/Telegram webhooks |

## Installation

### Prerequisites

- Node.js 18 or higher
- npm (bundled with Node.js)

### Steps

```bash
# Clone the repository
git clone https://github.com/CherrugDeveloper/omniroute-bandit-proxy.git
cd omniroute-bandit-proxy

# Install dependencies
npm install

# Copy environment example
cp .env.example .env

# Edit .env with your configuration
# (see Configuration section below)

# Start the proxy
npm start

# Or run in development mode with auto-reload
npm run dev
```

### Verify Installation

```bash
# Syntax check
npm run check

# Run test suite
npm test
```

## Configuration

### Environment Variables

Create a `.env` file based on `.env.example`. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Proxy server port |
| `BASE_URL` | `http://127.0.0.1:20128/v1` | Upstream LLM provider base URL |
| `API_TOKEN` | (none) | Authentication token for control API/dashboard |
| `PRICING_FILTER` | `none` | `none`, `free-only`, `paid-only`, `exclude-paid` |
| `EXPLOIT_ONLY` | `false` | Use only models with N≥3 observations |
| `EXCLUDE_THINKING` | `false` | Exclude thinking models from selection |
| `HEALTH_CHECK_INTERVAL_MS` | `300000` | Health check probe interval (5 minutes) |
| `HEALTH_CHECK_TIMEOUT_MS` | `10000` | Health check request timeout |
| `SESSION_TTL_MS` | `1800000` | Session TTL (30 minutes) |
| `STREAM_IDLE_MS` | `60000` | Stream idle timeout (60 seconds) |

### Bandit Configuration (`config/bandit.json`)

```json
{
  "fallbackModels": [
    "mistral/ministral-8b-latest",
    "groq/allam-2-7b"
  ],
  "errorConfig": {
    "degradationThreshold": 3,
    "rehabilitationPeriodMs": 172800000,
    "classification": {
      "transientErrors": [...],
      "permanentErrors": [...]
    }
  }
}
```

- **fallbackModels**: Chain of models used when bandit selection fails (bypasses UCB1)
- **degradationThreshold**: Consecutive 5xx errors (≥3) triggers degraded mode
- **rehabilitationPeriodMs**: Period after which banned models may be reconsidered
- **transientErrors**: Patterns mapped to temporary actions (cooldowns, flags)
- **permanentErrors**: Patterns mapped to permanent bans

### Provider Limits (`config/provider-limits.json`)

Defines per-provider rate limits, TPM/RPM quotas, and cost constraints used by `ProviderQuota`.

## Usage

### Basic Proxy Request

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mistral/mistral-small-latest",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 100
  }'
```

### Force a Specific Model

Use the `x-force-model` header to bypass bandit selection:

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "x-force-model: groq/llama-3.3-70b-versatile" \
  -H "Content-Type: application/json" \
  -d '{"model": "any-model", "messages": [...]}'
```

### Dashboard

Access the real-time dashboard at `http://localhost:3000/dashboard`:
- Live metrics (active models, rewards, latency, free/paid split)
- Model table with ban/cooldown status
- Train tab for training daemon control
- Punishment history with WebSocket real-time updates
- "What to do" modal for needs_attention providers

### Training Daemon

```bash
# Start training daemon
./scripts/train-ctl.sh start

# Check status
./scripts/train-ctl.sh status

# Stop training daemon
./scripts/train-ctl.sh stop

# View logs
./scripts/train-ctl.sh logs
```

### Scripts

| Script | Description |
|--------|-------------|
| `scripts/check-bans.mjs` | Inspect current model/provider bans |
| `scripts/check-catalog.mjs` | Validate model catalog |
| `scripts/check-db.mjs` | Database integrity check |
| `scripts/fix-db.mjs` | Repair database issues |
| `scripts/inspect-bans.mjs` | Detailed ban inspection |
| `scripts/reset-bans.mjs` | Reset all bans/cooldowns |
| `scripts/restart-safe.sh` | Safe restart procedure |
| `scripts/train-ctl.sh` | Training daemon control |

## API Reference

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/chat/completions` | POST | Proxy chat completion (bandit-routed) |
| `/v1/models` | GET | List available models from catalog |
| `/dashboard` | GET | Real-time monitoring dashboard |
| `/api/stats` | GET | JSON statistics (bans, cooldowns, flags) |
| `/api/events` | GET | Recent punishment events |
| `/api/health` | GET | Proxy health status |

### WebSocket Events

Connect to `ws://localhost:3000` for real-time punishment events:

| Event | Description |
|-------|-------------|
| `ban-model` | Model permanently banned |
| `ban-provider` | Provider permanently banned |
| `cooldown-model` | Model placed in cooldown |
| `cooldown-provider` | Provider placed in cooldown |
| `flag-provider` | Provider flagged for attention |
| `critical-failure` | Critical failure recorded |
| `degraded` | Model entered degraded mode |

## Punishment System

### 5-Strike Rule

1. Critical failure (403, 429) → strike counter increments
2. 5 consecutive critical failures → permanent ban
3. Success resets the counter to 0
4. `safeWrite` errors are NOT critical
5. Paid models: group ban guard prevents re-banning already permanently banned models

### Exponential Backoff Cooldowns

| Strike | Cooldown Duration |
|--------|-------------------|
| 1st | 15 seconds |
| 2nd | 5 minutes |
| 3rd | 30 minutes |
| 4th | 2 hours |
| 5th | Permanent ban |

### Degraded Mode

When `consecutive_5xx ≥ 3`, a model enters degraded mode:
- Score multiplied by 0.3 (reduced priority)
- Auto-rehabilitates on first success

### Error Classification

| Error Pattern | Action | Scope | Duration |
|---------------|--------|-------|----------|
| timeout | cooldown-model | model | 10 min |
| 5xx / server-error | cooldown-model | model | 30s |
| rate limit / 429 | cooldown-model | model | 5 min |
| 401 / auth expired | flag-provider | provider | 24h |
| 402 / insufficient funds | flag-provider | provider | 24h |
| 403 / key limit | ban-provider | provider | permanent |
| 502/503 / misconfigured | cooldown-provider | provider | 30 min |
| safeWrite errors | cooldown-model | model | 5 min |

## Database

- **Engine**: `better-sqlite3` (Synchronous SQLite)
- **File**: `bandit.db` (gitignored)
- **Tables**: `models`, `models_train`, `provider_history`, `catalog`
- **Migrations**: Additive-only (`ADD COLUMN` in `_migrateDB`)
- **Production reads**: `models` + `0.3 * models_train` (when N < 1)
- **Sync**: `models` and `provider_history` stay in sync via `recordFeedback()`

## Token Estimation

- **Rate**: 4 characters per token
- Used for budget tracking and cost estimation across providers

## Session & Stream Management

| Setting | Value | Description |
|---------|-------|-------------|
| `SESSION_TTL_MS` | 30 minutes | Session lifetime |
| `STREAM_IDLE_MS` | 60 seconds | Stream idle timeout (resets on any chunk/heartbeat) |

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'feat: add some feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

### Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | Changelog Section | Example |
|--------|-------------------|---------|
| `feat` | Added | `feat(bandit): add degraded mode` |
| `fix` | Fixed | `fix(dashboard): resolve metrics sync` |
| `docs` | Changed | `docs: update README` |
| `chore` | Changed | `chore(deps): update better-sqlite3` |
| `refactor` | Changed | `refactor: simplify error classification` |
| `test` | Changed | `test: add bandit unit tests` |
| `perf` | Changed | `perf: optimize dashboard polling` |
| `style` | Changed | `style: fix formatting` |
| `build` | Changed | `build: update CI config` |
| `ci` | Changed | `ci: add test workflow` |
| `revert` | Changed | `revert: remove deprecated feature` |
| `wip` | Changed | `wip: work in progress` |

Security-related commits (matching `security|auth|token|401|403|ban|punish|cooldown`) are highlighted in the **Security** section.

## Versioning

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) (SemVer v2.0.0).

- Current version: **1.30.0**
- Tags: `v0.1.0` through `v0.42.0` (development history), `v1.30.0` (current release)
- Changelog: [`CHANGELOG.md`](CHANGELOG.md) — follows [Keep a Changelog v1.1.0](https://keepachangelog.com/en/1.1.0/)

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/issues)
- **Documentation**: [`docs/`](docs/) directory
- **Examples**: [`examples/`](examples/) directory
