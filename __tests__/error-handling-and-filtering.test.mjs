import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DiscountedUCB1Bandit } from "../src/bandit.mjs";

/**
 * @fileoverview Dedicated test suite for error handling and model filtering in [`__tests__/error-handling-and-filtering.test.mjs`](__tests__/error-handling-and-filtering.test.mjs:1):
 * 1. CFP environment errors (`browserType.launch: Executable doesn't exist`) -> `ban-model` / `environment-error`.
 * 2. Antigravity catalog availability errors (`not available in the active live catalog`) -> `ban-model` / `model-not-found`.
 * 3. Groq / TPM & token limit 413 errors and pre-selection `max_input_tokens` filtering.
 */
describe("Error Handling and Model Filtering Test Suite", () => {
  let bandit;

  beforeEach(() => {
    bandit = new DiscountedUCB1Bandit(":memory:");
  });

  afterEach(() => {
    if (bandit && typeof bandit.close === "function") {
      bandit.close();
    }
  });

  test("1. CFP environment error classification: browserType.launch Executable doesn't exist -> ban-provider (provider-misconfigured)", () => {
    const errObj = {
      status: 502,
      message: "browserType.launch: Executable doesn't exist at /root/.cache/ms-playwright/chromium-1123/chrome-linux/chrome",
      provider: "cfp"
    };
    const classification = bandit._classifyError(errObj);
    assert.equal(classification.action, "ban-provider");
    assert.equal(classification.reason, "provider-misconfigured");
    assert.equal(classification.scope, "provider");
  });

  test("2. Antigravity catalog availability error classification: not available in active live catalog -> ban-model (model-not-found)", () => {
    const errObj = {
      status: 400,
      message: "Model `antigravity/gemini-2.5-pro` is not available in the active live catalog",
      provider: "antigravity"
    };
    const classification = bandit._classifyError(errObj);
    assert.equal(classification.action, "ban-model");
    assert.equal(classification.reason, "model-not-found");
    assert.equal(classification.scope, "model");
  });

  test("3. Groq / TPM & token limit 413 errors and pre-selection max_input_tokens filtering", async () => {
    // Seed catalog with a model having max_input_tokens = 4000
    bandit.db.prepare(
      `INSERT INTO catalog (id, provider, max_input_tokens, is_free, supports_tools) VALUES (?, ?, ?, ?, ?)`
    ).run("groq/llama-3-8b", "groq", 4000, 1, 1);

    // Seed another model with larger max_input_tokens = 16000
    bandit.db.prepare(
      `INSERT INTO catalog (id, provider, max_input_tokens, is_free, supports_tools) VALUES (?, ?, ?, ?, ?)`
    ).run("groq/llama-3-70b", "groq", 16000, 1, 1);

    // Request with estimatedTokens = 5000 (exceeds 4000 * 1.1 = 4400, but less than 16000 * 1.1 = 17600)
    const selected = await bandit.selectModel(new Set(), 5000);
    assert.equal(selected, "groq/llama-3-70b", "Model with insufficient max_input_tokens should be filtered out pre-selection");

    // Test dynamic max tokens update or handling 413 / TPM error
    const errObj = {
      status: 413,
      message: "Request too large. Requested 15000 tokens. Limit 8000 tokens per minute (TPM).",
      provider: "groq"
    };
    const classification = bandit._classifyError(errObj);
    assert.ok(classification, "Classification should be returned for 413 / TPM error");
  });

  test("4. RATE_LIMIT_QUEUE_TIMEOUT and high demand error classification", () => {
    const queueErr = {
      status: 503,
      code: "RATE_LIMIT_QUEUE_TIMEOUT",
      message: "Request timed out waiting in queue"
    };
    const c1 = bandit._classifyError(queueErr);
    assert.equal(c1.action, "cooldown-model");
    assert.equal(c1.reason, "queue-timeout");
    assert.equal(c1.scope, "model");

    const highDemandErr = {
      status: 503,
      message: "Server is currently experiencing high demand. Please try again later."
    };
    const c2 = bandit._classifyError(highDemandErr);
    assert.equal(c2.action, "cooldown-model");
    assert.equal(c2.reason, "high-demand");
    assert.equal(c2.scope, "model");
  });
});
