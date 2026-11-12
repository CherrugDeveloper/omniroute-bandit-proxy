# OmniRoute Bandit Proxy

> An intelligent AI proxy router using a **Discounted UCB1 Multi-Armed Bandit** algorithm to dynamically select the best-performing free AI model across multiple providers in real time.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Proxy](#running-the-proxy)
- [Testing](#testing)
- [API Endpoints](#api-endpoints)
- [Dashboard](#dashboard)
- [Punishment System](#punishment-system)
- [Training Mode](#training-mode)
- [Quota Management](#quota-management)
- [Session Management](#session-management)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Discounted UCB1 Bandit**: Dynamically selects top-performing models; rewards decay at 0.99 per event.
- **Multi-Provider Support**: OpenRouter, Gemini, Groq, NVIDIA, and custom providers out of the box.
- **3-Strike Punishment System**: Exponential backoff cooldowns (15 s → 5 m → 30 m → 2 h → permanent ban) after consecutive critical failures.
- **Provider-Level Quota Enforcement**: Atomic RPM/RPD checks per provider with minute and day windows.
- **Real-Time Dashboard**: WebSocket-powered live monitoring of model performance, provider health, and punishment events.
- **Training Mode**: Isolated `models_train` table for safe model evaluation without polluting production UCB1 scores.
- **Soft Bias (profileMultiplier)**: Apply per-model or per-profile score multipliers without hard bans.
- **Session & Stream Management**: 30-minute session TTL; 60-second stream idle timeout with auto-reset on any chunk.
- **Fallback Chain**: Configurable fallback list in `config/bandit.json` that bypasses the UCB1 ranker.

---

## Architecture

```
Client Request
      │
      ▼
 src/index.mjs          ← Express/HTTP entry point, WebSocket server
      │
      ▼
 src/bandit.mjs         ← DiscountedUCB1Bandit, DB layer (better-sqlite3), punishment engine
      │
      ├── src/provider-quota.mjs   ← Atomic RPM/RPD quota checks
      ├── src/request-tracker.mjs  ← In-memory + DB request log ring buffer
      ├── src/modes-registry.mjs   ← Profile/mode multiplier registry
      ├── src/health-check.mjs     ← Provider liveness probes
      ├── src/notifier.mjs         ← Event emission for WebSocket push
      └── src/log-throttle.mjs     ← Log-rate limiting for noisy paths
```

**Database**: `bandit.db` (SQLite via `better-sqlite3`). Migrations are additive-only (`ADD COLUMN`).

---

## Prerequisites

- **Node.js** ≥ 18 (ESM support required)
- **npm** ≥ 9
- At least one provider API key (see `.env.example`)

---

## Installation

```bash
git clone https://github.com/YOUR_ORG/omniroute-bandit-proxy.git
cd omniroute-bandit-proxy
npm install
cp .env.example .env
# Edit .env with your provider API keys
```

---

## Configuration

| File | Purpose |
|---|---|
| `.env` | API keys and runtime environment variables |
| `config/bandit.json` | UCB1 parameters, error pattern → action mappings, fallback chain |
| `config/modes.json` | Profile definitions with `profileMultiplier` values |
| `config/provider-limits.json` | Per-provider RPM/RPD limits |

**Key `.env` variables:**

```dotenv
PORT=3000
DATABASE_PATH=bandit.db
SESSION_TTL_MS=1800000      # 30 minutes
STREAM_IDLE_MS=60000        # 60 seconds
```

---

## Running the Proxy

```bash
# Production
npm start

# Development (watch mode)
npm run dev

# Syntax check
npm run check
```

The proxy listens on the port defined by `PORT` (default `3000`).

---

## Testing

```bash
npm test
```

Tests use Node.js built-in `node:test` with an in-memory `:memory:` SQLite database so no external services are required.

To run a single test file:

```bash
node --test __tests__/bandit-config.test.js
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/chat/completions` | OpenAI-compatible chat completions proxy |
| `GET` | `/v1/models` | List available models (`?source=train` for training table) |
| `GET` | `/v1/dashboard/stats` | Aggregated bandit and provider metrics |
| `GET` | `/v1/providers` | Provider health and quota status |
| `POST` | `/v1/admin/ban` | Manually ban a model or provider |
| `POST` | `/v1/admin/reset` | Reset model or provider state |
| `WS` | `/ws` | WebSocket stream for real-time punishment/request events |

---

## Dashboard

Open `public/dashboard.html` in a browser (served at `/dashboard`) for:

- **Global Metrics**: Active models, cooldowns, bans, degraded count, catalog size.
- **Models Table**: UCB1 score, N, reward, cooldown timer, ban status per model.
- **Providers Tab**: Provider health, quota remaining, consecutive failures.
- **Punishment History**: Real-time feed of ban/cooldown/flag events via WebSocket.
- **Train Tab**: Training results from `models_train` with ok/fail/tested counts.

---

## Punishment System

The proxy implements a **3-strike rule** for critical failures (403 Forbidden, 429 Rate Limit, timeout, `safeWrite` errors):

| Failure Count | Action |
|---|---|
| 1 | Cooldown 15 s |
| 2 | Cooldown 5 m |
| 3 | **Permanent ban** |

Additional backoff levels for non-critical consecutive failures: 15 s → 5 m → 30 m → 2 h → permanent.

- `consecutive_critical_failures` resets to 0 on any success.
- Provider-level bans set `permanent = 1` in `provider_history` and apply a circuit breaker.

---

## Training Mode

Use the training daemon to evaluate models without polluting live UCB1 scores:

```bash
node scripts/train-daemon.mjs
```

Results are stored in `models_train`. Production reads `models` table and blends in `0.3 × models_train` rewards when `N < 1`.

---

## Quota Management

Quota enforcement is **provider-level** (not model-level). Two atomic windows are checked:

- **RPM** (requests per minute) — rolling 60-second window.
- **RPD** (requests per day) — calendar day window (UTC).

Configure limits in `config/provider-limits.json`. Quota resets are tracked in `provider_history`.

---

## Session Management

- **`SESSION_TTL_MS`** (default 30 min): Maximum session lifetime.
- **`STREAM_IDLE_MS`** (default 60 s): Stream idle timeout; resets on any chunk or heartbeat.

---

## Contributing

1. Fork the repository and create a feature branch.
2. Follow the existing ES module style (`.mjs` for Node scripts).
3. Write tests in `__tests__/` using `node:test`.
4. Use conventional commit format: `type(scope): subject`.
5. Run `npm test` and `npm run check` before submitting a PR.

---

## License

[MIT](LICENSE)
