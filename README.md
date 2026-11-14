# OmniRoute Bandit Proxy

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/Tests-10%20suites-blue.svg)](https://nodejs.org/)
[![Version](https://img.shields.io/badge/version-0.49.3-blue.svg)](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/releases/tag/v0.49.3)

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
| **Log Streaming** | `/v1/training/log-stream` endpoint detects file truncation/rotation and resets read position |
| **Provider Quota** | Background roller conditionally skips idle providers via `_hasPendingQuota()` check |
| **Stream Backpressure** | `safeWrite()` drain waits with configurable timeout (`STREAM_DRAIN_MS`, default 30s) |

====
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
│
[...7716 bytes omitted...]
g |
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

### Cascade Guards

Emergency rejection handling skips additional punishment when a model is already rejected due to cooldown or circuit breaker state (`model_cooldown`, `provider_cooled_down_this_request`, `provider_circuit_breaker`, `provider_cooldown`). This prevents a single provider failure from triggering simultaneous cooldowns across hundreds of models.

### 403 Key Limit Classification

Transient resetting key limits (most common) → `cooldown-model` (5 minute cooldown).
Non-resetting permanent limits (`lifetime limit`, `never resets`, `no reset`) → `ban-provider` (permanent).
Config pattern order matters — first match wins.

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
| client disconnect / abort | cooldown-model **skipped** | model | N/A |

Client disconnect/abort errors (e.g., "This operation was aborted") are now explicitly skipped in the stream and fetch catch blocks to prevent unfair model punishment. These errors do not indicate model faults and will not trigger cooldowns or bans.

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
| `STREAM_IDLE_MS` | 5 minutes | Stream idle timeout (resets on any chunk/heartbeat) |
| `STREAM_MAX_MS` | 10 minutes | Stream hard cap |

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

- Current version: **0.47.0**
- Tags: `v0.1.0` through `v0.47.0` (development history)
- Changelog: [`CHANGELOG.md`](CHANGELOG.md) — follows [Keep a Changelog v1.1.0](https://keepachangelog.com/en/1.1.0/)

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/issues)
- **Documentation**: [`docs/`](docs/) directory
- **Examples**: [`examples/`](examples/) directory
