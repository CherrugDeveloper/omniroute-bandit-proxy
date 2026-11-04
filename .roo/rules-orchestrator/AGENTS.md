# Orchestrator Mode - OmniRoute Bandit Proxy AGENTS.md

## Multi-Domain Coordination & Operational Workflows

### 1. Service & Daemon Management
- **Production Server**: Start via [`npm start`](package.json:1) or systemd service [`omniroute-bandit-proxy.service`](omniroute-bandit-proxy.service:1) binding to `127.0.0.1:8080`.
- **Development Watcher**: Run via [`npm run dev`](package.json:1) (`--watch` mode).
- **Training Daemon (`train-daemon.mjs`)**: Manages isolated round-robin training writes to `models_train` table. Controlled via [`scripts/train-ctl.sh`](scripts/train-ctl.sh:1).
- **Mode Switching Utility**: [`scripts/switch-mode.sh`](scripts/switch-mode.sh:1) handles transitions between `prod`, `train-gentle`, `train`, and `stop`.

### 2. Monitoring & API Integration Workflows
- **Dashboard UI**: Single-file web interface in [`public/dashboard.html`](public/dashboard.html:1) providing tabs for Live Logs, Models, Training, Modes, Provider Quota, and Script Manager (`GET /v1/scripts/*`).
- **Health Verification**: Periodic probing via [`src/health-check.mjs`](src/health-check.mjs:1) and [`scripts/verify-server.mjs`](scripts/verify-server.mjs:1).
- **Notifications**: [`src/notifier.mjs`](src/notifier.mjs:1) dispatches webhooks to Slack, Discord, Telegram, and generic endpoints with 5-min event+subject throttling.

### 3. Cross-Domain Task Execution Rules
- **Database Concurrency**: Coordinate any manual db scripts [`scripts/check-db.mjs`](scripts/check-db.mjs:1) / [`scripts/inspect-db.mjs`](scripts/inspect-db.mjs:1) to avoid lock contention with running proxy or training daemon.
- **Environment Configuration**: Ensure required variables (e.g. `OMNIROUTE_API_KEY`, `DASHBOARD_TOKEN`) are properly configured from [`.env.example`](.env.example:1) before deployment or testing.
- **Recent Changes**: Exponential backoff cooldowns now respect configured limits; `total_failures` tracking affects cooldown decisions.

### 4. Security & Error Pattern Updates
- **Error Pattern**: `config/bandit.json` now maps `safeWrite|cannot access safeWrite|safeWrite before initialization|safeWrite is not initialized` to ban-model

### 5. Dashboard Updates
- **Table Dimensions**: `public/dashboard.html` table height adjusted to 114px; column widths modified (Error Type 12%, Countermeasure 14%, Reason 30%); model names stripped of provider prefix
