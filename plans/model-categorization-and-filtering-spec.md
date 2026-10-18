# Technical Specification: Model Categorization and Strict Filtering for Chat Completions

## 1. Executive Summary
This document outlines the architectural design and technical specification for robust model categorization (`chat_completion`, `image`, `audio`, `embedding`, etc.) during catalog synchronization and strict capability-based filtering during model selection in [`src/bandit.mjs`](src/bandit.mjs:1) and [`src/index.mjs`](src/index.mjs:1). It ensures that standard chat completion requests (including Zoo Code requests) exclusively route to models categorized as `chat_completion` and are strictly barred from selecting or falling back to image or audio generation models.

---

## 2. Review of Catalog Sync and Database Schema

### 2.1 Database Schema (`catalog` and `models` tables)
In [`src/bandit.mjs`](src/bandit.mjs:54), the SQLite schema includes:
- [`catalog`](src/bandit.mjs:94): Stores model metadata fetched from upstream (`id`, `provider`, `max_input_tokens`, `is_free`, `supports_tools`, `supports_image_generation`).
- [`models`](src/bandit.mjs:57): Stores bandit learning metrics (`N`, `sum_reward`, `fails`, `cooldown_until`, `permanent`, `degraded`, etc.) and joins with [`catalog`](src/bandit.mjs:94) during selection.

### 2.2 Current Catalog Sync (`fetchAndSyncModels`)
In [`src/bandit.mjs`](src/bandit.mjs:364), `fetchAndSyncModels()` fetches models from `/models`, filters out non-chat models (batch, embedding, rerank, moderation, STT/TTS without chat/omni keywords), and inserts them into [`catalog`](src/bandit.mjs:94).

---

## 3. Capability and Category Tagging Mechanism

### 3.1 Schema Enhancements
We introduce a unified capability tagging column or explicit capability flags in the [`catalog`](src/bandit.mjs:94) table:
- `capability` TEXT DEFAULT 'chat_completion' (Values: `chat_completion`, `image`, `audio`, `embedding`, `rerank`, `moderation`).
- `supports_chat` INTEGER DEFAULT 1
- `supports_image_generation` INTEGER DEFAULT 0
- `supports_audio_generation` INTEGER DEFAULT 0

Migration in [`src/_migrateDB()`](src/bandit.mjs:122) will add `capability` and `supports_audio_generation` columns additively.

### 3.2 Enhanced Classification in [`fetchAndSyncModels()`](src/bandit.mjs:364)
During catalog sync:
1. **Embedding / Rerank / Moderation**: Detected via regex (`embed`, `embedding`, `rerank`, `moderation`, `batch`) -> skipped or tagged accordingly.
2. **Audio / Speech (TTS / STT)**: Detected via regex (`tts`, `speech`, `stt`, `whisper`, `voice`, `audio`) -> tagged as `audio` unless `omni`/`chat`/`multimodal` is present.
3. **Image Generation**: Detected via regex (`dall-e`, `stable-diffusion`, `imagen`, `sdxl`, `flux`, `midjourney`, `image-generation`, `aihorde`, `playground`, `image`) or model `type === 'image'` -> tagged as `image`, `supports_image_generation = 1`, `supports_chat = 0`.
4. **Chat Completion**: Default category (`chat_completion`), `supports_chat = 1`, `supports_image_generation = 0`, `supports_audio_generation = 0`.

---

## 4. Strict Filtering Logic for Chat Completions

### 4.1 Model Selection in [`selectModel()`](src/bandit.mjs:1398)
When processing `POST /v1/chat/completions`, `selectModel()` must enforce:
- `requireImageGeneration = false` (default for chat).
- Explicit exclusion check: Any model where `capability != 'chat_completion'` or `supports_image_generation == 1` or `supports_audio_generation == 1` or matching image/audio/embedding regex patterns is unconditionally rejected with rejection reason `'image_model_excluded_from_chat'` or `'non_chat_model_excluded'`.
- Fallback rejection: In [`src/index.mjs`](src/index.mjs:1580), fallback models from [`config/bandit.json`](config/bandit.json:1) must also be verified against [`catalog`](src/bandit.mjs:94) to ensure they have `supports_image_generation != 1` and `supports_audio_generation != 1` before being used in chat completion fallback chains.

---

## 5. Architecture Workflow (Mermaid)

```mermaid
graph TD
    A[POST /v1/chat/completions] --> B[Select Model with UCB1]
    B --> C{Model Capability Check}
    C -->|Is Image/Audio/Embedding| D[Reject: Non-Chat Capability]
    C -->|Is Chat Completion| E[Execute Upstream Request]
    E -->|Success| F[Record Feedback (Reward 1)]
    E -->|Failure / Error| G[Classify Error & Cooldown/Ban]
    G --> H{Exhausted All Chat Models?}
    H -->|Yes| I[Check Fallback Chain]
    I --> J{Fallback Model Supports Chat?}
    J -->|No| K[Skip Fallback Model]
    J -->|Yes| L[Route to Fallback Chat Model]
```

---

## 6. Summary of Implementation Steps
1. Update [`_initDB()`](src/bandit.mjs:54) and [`_migrateDB()`](src/bandit.mjs:122) to include `capability` and capability flags.
2. Refine [`fetchAndSyncModels()`](src/bandit.mjs:364) classification logic to tag `chat_completion`, `image`, `audio`, etc.
3. Enforce strict capability filtering in [`selectModel()`](src/bandit.mjs:1398) and fallback processing in [`src/index.mjs`](src/index.mjs:1).
4. Add comprehensive unit & integration tests in [`tests/`](tests/) validating that image and audio models never receive chat traffic.
