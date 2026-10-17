# Chat/Completions Endpoint Image Generation Detection

## 1. Detection Logic Placement

Add image generation detection logic early in the `/v1/chat/completions` endpoint handler in `src/index.mjs`, right after the initial request processing but before token estimation and context compression.

## 2. Detection Criteria

A chat/completions request should be treated as an image generation request when:

### A. Explicit Image Generation Parameters Present
- `prompt` field is present (string or array) AND `messages` field is absent or empty
- `model` field specified and matches known image generation model patterns
- `n` (number of images) parameter present
- `size` parameter present with format like "256x256", "512x512", "1024x1024", etc.
- `response_format` parameter present with value "b64_json" or "url"

### B. Context Clues in Messages
- Last user message contains image generation keywords: "generate image", "create image", "draw", "paint", "make a picture of", etc.
- System prompt or user message contains explicit image generation instructions
- Messages contain only image-related content with no conversational context

## 3. Implementation Approach

### A. Helper Function: `isImageGenerationRequest`

Create a helper function near the top of `src/index.mjs` (after imports):

```javascript
/**
 * Detects if a chat/completions request is actually requesting image generation
 * @param {Object} body - Request body
 * @returns {boolean} - True if request is for image generation
 */
function isImageGenerationRequest(body) {
  // Check for explicit image generation parameters
  if (body.prompt && (!body.messages || body.messages.length === 0)) {
    return true;
  }

  // Check for image-specific parameters
  const hasImageParams =
    (body.n !== undefined && typeof body.n === 'number' && body.n > 0) ||
    (body.size && /^\d+x\d+$/.test(body.size)) ||
    (body.response_format && ['b64_json', 'url'].includes(body.response_format));

  if (hasImageParams && body.model) {
    const modelId = String(body.model).toLowerCase();
    const imageModelPatterns = [
      'dall-e', 'stable-diffusion', 'midjourney', 'flux',
      'imagen', 'sdxl', 'sd-xl', 'playground'
    ];
    if (imageModelPatterns.some(pattern => modelId.includes(pattern))) {
      return true;
    }
  }

  // Check messages for image generation intent
  if (Array.isArray(body.messages) && body.messages.length > 0) {
    const lastUserMessage = body.messages
      .filter(m => m.role === 'user')
      .pop();

    if (lastUserMessage && lastUserMessage.content) {
      const content = typeof lastUserMessage.content === 'string'
        ? lastUserMessage.content
        : JSON.stringify(lastUserMessage.content);

      const imageGenerationKeywords = [
        'generate image', 'create image', 'draw', 'paint',
        'make a picture', 'create a picture', 'generate picture',
        'text to image', 'image from text', 'create artwork',
        'generate artwork', 'make an image'
      ];

      return imageGenerationKeywords.some(keyword =>
        content.toLowerCase().includes(keyword));
    }
  }

  return false;
}
```

### B. Integration Point

Add the detection logic in the chat/completions endpoint around line 1068, after `bandit.recordRequest()` but before token estimation:

```javascript
app.post(["/v1/chat/completions", "/chat/completions"], async (req, res) => {
  const { stream } = req.body || {};
  const requestId = newRequestId();

  trackRequestStart(requestId, {
    source: (req.get("x-source") === "training") ? "training" :
            (req.get("x-source") === "changelog") ? "changelog" : "zoo",
    model: null,
    attempt: 0,
    stream: !!stream,
    status: "starting",
    clientIp: req.ip || req.connection?.remoteAddress || "?"
  });

  // Cleanup a fine richiesta (success, error, disconnect)
  res.once("finish", () => { trackRequestComplete(requestId); trackRequestEnd(requestId); });
  res.once("close", () => { trackRequestComplete(requestId); trackRequestEnd(requestId); });
  const baseUrl = sanitizeBaseUrl(process.env.OMNIROUTE_BASE_URL, "http://127.0.0.1:20128/v1");
  const apiKey = process.env.OMNIROUTE_API_KEY;

  bandit.recordRequest(); // +1 per ogni richiesta ricevuta

  // === IMAGE GENERATION DETECTION ===
  const isImageGenRequest = isImageGenerationRequest(req.body);
  if (isImageGenRequest) {
    // Redirect to image generation endpoint logic
    return handleImageGenerationRequest(req, res, requestId, baseUrl, apiKey);
  }

  // === Stima token e (eventuale) auto-compress del contesto ===
  let estimatedTokens = bandit.estimateTokens(req.body);
  // ... rest of existing code
```

### C. Handler Function: `handleImageGenerationRequest`

Create a new function that handles image generation requests by delegating to the new `/v1/images/generations` endpoint logic:

```javascript
async function handleImageGenerationRequest(req, res, requestId, baseUrl, apiKey) {
  // Implement similar logic to the new images/generations endpoint
  // But reuse existing infrastructure where possible
  // This could simply call the images/generations endpoint handler
  // Or reuse core logic from both endpoints
}
```

Alternatively, for simpler implementation, we could:
1. Modify the existing chat/completions endpoint to route image generation requests through the same model selection logic but with `requireImageGeneration=true`
2. Then proceed with normal processing but ensure the upstream call goes to an image generation capable endpoint

## 4. Model Selection Integration

When `isImageGenRequest` is true, modify the model selection call:

```javascript
// In the model selection section (around line 1424):
const requireImageGeneration = isImageGenRequest;
model = await bandit.selectModel(excluded, estimatedTokens, requireTools, requireImageGeneration, profile, cooledDownThisRequest);
```

And ensure the fallback logic also respects the image generation requirement.

## 5. Upstream Call Modifications

For image generation requests, the upstream call needs to go to the provider's image generation endpoint rather than chat/completions:

```javascript
// In the upstream call section (around line 1560):
const endpointUrl = isImageGenRequest
  ? buildEndpointUrl(baseUrl, "/images/generations")
  : buildEndpointUrl(baseUrl, "/chat/completions");

const r = await fetch(endpointUrl, {
  method: "POST",
  headers,
  body: JSON.stringify({ ...requestBody, model, stream: !!stream }), // Adjust body as needed for image gen API
  signal: controller.signal
});
```

## 6. Response Handling

Image generation responses have a different format than chat completions:
- OpenAI image generation API returns `{ data: [{ url: "...", b64_json: "..." }], created: ..., }`
- Need to transform or pass through as appropriate

## Files to Modify
- src/index.mjs: Add helper function and modify chat/completions endpoint (lines ~1047-1600)

## Key Considerations
- Maintain backward compatibility - existing chat/completions requests should work unchanged
- Proper error handling for malformed image generation requests
- Logging and metrics for image generation requests
- Session affinity considerations for image generation requests