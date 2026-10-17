# POST /v1/images/generations Endpoint Design

## Overview
Create a new endpoint for image generation requests that follows the same pattern as the chat/completions endpoint but routes to image generation models only.

## Request Format (OpenAI-compatible)
```json
{
  "prompt": "A beautiful sunset over the ocean",
  "model": "dall-e-3", // optional, if not provided will use bandit selection
  "n": 1, // number of images to generate (default: 1)
  "size": "1024x1024", // image size (default: 1024x1024)
  "quality": "standard", // or "hd" for dall-e-3
  "style": "vivid", // or "natural" for dall-e-3
  "response_format": "url", // or "b64_json"
  "user": "optional-user-id"
}
```

## Implementation Details

### 1. Route Registration
Add to src/index.mjs after the chat/completions endpoint:
```javascript
app.post("/v1/images/generations", async (req, res) => {
  // Image generation endpoint implementation
});
```

### 2. Request Processing Steps
Similar to chat/completions but adapted for image generation:

#### A. Setup and Tracking
- Generate request ID
- Start request tracking
- Set up cleanup handlers for disconnect/finish

#### B. Parameter Extraction and Validation
- Extract `prompt` (required)
- Extract optional parameters: model, n, size, quality, style, response_format, user
- Validate prompt is present and not empty
- Validate n is reasonable (1-10 typically)
- Validate size is supported format
- Set defaults for missing parameters

#### C. Token Estimation (Adapted)
- For image generation, estimate tokens based on prompt length
- Use similar 4 chars/token heuristic or adjust for image context
- Apply context limits if needed (though less critical for image gen)

#### D. Session Affinity (Optional)
- Consider if session affinity applies to image generation
- Might use prompt hash as session key for consistency
- Or skip session affinity entirely for image generation

#### E. Model Selection
- Call `bandit.selectModel()` with `requireImageGeneration = true`
- Pass excluded models set
- Pass estimated tokens (from prompt)
- Pass profile (maybe detect from prompt or use default)
- Pass cooledDownThisRequest set

#### F. Fallback Handling
- If no models available, check fallback models
- Ensure fallback models also support image generation
- Return appropriate error if none available

#### G. Upstream Call
- Build endpoint URL for provider's image generation API
- Prepare request body with image generation parameters
- Set appropriate headers (auth, content-type)
- Make fetch request to provider
- Handle timeouts and abort controller

#### H. Response Handling
- For non-streaming: validate and return provider response directly
- For streaming: handle if provider supports streaming image generation
- Apply OpenAI-compatible response formatting
- Record feedback for success/failure

#### I. Error Handling
- Handle provider errors (4xx, 5xx)
- Handle timeouts and aborts
- Apply exponential backoff for rate limits where appropriate
- Update session affinity and blacklists on failures
- Clean up resources on completion/error

### 3. Key Differences from Chat/Completions
- No tool call handling
- No context compression needed (typically)
- Different parameter set (prompt vs messages)
- Different response format (image data vs text)
- May not need streaming handling (unless provider supports it)
- Different model requirements (image generation vs chat)

### 4. Database Schema Changes
In src/bandit.mjs, update catalog table creation/migration:
```sql
ALTER TABLE catalog ADD COLUMN supports_image_generation INTEGER DEFAULT 0;
```

### 5. Model Synchronization Updates
In src/bandit.mjs, fetchAndSyncModels function:
- Add detection for image generation capabilities
- Similar to supports_tools detection but for image_generation
- Set supports_image_generation = 1 when:
  - capabilities.image_generation === true (from provider response)
  - OR model ID matches image generation patterns (dall-e, stable-diffusion, etc.)
  - AND NOT excluded by chat/vision indicators (unless specifically multimodal)

### 6. Model Selection Updates
In src/bandit.mjs, selectModel function:
- Add requireImageGeneration parameter (similar to requireTools)
- Add filtering logic in filterModels helper:
  ```javascript
  if (!rejectionReason && requireImageGeneration && !(model.supports_image_generation || 0)) {
    rejectionReason = 'no_image_generation_support';
  }
  ```
- Update function signature and calls accordingly

### 7. Helper Methods
Add to bandit.mjs:
- getModelImageGenerationSupport(modelId) - returns boolean
- May need to update getModelMaxInput if image gen models have different limits

## Files to Modify
1. src/bandit.mjs - database schema, model sync, model selection
2. src/index.mjs - new endpoint registration

## Testing Considerations
- Test with various image generation models (dall-e, stable-diffusion, etc.)
- Verify proper filtering excludes non-image models
- Verify fallback behavior works correctly
- Test error handling and edge cases
- Verify OpenAPI-compatible response format