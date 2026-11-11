# OmniRoute Bandit Proxy

A Multi-Armed Bandit reverse proxy for intelligent LLM traffic routing, load balancing, and model performance optimization.

## Features
- **Intelligent Routing**: Uses a Discounted UCB1 Multi-Armed Bandit algorithm to select the best-performing LLM models based on real-time feedback (TTFT, throughput).
- **Error Handling**: Implements a 5-scope error classification system (ban, cooldown, flag, etc.) and aggressive 3-strike punishment system for critical failures.
- **Real-time Monitoring**: Integrated WebSocket-based dashboard for tracking model performance, punishment events, and training status.
- **Resilience**: Features automatic fallback routing and in-memory/SQLite-backed state management.
- **PWA Ready**: Optimized for progressive web application usage.

## Prerequisites
- Node.js (Latest LTS recommended)
- `npm`

## Installation
```bash
npm install
```

## Running the Proxy
- **Production**: `npm start`
- **Development**: `npm run dev`

## Testing
```bash
npm run test
```

## Architecture
OmniRoute uses an isolated training feedback loop (`models_train` table) and combines it with production metrics (`models`) for dynamic model selection, applying a `profileMultiplier` for soft biasing of model selection.

## Documentation & Contributing
For more information, refer to the project's internal documentation and AGENTS.md files.

## License
MIT
