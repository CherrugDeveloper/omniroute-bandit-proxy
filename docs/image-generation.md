# OmniRoute Bandit Proxy - Image Generation Routing & Filtering Documentation

## Overview

OmniRoute Bandit Proxy includes robust support for **Image Generation** models and requests. This enables seamless handling of text-to-image workflows alongside standard LLM chat completions, leveraging the multi-armed bandit algorithm (`DiscountedUCB1Bandit`) to intelligently route requests to the best available image generation models.

---

## 1. Catalog Synchronization & Detection

During startup and catalog synchronization (`fetchAndSyncModels` in [`src/bandit.mjs`](src/bandit.mjs:365)), models retrieved from OmniRoute are inspected for image generation capabilities:
- **API Capabilities**: Checks if the upstream model object specifies `capabilities.image_generation === true` or `type === "image"`.
- **Pattern Matching**: Automatically identifies image generation models based on model ID regex patterns:
  - `dall-e`
  - `stable-diffusion`
  - `midjourney`
  - `flux` / `flux-schnell` / `flux-dev`
  - `imagen`
  - `sdxl` / `sd-xl`
  - `playground`
- **Database Schema**: The `catalog` table features a `supports_image_generation` integer flag (`0` or `1`), added automatically via additive migration (`_migrateDB`).

---

## 2. API Endpoints

### [`POST /v1/images/generations`](src/index.mjs:1)
An OpenAI-compatible endpoint dedicated to image generation requests.

**Request Body Example:**
```json
{
  "prompt": "A futuristic cyberpunk city at sunset",
  "model": "dall-e-3", // Optional; if omitted, bandit selects the best available image model
  "n": 1,
  "size": "1024x1024",
  "response_format": "url" // or "b64_json"
}
```

**Response Format:**
Returns standard OpenAI image generation format or converts seamlessly into chat completion responses when invoked via chat fallback paths.

---

## 3. Chat/Completions Image Generation Detection & Handling

When requests arrive at `POST /v1/chat/completions`, the proxy inspects the payload via [`isImageGenerationRequest()`](src/index.mjs:1) to determine if image generation is requested:
1. **Explicit Prompt**: `prompt` field is present while `messages` is absent/empty.
2. **Image Parameters**: Presence of `n`, `size` (`\d+x\d+`), or `response_format` combined with an image model pattern.
3. **Intent Keywords**: Natural language prompt detection in user messages (e.g., `"generate image"`, `"create image"`, `"draw"`, `"paint"`, `"make a picture"`, `"text to image"`).

When detected, the proxy routes the request through image-generation model selection and upstream endpoints (`/images/generations`).

---

## 4. Filtering Logic

During model selection (`selectModel()` in [`src/bandit.mjs`](src/bandit.mjs:1411)):
- When `requireImageGeneration = true`, `filterModels()` strictly filters out any model where `supports_image_generation !== 1`.
- Conversely, standard chat completions exclude image-generation-only models unless specifically requested, preventing image models from being incorrectly selected for text chat tasks.
