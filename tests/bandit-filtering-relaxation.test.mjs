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
  const chosen = await b.selectModel(new Set(), 100000, false, false, null, true);

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

test("selectModel: requireTools=true with high token count recovers via relaxation tiers", async () => {
  const b = makeBandit();
  // Seed model that supports tools but has smaller maxInput than estimatedTokens (8046)
  seedCatalog(b, "p1/tool-model", "p1", 4096, 1, 1);
  // Seed model that has large maxInput but doesn't support tools
  seedCatalog(b, "p1/large-model", "p1", 16384, 1, 0);

  // Request requireTools = true, estimatedTokens = 8046
  const chosen = await b.selectModel(new Set(), 8046, true, false, null, true);

  // Should successfully select a model via relaxation/emergency tier rather than returning null
  assert.notEqual(chosen, null);
});

test("selectModel: emergency relaxation recovers when all models are degraded", async () => {
  const b = makeBandit();
  // Seed catalog
  seedCatalog(b, "p1/degraded-model", "p1", 8000, 1, 1);
  // Manually set as degraded in models table
  b.db.prepare("INSERT INTO models (id, provider, degraded) VALUES (?, ?, 1)").run("p1/degraded-model", "p1");
  
  // Attempt selection
  const chosen = await b.selectModel();
  
  // Should return the degraded model because of emergency relaxation
  assert.equal(chosen, "p1/degraded-model");
});
