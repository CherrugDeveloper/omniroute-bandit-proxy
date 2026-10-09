# Architect Mode - OmniRoute Bandit Proxy AGENTS.md

## Architect Mode Specific Instructions

### System Architecture Overview

The OmniRoute Bandit Proxy is a Multi-Armed Bandit reverse proxy router for dynamic LLM traffic distribution. It intelligently routes requests to different LLM providers based on performance metrics and feedback.

### Core Components

#### 1. Bandit Algorithm (`src/bandit.mjs`)
- **Class**: `DiscountedUCB1Bandit`
- **Algorithm**: Discounted UCB1 for model selection
- **Key Methods**:
  - `getModelRank()`: Ranks models with 30-second cache
  - `selectModel()`: Combines catalog and database models, preferring database models
  - `_classifyError()`: Comprehensive error classification with specific actions
  - `recordFeedback()`: Records success/failure feedback for models

#### 2. Main Server (`src/index.mjs`)
- **Framework**: Express.js
- **Endpoints**:
  - `POST /v1/chat/completions` - Main proxy endpoint
  - `GET /v1/metrics` - Metrics endpoint (auth required)
  - `POST /v1/reset/provider/:p` - Reset provider
  - `POST /v1/provider/retry/:p` - Clear provider attention
- **Features**:
  - Session affinity (24h TTL)
  - Health checks every 5 minutes
  - Request validation and compression
  - Fallback model support

#### 3. Health Checker (`src/health-check.mjs`)
- **Interval**: Every 5 minutes (configurable)
- **Batch Size**: 20 models per check
- **Timeout**: 15 seconds per check
- **Function**: Revives models that become available again

#### 4. Modes Registry (`src/modes-registry.mjs`)
- **Purpose**: Manages different operational modes
- **Features**: Profile detection, mode switching

#### 5. Notifier (`src/notifier.mjs`)
- **Purpose**: Sends notifications for events
- **Supports**: Webhooks, Telegram
- **Throttling**: 5 minutes between same event notifications

### Data Flow

1. **Request Incoming** → `POST /v1/chat/completions`
2. **Model Selection** → `bandit.selectModel()` with session affinity
3. **Upstream Request** → Forward to selected provider
4. **Response Validation** → Validate response quality
5. **Feedback Recording** → `bandit.recordFeedback()` with success/failure
6. **Error Classification** → `_classifyError()` determines action
7. **Provider Management** → Ban, cooldown, or flag providers

### Database Schema

#### Tables
1. **models**: Individual model performance tracking
   - `id`, `provider`, `N`, `sum_reward`, `fails`, `cooldown_until`, `permanent`, `last_used_index`, `consecutive_5xx`, `degraded`, `degraded_since`, `is_paid`

2. **provider_history**: Provider status and attention flags
   - `provider`, `fails`, `cooldown_until`, `pointer`, `permanent`, `needs_attention`, `attention_reason`, `attention_message`

3. **catalog**: Model metadata from OmniRoute API
   - `id`, `provider`, `max_input_tokens`, `is_free`, `supports_tools`

4. **meta**: Global counters
   - `key`, `value`

5. **models_train**: Training-specific model data
   - `id`, `provider`, `N`, `sum_reward`, `last_used_index`

### Key Design Patterns

#### 1. Discounted UCB1 Bandit
- Uses exponential discounting for recent rewards
- 30-second cache for model rankings
- Combines exploration and exploitation

#### 2. Error Classification System
- Classifies errors by HTTP status and message content
- Actions: ban-provider, ban-model, cooldown-provider, cooldown-model, flag-provider
- Different cooldown strategies for different error types

#### 3. Provider Management
- Provider-level and model-level error handling
- Attention flags for non-blocking warnings
- Automatic recovery via health checks

#### 4. Session Affinity
- Maintains model selection per session
- 24-hour TTL for sessions
- Automatic cleanup of expired sessions

### Configuration Management

#### Environment Variables
- `OMNIROUTE_API_KEY`: API key for OmniRoute
- `OMNIROUTE_BASE_URL`: Base URL for OmniRoute API
- `PORT`: Server port (default: 8080)
- `UPSTREAM_TIMEOUT_MS`: Upstream timeout (default: 60000)
- `DATABASE_PATH`: Database path (default: bandit.db)
- `DASHBOARD_TOKEN`: Auth token for control APIs
- `HEALTH_CHECK_ENABLED`: Enable health checks (default: true)
- `EXCLUDE_PAID`: Exclude paid models
- `ONLY_FREE`: Only use free models
- `EXCLUDE_THINKING`: Exclude thinking models
- `EXPLOIT_ONLY`: Only exploit known good models

#### Database Migrations
- Handled in `_migrateDB()` method
- New columns added via ALTER TABLE
- Automatic on startup

### Performance Considerations

1. **Caching**: 30-second cache for model rankings
2. **Database Indexes**: Proper indexing on frequently queried columns
3. **Health Checks**: Every 5 minutes, batch size 20
4. **Session Cleanup**: Every 5 minutes
5. **Connection Pooling**: Single SQLite connection

### Scalability Considerations

1. **Single Instance**: Currently designed for single instance
2. **Database**: SQLite (file-based, not distributed)
3. **State**: In-memory session state
4. **Horizontal Scaling**: Would require shared database and session store

### Security Considerations

1. **Authentication**: Optional dashboard token for control APIs
2. **Input Validation**: Request validation for chat completions
3. **Rate Limiting**: Not implemented (relies on upstream)
4. **Data Privacy**: Logs may contain request/response data

### Monitoring & Observability

1. **Metrics Endpoint**: `/v1/metrics` with auth
2. **Health Checks**: Automatic model revival
3. **Logging**: Console logs with structured format
4. **Training Log**: Separate `training.log` for training events

### Deployment Considerations

1. **Process Management**: Use systemd or PM2
2. **Environment**: Node.js 22+
3. **Dependencies**: better-sqlite3 requires native compilation
4. **Configuration**: Environment variables or .env file

### Future Architecture Improvements

1. **Distributed Deployment**: Shared database, Redis for sessions
2. **Advanced Bandit Algorithms**: Thompson Sampling, LinUCB
3. **Real-time Metrics**: WebSocket for live dashboard
4. **A/B Testing**: Built-in A/B testing framework
5. **Multi-region**: Geographic routing