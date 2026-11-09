# OmniRoute Bandit Proxy

A multi-armed bandit reverse proxy system for intelligent LLM traffic routing and load balancing.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)
- [Changelog](#changelog)

## Overview

OmniRoute Bandit Proxy implements a Multi-Armed Bandit algorithm for dynamic traffic routing across multiple LLM providers. The system continuously learns from traffic patterns and provider performance to optimize routing decisions, balancing cost, latency, and quality metrics.

### Key Characteristics

- **Adaptive Routing**: Uses DiscountedUCB1 bandit algorithm with 0.99 discount factor for temporal adaptation
- **Provider Intelligence**: Tracks success/failure patterns with exponential backoff cooldowns (15s → 5m → 30m → 2h → permanent)
- **Safety Mechanisms**: 3-strike aggressive punishment for critical failures (403, 429, timeouts, safeWrite errors)
- **Rate Limiting**: Per-provider quota management with atomic minute/day window checks
- **Session Persistence**: 30-minute session TTL with 60-second stream idle timeout
- **Event System**: Real-time punishment event streaming via WebSocket at `/v1/events`

## Features

### Traffic Management

- Multi-provider load balancing with configurable weight profiles
- Automatic failover and degraded mode on consecutive 5xx errors
- Real-time provider health monitoring
- Session affinity with graceful degradation

### Bandit Algorithm

- DiscountedUCB1 implementation with 0.99 event discount factor
- 30-second cache TTL for ranking computations (`_rankCache`)
- Profile multiplier stacking for soft bias optimization
- Separate training data table (`models_train`) with production read merging (0.3 × training if N < 1)

### Database Layer

- SQLite via better-sqlite3 for embedded storage
- Schema migrations restricted to ADD COLUMN operations only
- Isolated `models_train` table for training data
- Automatic model registration and cleanup

### Error Handling

- Five classification scopes: ban, cooldown, flag, degraded, retry
- Error pattern mapping for immediate model banning (including `safeWrite` errors)
- Consecutive failure tracking with automatic reset on success
- `consecutive_5xx` triggers degraded mode

### Monitoring & Dashboard

- Web-based monitoring dashboard at `/dashboard.html`
- Real-time statistics and provider status
- Request history and session tracking
- Unified Chronology panel with selection history
- WebSocket-based log streaming

## Installation

### Prerequisites

- Node.js 18.0.0 or higher
- npm 9.0.0 or higher
- SQLite 3.x (automatically installed via better-sqlite3)

### Clone and Install

```bash
git clone https://github.com/your-username/omniroute-bandit-proxy.git
cd omniroute-bandit-proxy
npm install
```

### Environment Setup

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Edit `.env` with your configuration values:

```env
# Provider API Keys
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
GOOGLE_API_KEY=your-google-key

# Server Configuration
PORT=8080
SESSION_TTL_MS=1800000
STREAM_IDLE_MS=60000

# Database Path
DB_PATH=./data/proxy.db
```

## Quick Start

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

### Syntax Check

```bash
npm run check
```

### Run Tests

```bash
npm test
```

## Configuration

### Main Configuration Files

| File | Description |
|------|-------------|
| `config/provider-limits.json` | Provider-level rate limits (minute/day windows) |
| `config/bandit.json` | Bandit algorithm parameters and fallback chains |
| `src/provider-quota.mjs` | Provider quota management logic |

### Bandit Configuration

The `config/bandit.json` file contains:

- Fallback chains that bypass UCB1 calculations
- Error patterns mapped to ban-model actions
- Discount factor and cache TTL settings

Example configuration structure:

```json
{
  "patterns": {
    "safeWrite|cannot access safeWrite|safeWrite before initialization|safeWrite is not initialized": "ban-model"
  }
}
```

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Request                            │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              Session Manager (30m TTL)                      │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│               Bandit Router (DiscountedUCB1)                │
│              - 0.99 discount factor                         │
│              - 30s _rankCache TTL                           │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              Provider Quota Manager                         │
│              - Atomic minute/day window checks              │
│              - Exponential backoff cooldowns                │
│              - 3-strike aggressive punishment           │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              Provider Selection & Proxy                     │
│              - Fallback chains                              │
│              - Error handling                               │
│              - STREAM_IDLE_MS = 60s                         │
└─────────────────────────────────────────────────────────────┘
```

### Database Schema

The system uses two main tables:

1. **`models`** - Production model information (id, provider, N, sum_reward, fails, degraded, cooldown_until, permanent)
2. **`models_train`** - Isolated training data (merged 0.3× if N < 1)

Schema migrations are restricted to `ADD COLUMN` operations only.

### Error Classification System

The system classifies errors into five scopes:

1. **ban** - Immediate model blocking (403 forbidden, 429 rate limit, timeout, safeWrite errors trigger 3-strike system → permanent ban)
2. **cooldown** - Temporary suspension with exponential backoff
3. **flag** - Non-blocking issue marking
4. **degraded** - Reduced functionality mode (score × 0.3)
5. **retry** - Automatic retry logic

### Cooldown Algorithm

Exponential backoff progression:
- First failure: 15 seconds
- Second consecutive: 5 minutes  
- Third consecutive: 30 minutes
- Fourth consecutive: 2 hours
- Fifth+: Permanent ban (3-strike system for critical failures)

### 3-Strike Punishment System

Aggressive punishment for critical failures (403 forbidden, 429 rate limit, timeout, safeWrite errors):
- Permanent ban after 3 consecutive critical failures
- `consecutive_critical_failures` counter tracks the streak
- Counter resets on success

## Usage

### Basic Proxy Usage

The proxy acts as a drop-in replacement for LLM API calls:

```bash
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4", "messages": [...]}'
```

### Monitoring Commands

```bash
# Check database integrity
node scripts/check-db.mjs

# Inspect bans
node scripts/inspect-bans.mjs

# Reset provider state
node scripts/reset-providers.mjs

# Check specific provider catalog
node scripts/check-catalog.mjs
```

### Dashboard Access

Navigate to `http://localhost:8080/dashboard.html` for real-time metrics including:
- Provider status and response times
- Request distribution
- Model performance statistics
- Session tracking
- Training daemon status

## API Reference

### Core Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/chat/completions` | POST | Chat completions proxy |
| `/v1/completions` | POST | Text completions proxy |
| `/v1/models` | GET | Available models list (supports `?source=prod` or `?source=train`) |
| `/v1/metrics` | GET | Bandit metrics and summary |
| `/v1/dashboard/stats` | GET | Dashboard statistics (includes modelsActive, modelsCooldown, modelsBanned, etc.) |
| `/v1/providers` | GET | Provider status and health |
| `/v1/quota` | GET | Per-provider quota limits |
| `/v1/active` | GET | Active request count (no auth required) |
| `/v1/inflight` | GET | In-flight requests count (no auth required) |
| `/v1/events/punishment` | WebSocket | Real-time punishment events stream (bans, cooldowns, degradation) |

### Reset Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/reset/model/{model}` | POST | Reset specific model state |
| `/v1/reset/provider/{provider}` | POST | Reset specific provider state |
| `/v1/reset/counters` | POST | Reset all counters |
| `/v1/block/model/{id}` | POST | Permanently ban model |
| `/v1/unblock/model/{id}` | POST | Unban model |
| `/v1/provider/retry/{p}` | POST | Retry provider |
| `/v1/provider/ignore/{p}` | POST | Ignore provider |

### Training Daemon Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/training/status` | GET | Training daemon status |
| `/v1/training/daemon-status` | GET | Daemon process status |
| `/v1/reset/training` | POST | Reset training data |

### Using the API

#### REST API Examples

The proxy server runs on port **20128** by default.

```bash
# Fetch dashboard statistics
curl http://localhost:20128/v1/dashboard/stats

# Get available models from production catalog
curl http://localhost:20128/v1/models?source=prod

# Get provider quota information
curl http://localhost:20128/v1/quota
```

#### WebSocket Event Monitoring

The proxy provides real-time punishment event streaming via WebSocket. This is useful for monitoring when models or providers are banned due to critical failures (403, 429, timeouts, safeWrite errors) or consecutive 5xx errors.

**Endpoint:** `ws://localhost:20128/v1/events/punishment`

**Event Types:**
- `ban-model` - Model permanently banned (3 consecutive critical failures)
- `ban-provider` - Provider permanently banned
- `cooldown` - Model/provider on exponential backoff (15s → 5m → 30m → 2h → permanent)

See `examples/monitor.mjs` for a complete implementation with error handling.

#### Running Example Scripts

Example scripts demonstrating API usage are available in the `examples/` directory:

```bash
# Monitor real-time punishment events (shows all ban/cooldown events)
node examples/monitor.mjs

# Fetch and display current dashboard statistics
node examples/stats.mjs
```

**Output Example for `monitor.mjs`:**
```
Connecting to ws://127.0.0.1:20128/v1/events/punishment...
Connected to punishment stream.
Received punishment event: {
  "type": "cooldown",
  "provider": "openai",
  "model": "gpt-4",
  "reason": "5xx error rate exceeded threshold",
  "until": "2024-01-15T10:30:00.000Z"
}
```

## Testing

### Test Suite Structure

The project uses Node.js built-in test runner with comprehensive test coverage:

- Bandit algorithm behavior
- Provider quota management
- Request tracking and memory
- Error handling and punishment systems
- Training feedback mechanisms
- Dashboard metrics calculations

### Run All Tests

```bash
npm test
```

### Test Categories

| Test File | Focus |
|-----------|-------|
| `bandit-config.test.js` | Configuration patterns and error mapping |
| `changelog.test.js` | CHANGELOG.md format validation |
| `provider-quota.test.js` | Quota enforcement and timing |
| `request-tracker.test.js` | Session tracking and memory |
| `punishment-system.test.js` | Error classification and banning |
| `training-feedback.test.js` | Training data collection |
| `monitor.test.js` | Monitoring functionality |
| `proxy-improvements.test.js` | Proxy enhancements |
| `itpm-quota.test.js` | ITPM quota handling |

### Test Environment

Tests use in-memory SQLite databases (`:memory:`) for isolation and speed.

## Development

### Project Structure

```
omniroute-bandit-proxy/
├── src/                    # Core source files
│   ├── index.mjs           # Entry point
│   ├── bandit.mjs          # Bandit algorithm
│   ├── provider-quota.mjs  # Provider management
│   ├── request-tracker.mjs # Session tracking
│   └── ...
├── config/                  # Configuration files
│   ├── bandit.json         # Bandit parameters
│   ├── provider-limits.json # Rate limits
│   └── ...
├── scripts/                # Utility scripts
├── __tests__/              # Test suite
├── public/                 # Dashboard and static files
└── config/                 # Application configuration
```

### Development Scripts

```bash
# Watch mode for development
npm run dev

# Syntax validation
npm run check

# Run tests
npm test
```

### Code Style

- Modern JavaScript (ES modules)
- Consistent indentation (2 spaces)
- JSDoc comments for complex functions
- Semantic versioning commit messages

## Contributing

### Development Workflow

1. Fork and clone the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Run tests: `npm test` (all tests must pass)
5. Format your commit message using conventional commits: `type(scope): subject`
6. Push and create a pull request

### Commit Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation update
- `refactor`: Code refactoring
- `test`: Test addition or modification
- `chore`: Maintenance tasks

### Pull Request Process

1. Ensure all tests pass
2. Update CHANGELOG.md if applicable
3. Update README.md if documentation changes
4. Request review from maintainers

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and changes.

---

### Citation

If you use OmniRoute Bandit Proxy in your research, please cite:

```
OmniRoute Bandit Proxy: Multi-Armed Bandit LLM Traffic Routing
Version 1.28.17
https://github.com/your-username/omniroute-bandit-proxy
```

### Acknowledgments

- Built with [Express.js](https://expressjs.com/)
- Database layer uses [better-sqlite3](https://github.com/WiseLib/better-sqlite3)
- Web interface powered by vanilla JavaScript
- Testing framework: [Node.js Test Runner](https://nodejs.org/api/test.html)