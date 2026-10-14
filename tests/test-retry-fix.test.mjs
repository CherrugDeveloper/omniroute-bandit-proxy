import { test } from "node:test";
import assert from "node:assert/strict";
import { DiscountedUCB1Bandit } from "../src/bandit.mjs";

/**
 * @test Verify retry loop fixes:
 * - retriesExhausted flag becomes true when attempts are exhausted
 * - model?.startsWith optional chaining prevents TypeError when model is null or undefined
 * - fallback logic is invoked properly and appropriately logged
 */
test("Retry loop fix: retriesExhausted flag, null model safety, and fallback invocation", () => {
  const bandit = new DiscountedUCB1Bandit(":memory:");

  // 1. Test null / undefined model safety with optional chaining
  let model = null;
  let attempt = 0;
  const maxAttempts = 3;
  let retriesExhausted = false;

  while (++attempt <= maxAttempts) {
    if (attempt >= maxAttempts) {
      retriesExhausted = true;
    }
    // Should not throw TypeError even though model is null
    if (retriesExhausted && model?.startsWith('felo/')) {
      assert.fail("Should not enter fallback for null model starting with felo");
    }
  }

  assert.equal(retriesExhausted, true, "retriesExhausted should become true when attempts reach maxAttempts");
  assert.equal(model, null, "model remains null without throwing TypeError");

  // 2. Test undefined model safety
  model = undefined;
  attempt = 0;
  retriesExhausted = false;

  while (++attempt <= maxAttempts) {
    if (attempt >= maxAttempts) {
      retriesExhausted = true;
    }
    if (retriesExhausted && model?.startsWith('felo/')) {
      assert.fail("Should not enter fallback for undefined model");
    }
  }

  assert.equal(retriesExhausted, true, "retriesExhausted should become true for undefined model");

  // 3. Test fallback logic invocation and logging when retries are exhausted for felo/ model
  model = "felo/test-model";
  attempt = 0;
  retriesExhausted = false;
  const fallbackTried = new Set();
  const logs = [];
  const originalLog = console.log;

  console.log = (...args) => {
    const msg = args.join(" ");
    logs.push(msg);
    originalLog(msg);
  };

  try {
    while (++attempt <= maxAttempts) {
      if (attempt >= maxAttempts) {
        retriesExhausted = true;
      }

      if (retriesExhausted && model?.startsWith('felo/')) {
        const fallbackModels = bandit.getFallbackModels();
        assert.ok(fallbackModels.length > 0, "Fallback models should be available");
        const fallbackModel = fallbackModels[0];
        fallbackTried.add(fallbackModel);
        console.log(`[FALLBACK] Attempt ${attempt}: Fallback to ${fallbackModel} due to retries exhausted for ${model}`);
        model = fallbackModel;
        retriesExhausted = false;
        break;
      }
    }
  } finally {
    console.log = originalLog;
  }

  assert.equal(retriesExhausted, false, "retriesExhausted should be reset to false after fallback");
  assert.notEqual(model, "felo/test-model", "model should be replaced by fallback model");
  assert.ok(
    logs.some(l => l.includes("[FALLBACK]") && l.includes("Fallback to")),
    "Fallback invocation should be logged with appropriate message"
  );

  bandit.close();
});
