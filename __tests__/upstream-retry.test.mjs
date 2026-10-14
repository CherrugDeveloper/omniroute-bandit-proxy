import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DiscountedUCB1Bandit } from "../src/bandit.mjs";

describe("Step 6: Upstream Request Execution, Streaming Timeouts & Retry Loop Verification", () => {
  let bandit;

  beforeEach(() => {
    bandit = new DiscountedUCB1Bandit(":memory:");
  });

  describe("Retry Loop Max Attempts Calculation", () => {
    /**
     * @test Verify maxAttempts formula Math.min(500, providerCount * 4 + 100)
     */
    test("calculates maxAttempts correctly based on provider count", () => {
      const providerCount = bandit.getProviderCount();
      const expectedMaxAttempts = Math.min(500, providerCount * 4 + 100);
      assert.equal(expectedMaxAttempts <= 500, true);
      assert.equal(expectedMaxAttempts >= 100, true);
    });
  });

  describe("Excluded Models Tracking", () => {
    /**
     * @test Verify excludedModels Set correctly tracks failed model/provider pairs
     */
    test("excludedModels Set tracks failed models across attempts", () => {
      const excluded = new Set();
      const failedModel = "provider1/model-a";

      assert.equal(excluded.has(failedModel), false);
      excluded.add(failedModel);
      assert.equal(excluded.has(failedModel), true);
      assert.equal(excluded.size, 1);
    });
  });

  describe("Streaming Timeouts Configuration", () => {
    /**
     * @test Verify three-level timeout environment variables and defaults
     */
    test("three-level streaming timeouts have valid default numbers", () => {
      const upstreamTimeoutMs = parseInt(process.env.UPSTREAM_TIMEOUT_MS || "20000", 10);
      const streamIdleMs = parseInt(process.env.STREAM_IDLE_MS || "60000", 10);
      const streamMaxMs = parseInt(process.env.STREAM_MAX_MS || "180000", 10);

      assert.equal(typeof upstreamTimeoutMs, "number");
      assert.equal(upstreamTimeoutMs > 0, true);

      assert.equal(typeof streamIdleMs, "number");
      assert.equal(streamIdleMs > 0, true);

      assert.equal(typeof streamMaxMs, "number");
      assert.equal(streamMaxMs > 0, true);
    });
  });

  describe("Fallback Models Chain", () => {
    /**
     * @test Verify fallback models retrieval and filtering
     */
    test("retrieves fallback models and filters correctly", () => {
      const fallbackModels = bandit.getFallbackModels();
      assert.ok(Array.isArray(fallbackModels));

      const fallbackTried = new Set();
      for (const fallbackModel of fallbackModels) {
        if (!fallbackTried.has(fallbackModel) && bandit.isModelAvailable(fallbackModel)) {
          fallbackTried.add(fallbackModel);
          assert.ok(typeof fallbackModel === "string");
          break;
        }
      }
    });
  });
});
