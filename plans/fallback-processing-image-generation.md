# Fallback Processing Updates for Image Generation

## 1. Current Fallback Logic Analysis

Looking at the fallback logic in `src/index.mjs` lines 1450-1499, I can see:

1. When `selectModel` returns null (no models available after filtering), the code checks fallback models
2. It iterates through `bandit.getFallbackModels()`
3. For each fallback model, it checks:
   - Not already tried (`fallbackTried.has(fallbackModel)`)
   - Model is available (`bandit.isModelAvailable(fallbackModel)`)
   - If `requireTools` is true, checks that model supports tools via database query

## 2. Required Changes for Image Generation Support

The fallback logic needs to be updated to also check for image generation support when `requireImageGeneration` is true.

### A. Modify Fallback Check Logic

Around line 1469, after the tools check, add image generation check:

```javascript
// Check if model supports tools when required
if (requireTools) {
  const modelInfo = bandit.db.prepare(
    `SELECT supports_tools FROM catalog WHERE id = ?`
  ).get(fallbackModel);

  if (!modelInfo || modelInfo.supports_tools !== 1) {
    console.log(`[FALLBACK] Skipping fallback model ${fallbackModel}: does not support tools (required)`);
    continue;
  }
}

// NEW: Check if model supports image generation when required
if (requireImageGeneration) {
  const modelInfo = bandit.db.prepare(
    `SELECT supports_image_generation FROM catalog WHERE id = ?`
  ).get(fallbackModel);

  if (!modelInfo || modelInfo.supports_image_generation !== 1) {
    console.log(`[FALLBACK] Skipping fallback model ${fallbackModel}: does not support image generation (required)`);
    continue;
  }
}
```

### B. Update Fallback Models Configuration

Review `config/bandit.json` to ensure the fallback models chain includes appropriate image generation models, or note that the fallback logic should be enhanced to dynamically check for image generation capability.

### C. Parameter Passing

Ensure that the `requireImageGeneration` parameter is properly passed to the fallback logic section. Looking at the code, this parameter would need to be available in the scope where fallback logic runs.

From examining the code, I can see that in the chat/completions endpoint:
- Line ~1243: `const requireTools = hasTools && !isSummarization;`
- We would add similar logic for image generation detection
- Then both parameters would be available in the fallback logic scope

## 3. Implementation Details

### A. Where to Add the Check

In the fallback logic loop (lines 1456-1484), after the tools requirement check (lines 1469-1478) and before the "Model passes all checks" comment (line 1481).

### B. What to Check

Query the catalog table for the `supports_image_generation` column, similar to how `supports_tools` is checked.

### C. Logging

Add appropriate debug logging when a fallback model is skipped due to lacking image generation support.

### D. Error Messages

Consider updating error messages to be more specific when image generation models are not available.

## 4. Additional Considerations

### A. Fallback Models Chain
The fallback models in `config/bandit.json` should be reviewed to ensure they include image generation capable models when appropriate, or the system should be able to fall back to non-image-generation models and then fail gracefully with a clear error.

### B. Performance
The additional database query in the fallback loop could impact performance if many fallback models are checked. However, since fallback loops are rare and typically involve checking only a few models, this impact should be negligible.

### C. Consistency
The approach should mirror exactly how the `requireTools` check is implemented for consistency.

## Files to Modify
- src/index.mjs: fallback logic in chat/completions endpoint (lines ~1450-1499)
- src/bandit.mjs: selectModel method (already designed in model-selection-image-generation.md)
- config/bandit.json: potentially update fallback models chain if needed

## Testing Considerations
- Test with requireImageGeneration=true and requireImageGeneration=false
- Test fallback behavior when no image generation models are available
- Test fallback behavior when image generation models are available but other constraints apply
- Ensure existing tool requirement fallback logic still works correctly