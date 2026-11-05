# OmniRoute Bandit Proxy

**v1.19.2 - 2026-11-v1.19.3 - 2026-11-v1.19.4 - 2026-11-v1.19.5 - 2026-11-05)** - Multi-Armed Bandit reverse proxy router for dynamic LLM traffic distribution with enhanced cooldown management and aggressive punishment system

## Overview

OmniRoute Bandit Proxy is a middleware system that acts as a proxy between the Zoo Code VS Code extension and the omniroute proxy. It provides advanced model management capabilities for Zoo Code, featuring a discounted bandit-based model selection algorithm and dynamic scoring system. The proxy optimizes LLM request routing by balancing exploration and exploitation, providing detailed metrics and intelligent controls for traffic distribution.

## Key Features

### 1. Bandit Algorithm (Discounted UCB1)

The algorithm uses **Discounted UCB1** with a discount factor of `0.99` applied *per feedback event*, not per timestep. This means reward history decays faster under load.

- **Discounted update**: `N = N * 0.99 + 1` (success), `sum_reward = sum_reward * 0.99 + reward`
- **Reward function**: `reward = max(0, 1.0 - duration_sec / 30)`
  - 1s response → 0.97, 10s → 0.67, 30s+ → 0
- **Rank cache**: `_rankCache` with 30s TTL - model rankings are stale up to 30s after feedback
- **Fallback chain**: 6 models from `config/bandit.json` used without UCB1 scoring when no ranked models are available

### 2. Model Management

- **Catalog**: Complete pool of available models (rebuilt on every startup, includes `supports_tools` and `supports_image_generation` flags)
- **Models**: Models tried at least once (N, sum_reward, fails, cooldown, permanent, degraded)
- **Training models**: Training statistics (isolated from `models` — don't pollute production UCB1)
  - Training daemon writes to `models_train` (separate table)
  - `selectModel()` reads from `models` (prod) if N ≥ 1, otherwise uses `models_train × 0.3` as prior
  - Zero impact on Zoo Code behavior
- **Unified history**: Displayed in `public/dashboard.html` panel with expanded table height (114px, scrollable) and 7 columns

### 3. Session Affinity & Image Generation

- **Pin session**: `sessionKey = md5(system_prompt + first_user_message)`
- **TTL 30 min**: Pin valid for 30 minutes (`SESSION_TTL_MS` default 1800000)
- **Pin invalidation**: If pinned model fails (5xx, timeout), pin is removed
- **Strict image generation detection** in `isImageGenerationRequest()` (3 rules):
  1. **R1 - image model id**: `dall-e`, `stable-diffusion`, `midjourney`, `flux`, `imagen`, `sdxl`, `sd-xl`, `playground`, `aihorde` → always image request
  2. **R2 - payload shape**: `prompt` without `messages` → image request **only** if `n`/`size`/`response_format` present OR `model` missing entirely. A chat model (e.g., `gpt-4o`) with `prompt` field remains a normal chat completion
  3. **R3 - explicit intent**: explicit phrases (`generate image`, `text to image`, ...) OR regex `STRICT_IMAGE_INTENT_RE` requiring noun "image" immediately after verb (optional article + up to 2 adjectives)
- **Image generation support**: Automatic detection of `POST /v1/images/generations` requests or transparent conversion on chat completions

### 4. Mode System

- **14 Zoo Code modes**: Recognition by analyzing system prompt
- **Soft bias profiles**: Multiplier on UCB1 score per profile (multiplicative, not additive)
- **Auto-discovery**: Unseen prompts → saved to `config/modes.discovered.json`
- **3-tier detection**: 1) MD5 signature cache (`modes.signatures.json`) → 2) Regex from `config/modes.json` (14 modes) → 3) Unknown → auto-discovered and persisted

**Mode profiles and multipliers**:
- `code`: 1.35
- `reasoning`: 1.30
- `general`: 0.65
- `summarizer`: 2.5

### 5. Dashboard

- **Live Logs**: Streaming updated every second
- **Metrics**: Requests, observations, models, providers, errors
- **Modes**: Active signatures + pending discovery with Label/Dismiss buttons
- **Model Evaluation Snapshot**: Integration in top panel of `public/dashboard.html` for real-time display of model evaluations, considerations, and discard reasons
- **Provider percentage metrics**: "Healthy providers" (active/monitored %) and "Operational models" (active/monitored %) with color coding
- **Unified history table**: Container height 114px, overflow-y: auto. 7 columns with specified widths:
  - Timestamp: 10%
  - Provider: 10%
  - Model: 16%
  - Status: 8%
  - Error Type: 12%
  - Countermeasure: 14%
  - Reason / Stats: 30%
- **Unified History panel**: Persistent panel with "Show selection history" checkbox and "📋 Copy all" button
- **Filters**: Exclude Thinking (default ON), Exploit Only (default OFF)

#### Status Badges

| Badge | Meaning |
|-------|---------|
| Active | In pool, selectable |
| Cooldown | Temporarily excluded, timer active |
| Degraded | Reduced score due to recent transient errors |
| Needs Config | Configuration issue (auth, CLI, Playwright) |
| Ignored | Permanently disabled (ban or manual action) |

### 6. Bandit Behavior

#### Reward

`reward = max(0, 1.0 - duration_sec / 30)`

1s response → 0.97, 10s → 0.67, 30s+ → 0

#### UCB1 Update (with discount)

`N = N * 0.99 + 1` (success)

`sum_reward = sum_reward * 0.99 + reward`

#### Enhanced Cooldown Management

- **Exponential backoff cooldowns** for consecutive 5xx/SSE failures:
  - 1st failure: 15s cooldown
  - 2nd consecutive failure: 5 minutes
  - 3rd consecutive failure: 30 minutes
  - 4th consecutive failure: 2 hours
  - 5+ consecutive failures: permanent ban
- **`total_failures`** tracking per model with cap at 50
- **Emergency relaxation** now respects cooldown bans (only bypasses for last resort)
- **Consecutive 5xx counter resets** on successful request
- **safeWrite initialization error pattern**: Added to `config/bandit.json` matching "safeWrite|cannot access safeWrite|safeWrite before initialization|safeWrite is not initialized" → ban-model scope

#### Aggressive 3-Strike Punishment System

- **`consecutive_critical_failures`**: New counter tracking critical error sequences
- **Critical failures** include: HTTP 403 (banned accounts, key limits), HTTP 429 (repeated rate limiting), timeouts, `safeWrite` errors, and payment/funding issues
- **3-strike rule**: Permanent ban after 3 consecutive critical failures
- **Counter reset**: `consecutive_critical_failures` resets to 0 on successful requests
- **Database migration**: Automatic schema migration adds the tracking column to existing databases

## Development

### Prerequisites

- Node.js >= 22.0.0
- npm

### Installation

```bash
npm install
```

### Scripts

- `npm start` - Start the proxy server
- `npm run dev` - Start development server with watch mode
- `npm run check` - Syntax check all source files
- `npm run test` - Run tests
- `npm run auto-git` - Automated Git versioning, changelog generation, and documentation updates

## Dashboard

Access the web dashboard at `http://localhost:8080/dashboard.html` when the server is running. The dashboard provides real-time metrics, logs, and model management capabilities.

## Database

The project uses `better-sqlite3` for SQLite database operations. Schema migrations only support `ADD COLUMN` operations for adding new columns to existing tables.

## Error Classification

The system handles 5 classification scopes for error management:
1. **ban** - Permanent exclusion from rotation
2. **cooldown** - Temporary exclusion with exponential backoff
3. **flag** - Mark for review (monitoring only)
4. **degraded** - Reduced score due to transient errors
5. **ignored** - Manually disabled or permanently banned

## Quota System

- **Provider-level quotas** (not model-level): Atomic checks of minute/day windows
- Quota violations trigger `cooldown-model` with 5-minute duration

## Session Management

- **SESSION_TTL_MS**: 30 minutes
- **STREAM_IDLE_MS**: 60 seconds (reset on any chunk/heartbeat)

## References

- [Keep a Changelog v1.1.0](https://keepachangelog.com/en/1.1.0/)
- [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)

## Full Change Log

For detailed change history, see the [CHANGELOG.md](CHANGELOG.md) file.

## License

See [LICENSE](LICENSE) file for details.
