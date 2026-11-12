# Orchestrator Mode — OmniRoute Bandit Proxy AGENTS.md

Non-obvious, project-specific guidance for operational workflows.

## Service & Daemon Management
- Production server binds to `127.0.0.1:8080`; start via [`npm start`](package.json:1) or [`omniroute-bandit-proxy.service`](omniroute-bandit-proxy.service:1).
- Training daemon (`train-daemon.mjs`) manages isolated round-robin writes to `models_train`; controlled via [`scripts/train-ctl.sh`](scripts/train-ctl.sh:1). Modes: `prod`, `train-gentle`, `train`, `stop`.
- Mode switching via [`scripts/switch-mode.sh`](scripts/switch-mode.sh:1).

## Database & Training
- `better-sqlite3`; migrations are additive-only (`ADD COLUMN` in `_migrateDB`).
- Isolated `models_train` table; production reads `models` + `0.3*models_train` (when `N < 1`).
- `models` and `provider_history` stay in sync on bans/cooldowns via `recordFeedback()`.
- Coordinate manual db scripts ([`scripts/check-db.mjs`](scripts/check-db.mjs:1), [`scripts/inspect-db.mjs`](scripts/inspect-db.mjs:1)) to avoid lock contention with running proxy or training daemon.

## Quota
- Provider-level quota; atomic minute+day window check; background roller runs every 60s even without requests.

## Error Classification & Punishment
- `config/bandit.json` maps `safeWrite|cannot access safeWrite|safeWrite before initialization|safeWrite is not initialized` to **ban-model**.
- **3-strike system**: 3 consecutive critical failures (403, 429, safeWrite errors) → permanent ban. `consecutive_critical_failures` counter resets on success.
- Timeout errors are **transient (cooldown-model)**, NOT critical.
- `consecutive_5xx ≥ 3` triggers degraded mode.
- Exponential backoff cooldowns: 15s → 5m → 30m → 2h → permanent.

## Dashboard
- [`public/dashboard.html`](public/dashboard.html:1): table height 114px; column widths (Error Type 12%, Countermeasure 14%, Reason 30%); model names stripped of provider prefix.
