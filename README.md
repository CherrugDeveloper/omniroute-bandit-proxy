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

## Features

### Traffic Management
- Multi-provider load balancing with configurable weight profiles
- Automatic failover and degraded mode on consecutive 5xx errors
- Real-time provider health monitoring

### Bandit Algorithm
- DiscountedUCB1 implementation with 0.99 event discount factor
- 30-second cache TTL for ranking computations
- Profile multiplier stacking for soft bias optimization

### Database Layer
- SQLite via better-sqlite3 for embedded storage
- Schema migrations restricted to ADD COLUMN operations only
- Separate training data table with production read merging (0.3 * training if N < 1)

### Error Handling
- Five classification scopes: ban, cooldown, flag, degraded, retry
- Error pattern mapping for immediate model banning
- Consecutive failure tracking with automatic reset on success

### Monitoring & Dashboard
- Web-based monitoring dashboard at `/dashboard.html`
- Real-time statistics and provider status
- Request history and session tracking

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

1. **`models`** - Production model information
2. **`models_train`** - Isolated training data (merged 0.3x if N < 1)

Schema migrations are restricted to `ADD COLUMN` operations only.

### Error Classification System

The system classifies errors into five scopes:

1. **ban** - Immediate model blocking
2. **cooldown** - Temporary suspension with exponential backoff
3. **flag** - Non-blocking issue marking
4. **degraded** - Reduced functionality mode
5. **retry** - Automatic retry logic

### Cooldown Algorithm

Exponential backoff progression:
- First failure: 15 seconds
- Second consecutive: 5 minutes
- Third consecutive: 30 minutes
- Fourth consecutive: 2 hours
- Fifth+: Permanent ban

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

## Testing

### Test Suite Structure

The project uses Node.js built-in test runner with 75 tests covering:

- Bandit algorithm behavior
- Provider quota management
- Request tracking and memory
- Error handling and punishment systems
- Training feedback mechanisms

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
4. Run tests: `npm test`
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

1. Ensure all 75 tests pass
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
Version 1.28.15
https://github.com/your-username/omniroute-bandit-proxy
```

### Acknowledgments

- Built with [Express.js](https://expressjs.com/)
- Database layer uses [better-sqlite3](https://github.com/WiseLib/better-sqlite3)
- Web interface powered by vanilla JavaScript
- Testing framework: [Node.js Test Runner](https://nodejs.org/api/test.html)