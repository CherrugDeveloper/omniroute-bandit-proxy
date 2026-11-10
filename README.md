# OmniRoute Bandit Proxy

A Multi-Armed Bandit reverse proxy for LLM traffic optimization and punishment management.

## Description

OmniRoute Bandit Proxy implements a contextual multi-armed bandit algorithm for intelligent routing of Large Language Model (LLM) API requests. It dynamically selects the optimal provider and model based on performance feedback, cost considerations, and failure patterns.

## Features

- **Multi-Armed Bandit Routing**: Uses Discounted Upper Confidence Bound (UCB1) algorithm with 0.99 discount factor for adaptive model selection
- **Real-time Metrics**: WebSocket-based live updates for dashboard monitoring
- **Punishment System**: Automatic handling of critical failures with 3-strike aggressive punishment
- **Training Feedback**: Operational metrics tracking without UCB1 score pollution
- **Provider Quotas**: Atomic minute and day window quota checking
- **Emergency Relaxation**: Tiered fallback system for handling model unavailability

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm 8+
- Database file (SQLite)

### Installation

```bash
npm install
```

### Configuration

1. Copy environment template:
```bash
cp .env.example .env
```

2. Edit `.env` with your configuration:
```env
BANDIT_DB=./bandit.db
BANDIT_PORT=3000
```

3. Configure `config/bandit.json` for model catalog and routing rules

### Running

Start the server:
```bash
npm start
```

Development mode (with watch):
```bash
npm run dev
```

Check syntax:
```bash
npm run check
```

Run tests:
```bash
npm run test
```

## Architecture

### Core Components

| Component | File | Description |
|-----------|------|-------------|
| Bandit Router | `src/bandit.mjs` | Main UCB1 bandit implementation |
| Event System | `src/events.mjs` | WebSocket events and punishment logging |
| Provider Quota | `src/provider-quota.mjs` | RPM/RPD quota management |
| Request Tracker | `src/request-tracker.mjs` | Request lifecycle tracking |
| Health Check | `src/health-check.mjs` | Provider health monitoring |

### Database Schema

The system uses SQLite with additive-only migrations (`ADD COLUMN`):

| Table | Purpose |
|-------|---------|
| `models` | Model configurations and UCB1 scores |
| `models_train` | Training feedback (isolated from production) |
| `punishment_events` | Audit trail of all punishment events |
| `provider_history` | Daily/hourly request counts and quota state |
| `request_logs` | Historical request records |

### Punishment System

The 3-strike system tracks consecutive critical failures:

| Failure Type | Classification | Action |
|--------------|---------------|--------|
| 403 Forbidden | `ban-model` | Permanent model ban after 3 strikes |
| 429 Rate Limit | `flag-provider` | Triggers cooldown/punishment |
| Timeout | `cooldown-provider` | Progressive backoff cooldowns |
| safeWrite Errors | `ban-model` | Critical failure tracking |

**Cooldown Progression**: 15s → 5m → 30m → 2h → Permanent

**Reset Conditions**: Consecutive failures reset on success. Total failures tracked across all events.

### Error Classification

Error patterns are mapped in `config/bandit.json`:

| Pattern | Resulting Classification |
|---------|-------------------------|
| `account disabled|banned|suspended` | `ban-provider` |
| `429|rate limit` | `flag-provider` |
| `timeout` | `cooldown-provider` |
| `consecutive_5xx ≥ 3` | `degraded` mode |

## API Endpoints

### Production Read Query
- Returns: models with 0.3*models_train blended scores (if N < 1)

### Active Requests
```
GET /v1/active
- Returns: current requests, recent punishments, active sessions
- Protected: Requires authentication
```

### Configuration
```
GET /v1/config/status
- Returns: current dashboard flags (excludePaid, onlyFree, etc.)

POST /v1/config/toggle
- Body: { flag: string, enabled: boolean }
- Toggles runtime configuration flags
```

## Dashboard

The web dashboard is available at the root path and provides:

| Tab | Purpose |
|-----|---------|
| **Logs** | Request history with filtering |
| **Models** | Model performance metrics |
| **Train** | Training daemon status |
| **Modes** | Current routing modes |
| **Providers** | Quota usage and status |
| **Scripts** | Training daemon management |
| **Consideration** | Unified history of punishments |

## Development

### Testing

Test suite runs with Node.js built-in test runner:
```bash
npm run test
```

All 75 tests pass, covering:
- Bandit algorithms
- Database operations
- Punishment system
- Quota management
- Request tracking

### Code Quality

```bash
npm run check  # Syntax validation
```

## Configuration Files

- `config/bandit.json` - Model catalog and routing configuration
- `config/provider-limits.json` - Provider-specific quota limits
- `config/modes.json` - Routing modes and multipliers

## License

MIT License - See LICENSE file for details.

## Version History

See [CHANGELOG.md](CHANGELOG.md) for version history following [Keep a Changelog](https://keepachangelog.com/) conventions.