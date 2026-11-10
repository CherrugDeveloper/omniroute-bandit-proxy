# OmniRoute Bandit Proxy

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.28.17-blue)](https://github.com/CherrugDeveloper/omniroute-bandit-proxy/releases)

A Multi-Armed Bandit reverse proxy for LLM traffic with intelligent routing, real-time monitoring, and automated error handling.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Dashboard](#dashboard)
- [Error Handling & Punishment System](#error-handling--punishment-system)
- [Provider Quota Management](#provider-quota-management)
- [Training Daemon](#training-daemon)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

## Overview

OmniRoute Bandit Proxy is a sophisticated reverse proxy that intelligently routes LLM API requests across multiple providers using a Discounted Upper Confidence Bound (UCB1) multi-armed bandit algorithm. It provides real-time monitoring, automated error handling with 3-strike punishment, and a web-based dashboard for comprehensive observability.

## Features

- **Intelligent Model Selection**: UCB1 algorithm with discount factor (0.99/event) for dynamic model routing
- **Real-time Dashboard**: Web-based PWA dashboard with live metrics, logs, and controls
- **3-Strike Punishment System**: Aggressive punishment for critical failures (403 forbidden, 429 rate limit, timeout, safeWrite errors)
- **Exponential Backoff Cooldowns**: Progressive cooldown periods (15s → 5m → 30m → 2h → permanent)
- **Provider Quota Management**: RPM/RPD tracking with atomic minute and day window checks
- **Session Affinity**: Configurable session persistence with 30-minute TTL
- **WebSocket Support**: Real-time script output streaming via WebSocket
- **Training Daemon**: Automated model evaluation with live log streaming
- **Error Classification**: 5-scope error handling (ban, cooldown, flag, degraded, provider)
- **Degraded Mode**: Models with consecutive 5xx errors receive 0.3x score multiplier

## Installation

### Prerequisites

- Node.js 18.x or higher
- npm 9.x or higher
- A supported LLM provider API key (OpenAI, Anthropic, Google, etc.)

### Setup

```bash
# Clone the repository
git clone https://github.com/CherrugDeveloper/omniroute-bandit-proxy.git
cd omniroute-bandit-proxy

# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env with your configuration
```

### Configuration

The `.env` file supports the following variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 8080 |
| `API_TOKEN` | API authentication token | - |
| `SESSION_TTL_MS` | Session TTL in milliseconds | 1800000 (30m) |
| `STREAM_IDLE_MS` | Stream idle timeout | 60000 (60s) |
| `LOG_LEVEL` | Logging verbosity | info |

Provider configuration is managed in `config/provider-limits.json`:

```json
{
  "provider": {
    "rpm": 100,
    "rpd": 10000,
    "exp": {
      "rpm": 10,
      "rpd": 100
    }
  }
}
```

### Bandit Configuration

Configure routing behavior in `config/bandit.json`:

```json
{
  "bandit": {
    "discount": 0.99,
    "rankCacheTtlMs": 30000,
    "profileMultiplier": 1.0
  }
}
```

## Usage

### Start the Proxy

```bash
# Production mode
npm start

# Development mode (with watch)
npm run dev
```

### API Endpoint

All LLM requests are proxied through the root endpoint:

```bash
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Dashboard Access

Open `http://localhost:8080/dashboard` in your browser. The dashboard is a Progressive Web App (PWA) with offline support.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    OmniRoute Bandit Proxy                   │
├─────────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │   Client   │──│   Index    │──│   Bandit   │            │
│  │   Request  │  │ Middleware │─▶│  Selector  │            │
│  └────────────┘  └────────────┘  └────────────┘              │
│                                                  │            │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────┐  │
│  │ Dashboard  │  │  Notifier  │  │ Request    │  │ DB    │  │
│  │    UI      │  │   Service  │  │  Tracker   │─▶│       │  │
│  └────────────┘  └────────────┘  └────────────┘  └───────┘  │
│                    │                                         │
│                    ▼                                         │
│            ┌──────────────┐                                  │
│            │   Upstream   │──▶ Provider APIs (OpenAI,       │
│            │   Proxy      │     Anthropic, Google, etc.)    │
│            └──────────────┘                                  │
└─────────────────────────────────────────────────────────────┘
```

### Core Components

1. **DiscountedUCB1Bandit** (`src/bandit.mjs`): Multi-armed bandit algorithm for model selection
2. **Express Server** (`src/index.mjs`): Main proxy server with middleware pipeline
3. **Request Tracker**: Tracks request metrics, errors, and feedback
4. **Punishment System**: Manages model/provider bans and cooldowns
5. **Quota Manager**: Tracks provider-level RPM/RPD limits
6. **Training Daemon** (`scripts/train-daemon.mjs`): Automated model evaluation

## API Reference

### Health Check

```
GET /health
```

Returns server health status.

### Models Catalog

```
GET /v1/models
```

Returns available models with metadata including:
- `id`: Model identifier
- `created`: Creation timestamp
- `expires`: Expiration timestamp
- `n`: Observation count
- `avg`: Average response time
- `rewards`: Success rate data

Query parameters:
- `source`: `all` | `catalog` | `train` (default: `all`)

### Reset Endpoints

```
POST /resetProvider?name=provider-name
POST /resetModel?model=model-id
POST /resetAll
```

Reset provider, model, or global counters.

### Training Control

```
POST /training/start
POST /training/stop
GET  /training/status
GET  /training/logs
```

Control the training daemon and retrieve status/logs.

## Dashboard

The web-based dashboard provides:

- **Top Panel**: Current model metrics, session info, and controls
- **Models Tab**: Available models with UCB1 scores, observation counts, and latency metrics
- **Providers Tab**: Provider status, quota usage, and cooldown information
- **Training Tab**: Training daemon controls and live log streaming
- **Logs Tab**: Real-time request logs with filtering by type
- **Scripts Tab**: Execution controls for maintenance scripts

### Dashboard Metrics

- **Reward**: Success rate per model
- **Latency**: Average response time
- **Score**: UCB1 selection score
- **N**: Number of observations
- **Degraded**: Models with 0.3x score penalty

## Error Handling & Punishment System

### Error Classification

Errors are classified into 5 scopes:

1. **ban**: Permanent model/provider ban
2. **cooldown**: Temporary unavailability
3. **flag**: Provider attention required
4. **degraded**: Reduced performance mode
5. **provider**: Provider-level issues

### 3-Strike System

Critical failures trigger permanent bans after 3 consecutive occurrences:
- HTTP 403 (Forbidden)
- HTTP 429 (Rate Limit)
- Request timeout
- safeWrite errors

The `consecutive_critical_failures` counter tracks streaks and resets on successful requests.

### Exponential Backoff

Cooldown progression:
1. 15 seconds
2. 5 minutes
3. 30 minutes
4. 2 hours
5. Permanent ban

### Error Patterns

Configured in `config/bandit.json`:
```json
{
  "errorPatterns": {
    "ban-model": [
      "safeWrite",
      "cannot access safeWrite",
      "safeWrite before initialization",
      "safeWrite is not initialized"
    ]
  }
}
```

## Provider Quota Management

The proxy enforces per-provider quotas:

| Metric | Description | Window |
|--------|-------------|--------|
| RPM | Requests Per Minute | Rolling 60 seconds |
| RPD | Requests Per Day | Rolling 24 hours |

Quota checks are atomic and occur before model selection. Exceeded quotas result in provider cooldown.

## Training Daemon

The training daemon automatically evaluates models:

```bash
# Manual control
POST /training/start   # Start daemon
POST /training/stop    # Stop daemon
GET  /training/status  # Check status

# WebSocket log streaming
wss://localhost:8080/ws/training-logs
```

Key features:
- Round-robin model evaluation
- Automatic 404 detection with permanent flag
- Live log streaming via WebSocket
- Status heartbeat every 30 seconds

## Development

### Project Structure

```
omniroute-bandit-proxy/
├── src/
│   ├── index.mjs           # Main server
│   ├── bandit.mjs          # UCB1 bandit algorithm
│   ├── events.mjs          # Event system
│   ├── health-check.mjs    # Health check utilities
│   ├── log-throttle.mjs    # Logging throttling
│   ├── modes-registry.mjs  # Mode detection
│   ├── notifier.mjs        # Notification service
│   ├── provider-quota.mjs  # Quota tracking
│   ├── request-tracker.mjs # Request tracking
├── scripts/
│   ├── train-daemon.mjs    # Training daemon
│   ├── check-*.mjs         # Utility scripts
│   └── auto-git.mjs        # Git automation
├── public/
│   ├── dashboard.html      # Web dashboard
│   ├── sw.js               # Service worker
│   └── manifest.json       # PWA manifest
├── config/
│   ├── bandit.json         # Bandit settings
│   └── provider-limits.json # Quota configuration
└── __tests__/              # Test suite
```

### Code Standards

- ES Modules (type: "module" in package.json)
- Modern JavaScript (ES2022+)
- Consistent indentation (2 spaces)
- Comments for complex logic
- Functions focused and well-named

## Testing

### Run Tests

```bash
# Run all tests
npm run test

# Run specific test file
node --test __tests__/bandit-config.test.js

# Check syntax
npm run check
```

### Test Suite

| File | Description |
|------|-------------|
| `bandit-config.test.js` | Bandit configuration tests |
| `changelog.test.js` | CHANGELOG validation |
| `punishment-system.test.js` | 3-strike punishment tests |
| `proxy-improvements.test.js` | Proxy routing tests |
| `training-feedback.test.js` | Training daemon tests |

### Test Helpers

- `makeBandit()`: Creates isolated bandit instance with in-memory DB
- `seedCatalog()`: Seeds catalog with test models

## Deployment

### Systemd Service

```ini
# /etc/systemd/system/omniroute-bandit-proxy.service
[Unit]
Description=OmniRoute Bandit Proxy
After=network.target

[Service]
Type=simple
User=webserver
Group=webserver
WorkingDirectory=/opt/omniroute-bandit-proxy
ExecStart=/usr/bin/node src/index.mjs
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .

ENV NODE_ENV=production
EXPOSE 8080

CMD ["npm", "start"]
```

### Nginx Reverse Proxy

```nginx
server {
    listen 443 ssl;
    server_name localhost;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm run test`
5. Commit with conventional format: `feat(scope): subject`
6. Push and create a Pull Request

### Commit Convention

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting, missing semicolons, etc.
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance, build tasks

Reference files using `[filename:line]` format in commit bodies.

## License

MIT License - see [LICENSE](LICENSE) file for details.

### License Text

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

**Version**: 1.28.17  
**Last Updated**: 2026-11-10  
**Maintainer**: CherrugDeveloper