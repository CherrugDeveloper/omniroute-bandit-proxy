# Model Selection Logic for Image Generation

## 1. Method Signature Update

Modify the `selectModel` method signature in `src/bandit.mjs` to add `requireImageGeneration` parameter:

```javascript
async selectModel(excluded = new Set(), estimatedTokens = 0, requireTools = false, requireImageGeneration = false, profile = null, cooledDownThisRequest = true) {
```

## 2. SQL Query Updates

Update the SQL queries in `selectModel` to include the `supports_image_generation` column:

### Catalog Models Query (lines 1400-1403):
```javascript
const catalogModels = this.db.prepare(`
  SELECT c.id, c.provider, 0 AS N, 0 AS sum_reward, 0 AS fails, 0 AS degraded, 0 AS cooldown_until, 0 AS permanent, c.max_input_tokens, c.supports_tools, c.supports_image_generation, c.is_free, 0 AS is_paid, 0 AS dynamic_max_tokens
  FROM catalog c
`).all();
```

### DB Models Query (lines 1404-1408):
```javascript
const dbModels = this.db.prepare(`
  SELECT m.id, m.provider, m.N, m.sum_reward, m.fails, m.degraded, m.cooldown_until, m.permanent, m.is_paid, m.dynamic_max_tokens, c.is_free, c.supports_tools, c.supports_image_generation, c.max_input_tokens
  FROM models m
  LEFT JOIN catalog c ON m.id = c.id
`).all();
```

## 3. Model Combination Logic Update

Update the model combination logic to handle the new column (lines 1411-1424):

```javascript
// Combine catalog and db models, preferring db models when there's a conflict
const modelMap = new Map();
for (const model of catalogModels) {
  modelMap.set(model.id, model);
}
for (const model of dbModels) {
  const existing = modelMap.get(model.id) || {};
  modelMap.set(model.id, {
    ...existing,
    ...model,
    is_free: model.is_free !== undefined ? model.is_free : existing.is_free,
    is_paid: model.is_paid !== undefined ? model.is_paid : existing.is_paid,
    max_input_tokens: model.max_input_tokens !== undefined ? model.max_input_tokens : existing.max_input_tokens,
    supports_tools: model.supports_tools !== undefined ? model.supports_tools : existing.supports_tools,
    supports_image_generation: model.supports_image_generation !== undefined ? model.supports_image_generation : existing.supports_image_generation,
  }); // db models overwrite catalog models
}
```

## 4. Filter Function Update

Add image generation requirement check in the `filterModels` function (around line 1501):

```javascript
if (!rejectionReason && requireTools && !(model.supports_tools || 0)) {
  rejectionReason = 'no_tools_support';
} else if (!rejectionReason && requireImageGeneration && !(model.supports_image_generation || 0)) {
  rejectionReason = 'no_image_generation_support';
}
```

## 5. Debug Logging Update

Update the debug logging line (around line 1409) to include the new parameter:

```javascript
if (DEBUG) console.log(`[BANDIT][DEBUG] selectModel: catalog=${catalogModels.length} db=${dbModels.length} excluded=${excludeSet.size} tokens=${estimatedTokens} tools=${requireTools} image=${requireImageGeneration}`);
```

## 6. Usage Examples

### For Image Generation Endpoint:
When calling selectModel from the new `/v1/images/generations` endpoint:
```javascript
const modelId = bandit.selectModel(excludedModels, estimatedTokens, false, true, profile);
```

### For Chat/Completions Endpoint (when image generation is detected):
```javascript
const modelId = bandit.selectModel(excludedModels, estimatedTokens, requireTools, requireImageGeneration, profile);
```

## 7. Fallback Models Consideration

Note: The fallback models chain in `config/bandit.json` should be reviewed to ensure it contains appropriate image generation models when needed, or the fallback logic should be updated to respect the requireImageGeneration flag.

## Files to Modify
- src/bandit.mjs: selectModel method (lines ~1383-1602)
