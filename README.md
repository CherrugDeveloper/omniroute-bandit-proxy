# OmniRoute Bandit Proxy

A high-performance, multi-armed bandit (MAB) reverse proxy for LLM traffic. This system optimizes model selection by balancing exploration (discovering better models) and exploitation (using the best-performing model) using the Discounted UCB1 algorithm.

## 🚀 Features

- **Discounted UCB1 Algorithm**: Dynamically ranks models based on success rates, with a discount factor to prioritize recent performance.
- **Dynamic Model Selection**: Automatically routes requests to the best available model while occasionally exploring others.
- **Automated Punishment System**:
  - **Exponential Backoff**: Models that fail are put on cooldown with increasing durations.
  - **5-Strike Rule**: 5 consecutive critical failures (403/429) lead to a permanent ban.
  - **Cascade Guards**: Prevents simultaneous banning of entire provider groups; skips ALL punishment when a provider is already on cooldown/circuit/auth-expired or when rejection is due to capability mismatches (non-chat models, no tools support, token limits exceeded, thinking excluded, dynamic max tokens exceeded) to avoid cascade effects.
  - **Model-Not-Found Classification**: 400 errors indicating a model is not found in the active live catalog are classified as `ban-model` (PERMANENT) instead of `cooldown-model` (TRANSIENT), preventing repeated attempts on unavailable models.
- **Real-time Dashboard**: PWA-enabled interface for monitoring metrics, logs, provider health, and bandit rankings.
- **Error Classification**: Distinguishes between transient (retryable) and permanent errors via configurable patterns.
- **Training Mode**: Supports isolated training datasets to refine model rankings before production use.

## 🛠 Architecture

The proxy sits between the client and multiple LLM providers. It manages a local SQLite database to track model failures, success rates, and cooldowns.

- **Bandit Core**: Implements the UCB1 logic and manages the state of the `models` table.
- **Punishment Engine**: Monitors response status codes and applies cooldowns/bans.
- **Proxy Layer**: Handles HTTP requests, token estimation, and provider-specific API calls.
- **Event System**: Streams real-time punishment and status events to the dashboard via WebSockets.

### Error Classification Fixes (v0.53.4)

- **403 Key limit exceeded**: Now correctly classified as `ban-provider` (PERMANENT) instead of `cooldown-model` (TRANSIENT) when pattern matches "total limit". Fixed by adding `|total limit` to permanent error patterns in `config/bandit.json`.
- **Cascade guard extended**: Now includes `provider_quota_exhausted` and `provider_needs_attention` to prevent cascade punishments when the proxy is restarted and all providers are simultaneously cooled down.
- **Model sync reliability**: `fetchAndSyncModels()` timeout increased from 15s to 30s to ensure model catalog synchronization completes during service initialization.

### v0.53.5 Performance Improvements

- **Reduced polling intervals**: Dashboard training status polling reduced from 3s to 15s; refreshAll from 5s to 10s; fetchLogs and fetchActive from 2s to 5s.
- **API endpoint caching**: In-memory caching (5s TTL) added for `/v1/config/status`, `/v1/training/status`, and `/v1/training/daemon-status` endpoints to reduce redundant fetches.

### v0.53.8 Restart Scripts Optimization

- **Removed obsolete scripts**: Deleted `scripts/restart.sh` (race condition on port 8080) and `scripts/restart-restart.sh` (redundant wrapper).
- **Enhanced `restart-safe.sh`**: Added automatic dashboard refresh after backend restart via `curl /v1/dashboard/stats`.
- **VS Code Quick Actions**: Added `.vscode/settings.json` with quick actions for restart, free-port, switch-mode, and training operations.
- **Updated documentation**: `docs/restart-procedure.md` updated with removed scripts notes, dashboard refresh, and VS Code quick actions.

### Prerequisites
- Node.js 18+
- npm

### Quick Start
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure your environment:
   ```bash
   cp .env.example .env
   # Edit .env with your provider keys
   ```
4. Start the service:
   ```bash
   npm start
   ```

## 📊 API Endpoints

- `POST /v1/chat/completions`: The main proxy endpoint.
- `GET /v1/stats`: Returns aggregated bandit metrics.
- `GET /v1/models`: Returns current model rankings and status.
- `GET /v1/logs`: Retrieves proxy activity logs.

## 🧪 Testing

The project includes a comprehensive test suite covering the bandit logic and punishment system.

```bash
npm test
```

## 📜 License
Distributed under the MIT License. See `LICENSE` for more information.