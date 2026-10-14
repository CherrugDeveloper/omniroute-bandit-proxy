import test from "node:test";
import assert from "node:assert";
import { DiscountedUCB1Bandit } from "../src/bandit.mjs";

function makeBandit() {
  return new DiscountedUCB1Bandit(":memory:");
}

function seedCatalog(bandit, modelId, provider, maxInput = 8000, isFree = 1, supportsTools = 1) {
  bandit.db.prepare(`
    INSERT OR REPLACE INTO catalog (id, provider, max_input_tokens, is_free, supports_tools)
    VALUES (?, ?, ?, ?, ?)
  `).run(modelId, provider, maxInput, isFree, supportsTools);
}

test("selectModel: relaxation strategy recovers when token limits exceed all models", async () => {
  const b = makeBandit();
  // Model with small max_input_tokens (8000)
  seedCatalog(b, "p1/small-model", "p1", 8000, 1, 1);

  // Request estimatedTokens = 100000 (exceeds 8000 * 1.1)
  const chosen = await b.selectModel(new Set(), 100000, false);
  
  // Without relaxation, this would return null. With relaxation tier 1, it should recover and select p1/small-model.
  assert.equal(chosen, "p1/small-model");
});

test("selectModel: relaxation strategy recovers when policy (onlyFree / excludePaid) filters all models", async () => {
  const b = makeBandit();
  // Seed a paid model (is_free = 0)
  seedCatalog(b, "p1/paid-model", "p1", 128000, 0, 1);

  // Set onlyFree = true
  b.onlyFree = true;

  const chosen = await b.selectModel();
  
  // Without relaxation, this would return null. With relaxation tier 2, it recovers.
  assert.equal(chosen, "p1/paid-model");
});
