# OmniRoute Bandit Proxy

**Multi-Armed Bandit reverse proxy for LLM traffic** — intelligently routes requests across multiple LLM providers and models using a Discounted UCB1 bandit algorithm with real-time learning and adaptive exploration.

---

## Features

- **Bandit-based Model Selection**: Discounted UCB1 algorithm (discount factor 0.99 per event) with 30s rank cache TTL
- **Multi-Provider Support**: OpenAI, Anthropic, Groq, OpenRouter, and custom OpenAI-compatible endpoints
- **Provider Quota Management**: Atomic RPM/RPD limit enforcement with minute/day rolling windows
- **Training Daemon**: Background process that continuously evaluates models and updates bandit scores
- **Error Classification**: 5-scope error handling (ban/cooldown/flag provider/model) with exponential backoff
- **Session Management**: 30m TTL sessions with streaming support (60s idle timeout, heartbeat reset)
- **Soft Bias System**: Profile multipliers that stack on UCB1 scores for preference steering
- **Real-time Dashboard**: Web UI with Models, Train, Scripts, Providers, Modes, and Consideration tabs
- **Live Log Streaming**: Real-time training log tail via `/v1/training/log-stream` endpoint

---

## Quick Start

### Prerequisites
- Node.js 18+
- API keys for desired providers (OpenAI, Anthropic, Groq, OpenRouter, etc.)

### Installation

```bash
git clone <repository-url>
cd omniroute-bandit-proxy
npm install
cp .env.example .env
# Edit .env with your provider API keys
npm start
```

The proxy starts on `http://localhost:8080` (configurable via `PORT` env var).

### Dashboard

Open `http://localhost:8080/dashboard.html` for the web UI.

---

## Configuration

### Environment Variables (`.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Proxy listening port | `8080` |
| `OPENAI_API_KEY` | OpenAI API key | — |
| `ANTHROPIC_API_KEY` | Anthropic API key | — |
| `GROQ_API_KEY` | Groq API key | — |
| `OPENROUTER_API_KEY` | OpenRouter API key | — |
| `CUSTOM_PROVIDERS` | JSON array of custom OpenAI-compatible providers | `[]` |
| `DB_PATH` | SQLite database path | `./data/bandit.db` |
| `AUTH_TOKEN` | Bearer token for API authentication | — |
| `SESSION_TTL_MS` | Session time-to-live | `1800000` (30m) |
| `STREAM_IDLE_MS` | Stream idle timeout | `60000` (60s) |

### Provider Limits (`config/provider-limits.json`)

Define RPM (requests per minute) and RPD (requests per day) per provider:

```json
{
  "openai": { "rpm": 3000, "rpd": 10000 },
  "anthropic": { "rpm": 1000, "rpd": 5000 },
  "groq": { "rpm": 600, "rpd": 10000 }
}
```

### Bandit Config (`config/bandit.json`)

Error pattern classification, fallback chain, and bandit parameters.

### Modes (`config/modes.json`)

Profile multipliers for soft bias (stack on UCB1 scores).

---

## API Endpoints

### Chat Completions
```
POST /v1/chat/completions
```
OpenAI-compatible endpoint. Routes to best model per bandit.

### Models
```
GET /v1/models?source=catalog|train|db&provider=&status=
```
List available models with filtering.

### Training
```
GET /v1/training/status
GET /v1/training/daemon-status
GET /v1/training/log-stream          # Live log streaming (ReadableStream)
POST /v1/training/reset
```

### Scripts Manager
```
GET  /v1/scripts
POST /v1/scripts/execute
GET  /v1/scripts/output/:pid
```

### Provider Quota
```
GET  /v1/providers/quota
POST /v1/providers/quota/reset
```

### Dashboard Stats
```
GET /v1/dashboard/stats
GET /v1/consideration
```

---

## Training Daemon

The training daemon runs in the background, continuously:
1. Selecting models via bandit (exploration/exploitation)
2. Sending test requests
3. Recording latency, success/failure, token usage
4. Updating UCB1 scores in `models_train` table

### Control Script
```bash
./scripts/train-ctl.sh start    # Start daemon
./scripts/train-ctl.sh stop     # Stop daemon
./scripts/train-ctl.sh restart  # Restart daemon
./scripts/train-ctl.sh status   # Show status
./scripts/train-ctl.sh logs     # Tail training.log
```

### Dashboard Integration
- **Training Status** card shows: active/inactive, cycle count, cumulative OK/fail, success rate
- **Scripts Tab** → "Log Training" quick action streams `training.log` live
- **Train Tab** shows model rankings from `models_train` (excludes control record)

---

## Database Schema

SQLite with additive-only migrations (`better-sqlite3`).

Key tables:
- `models` — Production model registry
- `models_train` — Training evaluations (includes control record `id='train-daemon'`)
- `provider_history` — Quota tracking, circuit breakers, punishment logs
- `sessions` — Streaming session state
- `request_tracker` — In-flight request correlation

---

## Error Handling & Punishment

### Classification Scopes
| Scope | Action | Use Case |
|-------|--------|----------|
| `ban-model` | Permanent model ban | Critical: 403, 429, timeout, safeWrite errors |
| `cooldown-model` | Temporary model cooldown | Transient: 413, TPM exceeded |
| `ban-provider` | Permanent provider ban | Auth failures, quota exhaustion |
| `cooldown-provider` | Temporary provider cooldown | Rate limits, connection errors |
| `flag-provider` | Soft flag | Warnings, degraded performance |

### 3-Strike System
Critical failures (403, 429, timeout, safeWrite) → permanent ban after 3 consecutive occurrences.
Counter resets on success.

### Exponential Backoff
Cooldowns: 15s → 5m → 30m → 2h → permanent.

### Emergency Relaxation
When all models filtered, falls back to all catalog/db models **respecting active cooldowns**.

---

## Dashboard Tabs

| Tab | Purpose |
|-----|---------|
| **Models** | Production model registry, quota, status, per-model reset |
| **Train** | Training model rankings, filters, cumulative metrics |
| **Scripts** | Script manager with running badges, live log streaming |
| **Providers** | Provider quota, RPM/RPD, reset controls |
| **Modes** | Signature & multiplier tables for soft bias |
| **Consideration** | Bandit decision log with filtering |
| **Logs** | System log viewer with source filters |

---

## Development

```bash
npm run dev       # Watch mode
npm run check     # Syntax check
npm test          # Run test suite (69 tests, in-memory SQLite)
```

### Test Structure
- `__tests__/bandit-config.test.js` — Error classification
- `__tests__/punishment-system.test.js` — Exponential backoff, 3-strike
- `__tests__/paid-model-group-punishment.test.js` — Paid model group bans
- `__tests__/request-tracker*.test.js` — Session tracking
- `__tests__/itpm-quota.test.js` — Token quota enforcement
- `__tests__/monitor.test.js` — Punishment monitor
- `__tests__/changelog*.test.js` — Changelog format validation

---

## Architecture

```
src/
├── index.mjs              # Express server, API routes, middleware
├── bandit.mjs             # DiscountedUCB1Bandit, model selection, training status
├── provider-quota.mjs     # RPM/RPD atomic quota enforcement
├── request-tracker.mjs    # In-flight request correlation
├── health-check.mjs       # Provider health monitoring
├── log-throttle.mjs       # Structured logging with suppression
├── modes-registry.mjs     # Profile multipliers, signatures
└── notifier.mjs           # Webhook/email notifications

scripts/
├── train-daemon.mjs       # Background training process
├── train-ctl.sh           # Daemon control (systemd-compatible)
├── restart-safe.sh        # Safe proxy restart with port cleanup
├── free-port-emergency.sh # Aggressive port 8080 release
└── check-*.mjs            # Diagnostic utilities

public/
└── dashboard.html         # Single-file dashboard (Vanilla JS, no build step)
```

---

## Deployment

### Systemd Service
```ini
# /etc/systemd/system/omniroute-bandit-proxy.service
[Unit]
Description=OmniRoute Bandit Proxy
After=network.target

[Service]
Type=simple
User=omniroute
WorkingDirectory=/opt/omniroute-bandit-proxy
ExecStart=/usr/bin/node src/index.mjs
Restart=on-failure
RestartSec=5
EnvironmentFile=/opt/omniroute-bandit-proxy/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now omniroute-bandit-proxy
```

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 8080
CMD ["node", "src/index.mjs"]
```

---

## Versioning

[Semantic Versioning 2.0.0](https://semver.org/) — See [CHANGELOG.md](CHANGELOG.md).

---

## License

MIT — See [LICENSE](LICENSE).