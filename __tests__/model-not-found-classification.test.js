import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DiscountedUCB1Bandit } from "../src/bandit.mjs";
import fs from "fs";
import path from "path";

/**
 * @fileoverview Tests for model-not-found classification and punishment logic changes
 * [`__tests__/model-not-found-classification.test.js`](__tests__/model-not-found-classification.test.js:1)
 */

describe("Model-Not-Found Classification and Punishment Logic", () => {
  let bandit;

  beforeEach(() => {
    bandit = new DiscountedUCB1Bandit(":memory:");
  });

  afterEach(() => {
    if (bandit && typeof bandit.close === "function") {
      bandit.close();
    }
  });

  /**
   * @test Model-not-found errors are classified as ban-model (permanent) instead of cooldown-model (transient)
   */
  test("model-not-found errors are classified as ban-model (permanent) instead of cooldown-model (transient)", () => {
    const errorMessages = [
      "Model not found in active live catalog",
      "catalog mismatch",
      "unknown model",
      "model_not_found",
      "does not exist",
      "not found",
      "no longer available",
      "not available",
      "invalid model",
      "not available in active live catalog"
    ];

    errorMessages.forEach(errorMsg => {
      const classification = bandit._classifyError({ status: 400, message: errorMsg }, "test-provider");
      assert.strictEqual(classification.action, "ban-model", 
        `Error "${errorMsg}" should be classified as ban-model (permanent), not cooldown-model (transient)`);
      assert.strictEqual(classification.reason, "model-not-found", 
        `Error "${errorMsg}" should have reason "model-not-found"`);
      assert.strictEqual(classification.category, "PERMANENT", 
        `Error "${errorMsg}" should be classified as PERMANENT category`);
      assert.strictEqual(classification.scope, "model", 
        `Error "${errorMsg}" should have scope "model"`);
    });
  });

  /**
   * @test Model-not-found errors are classified as critical failures in _isCriticalFailure()
   */
  test("model-not-found errors are classified as critical failures in _isCriticalFailure()", () => {
    const errorMessages = [
      "Model not found in active live catalog",
      "catalog mismatch",
      "unknown model",
      "model_not_found",
      "does not exist",
      "not found",
      "no longer available",
      "not available",
      "invalid model",
      "not available in active live catalog"
    ];

    errorMessages.forEach(errorMsg => {
      const isCritical = bandit._isCriticalFailure(400, errorMsg, {});
      assert.strictEqual(isCritical, true, 
        `Error "${errorMsg}" should be classified as critical failure`);
    });

    // Test that non-model-not-found errors are NOT critical
    const nonCriticalErrors = [
      "timeout",
      "rate limit exceeded",
      "safeWrite is not initialized",
      "connection refused"
    ];

    nonCriticalErrors.forEach(errorMsg => {
      const isCritical = bandit._isCriticalFailure(400, errorMsg, {});
      assert.strictEqual(isCritical, false, 
        `Error "${errorMsg}" should NOT be classified as critical failure`);
    });
  });

  /**
   * @test New config pattern for model-not-found errors in bandit.json
   */
  test("new config pattern for model-not-found errors in bandit.json", () => {
    const configRaw = fs.readFileSync(path.join(process.cwd(), 'config/bandit.json'), 'utf8');
    const config = JSON.parse(configRaw);

    // Find the model-not-found pattern in permanentErrors
    const modelNotFoundPattern = config.errorConfig.classification.permanentErrors.find(
      pattern => pattern.reason === "model-not-found"
    );

    assert.ok(modelNotFoundPattern, "Should find model-not-found pattern in config");
    assert.strictEqual(modelNotFoundPattern.action, "ban-model", 
      "model-not-found pattern should have action 'ban-model'");
    assert.strictEqual(modelNotFoundPattern.scope, "model", 
      "model-not-found pattern should have scope 'model'");
    assert.strictEqual(modelNotFoundPattern.reason, "model-not-found", 
      "model-not-found pattern should have reason 'model-not-found'");

    // Test that the pattern matches various error messages
    const errorMessages = [
      "catalog mismatch",
      "unknown model",
      "model_not_found",
      "does not exist",
      "not found",
      "no longer available",
      "not available",
      "invalid model",
      "not available in active live catalog"
    ];

    errorMessages.forEach(errorMsg => {
      const regex = new RegExp(modelNotFoundPattern.pattern, 'i');
      const matches = regex.test(errorMsg);
      assert.strictEqual(matches, true, 
        `Pattern "${modelNotFoundPattern.pattern}" should match error "${errorMsg}"`);
    });
  });

  /**
   * @test Cascade guard: when two providers exist and one is on cooldown,
   * the healthy provider's model should be selected (strict tier respects cascade guard)
   */
  test("cascade guard: healthy model selected when provider is on cooldown", async () => {
    // Seed two catalog models with different providers
    bandit.db.prepare("INSERT INTO catalog (id, provider, max_input_tokens, is_free) VALUES (?, ?, ?, ?)")
      .run("cooled-provider/model-a", "cooled-provider", 100000, 1);
    bandit.db.prepare("INSERT INTO catalog (id, provider, max_input_tokens, is_free) VALUES (?, ?, ?, ?)")
      .run("healthy-provider/model-b", "healthy-provider", 100000, 1);

    const cooldownUntil = Date.now() + 3600000;
    // Set provider on cooldown
    bandit.db.prepare(
      `INSERT INTO provider_history (provider, total_failures, circuit_breaker_until, cooldown_until, needs_attention, attention_reason, attention_message) 
       VALUES (?, 0, 0, ?, 1, 'provider-cooldown', 'Provider already on cooldown')`
    ).run("cooled-provider", cooldownUntil);

    // Insert model into db tables for the cooled provider
    bandit.db.prepare(
      `INSERT INTO models (id, provider, N, sum_reward, fails, cooldown_until, last_used_index, total_failures, permanent, degraded) 
       VALUES (?, ?, 0, 0, 0, ?, 0, 0, 0, 0)`
    ).run("cooled-provider/model-a", "cooled-provider", cooldownUntil);

    // Select a model - the cascade guard in the strict filter should reject the cooled provider,
    // and the healthy provider's model should be selected instead.
    const selectedModel = await bandit.selectModel(new Set(), 0, false, false, false, null, new Set());

    // The healthy provider's model should be selected (cascade guard prevents punishment of the cooled provider)
    assert.strictEqual(selectedModel, "healthy-provider/model-b",
      "Healthy provider's model should be selected when another provider is on cooldown (cascade guard)");

    // Verify that the cooled model's cooldown was NOT extended (cascade guard skipped punishment)
    const modelRow = bandit.db.prepare(
      "SELECT cooldown_until FROM models WHERE id = ?"
    ).get("cooled-provider/model-a");

    assert.strictEqual(modelRow.cooldown_until, cooldownUntil,
      "Cooled model's cooldown should not be extended by cascade guard");
  });

  /**
   * @test Cascade guard with auth-expired attention: healthy model selected when provider has auth-expired attention
   */
  test("cascade guard with auth-expired attention: healthy model selected", async () => {
    // Seed two catalog models with different providers
    bandit.db.prepare("INSERT INTO catalog (id, provider, max_input_tokens, is_free) VALUES (?, ?, ?, ?)")
      .run("auth-provider/model-a", "auth-provider", 100000, 1);
    bandit.db.prepare("INSERT INTO catalog (id, provider, max_input_tokens, is_free) VALUES (?, ?, ?, ?)")
      .run("healthy-provider/model-b", "healthy-provider", 100000, 1);

    // Set provider with auth-expired attention
    bandit.db.prepare(
      `INSERT INTO provider_history (provider, total_failures, circuit_breaker_until, cooldown_until, needs_attention, attention_reason, attention_message) 
       VALUES (?, 0, 0, 0, 1, 'auth-expired', 'Authentication expired')`
    ).run("auth-provider");

    // Select a model - the cascade guard should reject the auth-expired provider,
    // and the healthy provider's model should be selected instead.
    const selectedModel = await bandit.selectModel(new Set(), 0, false, false, false, null, new Set());

    assert.strictEqual(selectedModel, "healthy-provider/model-b",
      "Healthy provider's model should be selected when another provider has auth-expired attention (cascade guard)");
  });

  /**
   * @test Cascade guard with circuit breaker: healthy model selected when provider has circuit breaker
   */
  test("cascade guard with circuit breaker: healthy model selected", async () => {
    // Seed two catalog models with different providers
    bandit.db.prepare("INSERT INTO catalog (id, provider, max_input_tokens, is_free) VALUES (?, ?, ?, ?)")
      .run("circuit-provider/model-a", "circuit-provider", 100000, 1);
    bandit.db.prepare("INSERT INTO catalog (id, provider, max_input_tokens, is_free) VALUES (?, ?, ?, ?)")
      .run("healthy-provider/model-b", "healthy-provider", 100000, 1);

    // Set provider with circuit breaker open
    bandit.db.prepare(
      `INSERT INTO provider_history (provider, total_failures, circuit_breaker_until, cooldown_until, needs_attention, attention_reason, attention_message) 
       VALUES (?, 5, ?, 0, 0, '', '')`
    ).run("circuit-provider", Date.now() + 3600000);

    // Select a model - the cascade guard should reject the circuit-breaker provider,
    // and the healthy provider's model should be selected instead.
    const selectedModel = await bandit.selectModel(new Set(), 0, false, false, false, null, new Set());

    assert.strictEqual(selectedModel, "healthy-provider/model-b",
      "Healthy provider's model should be selected when another provider has an open circuit breaker (cascade guard)");
  });

  /**
   * @test Cascade guard prevents cooldown extension when model is rejected due to provider cooldown
   * and no alternative model exists. The absolute last resort tier may still select the model
   * (it ignores cooldowns), but the cascade guard must prevent the cooldown from being extended.
   */
  test("cascade guard prevents cooldown extension when no alternative model exists", async () => {
    // Seed a single catalog model with provider on cooldown
    bandit.db.prepare("INSERT INTO catalog (id, provider, max_input_tokens, is_free) VALUES (?, ?, ?, ?)")
      .run("single-provider/model-1", "single-provider", 100000, 1);

    const cooldownUntil = Date.now() + 3600000;
    bandit.db.prepare(
      `INSERT INTO provider_history (provider, total_failures, circuit_breaker_until, cooldown_until, needs_attention, attention_reason, attention_message)
       VALUES (?, 0, 0, ?, 1, 'provider-cooldown', 'Provider on cooldown')`
    ).run("single-provider", cooldownUntil);

    bandit.db.prepare(
      `INSERT INTO models (id, provider, N, sum_reward, fails, cooldown_until, last_used_index, total_failures, permanent, degraded)
       VALUES (?, ?, 0, 0, 0, ?, 0, 0, 0, 0)`
    ).run("single-provider/model-1", "single-provider", cooldownUntil);

    // With no alternative model, the absolute last resort tier may still select the model
    // (it intentionally ignores cooldowns). The cascade guard's job is to ensure that
    // NO additional punishment (cooldown extension) is applied during the earlier tiers.
    const selectedModel = await bandit.selectModel(new Set(), 0, false, false, false, null, new Set());

    // The model may be selected via absolute last resort - that is expected behavior.
    // What matters is that the cascade guard prevented cooldown extension.
    assert.ok(selectedModel === null || selectedModel === "single-provider/model-1",
      "selectModel should either return null or the last-resort model");

    // Verify cooldown was NOT extended (cascade guard skipped punishment)
    const modelRow = bandit.db.prepare(
      "SELECT cooldown_until FROM models WHERE id = ?"
    ).get("single-provider/model-1");

    assert.strictEqual(modelRow.cooldown_until, cooldownUntil,
      "Model cooldown should not be extended when cascade guard skips punishment");
  });

  /**
   * @test Model-not-found error triggers ban-model action in recordFeedback
   */
  test("model-not-found error triggers ban-model action in recordFeedback", async () => {
    // Seed catalog with a model
    bandit.db.prepare("INSERT INTO catalog (id, provider, max_input_tokens, is_free) VALUES (?, ?, ?, ?)")
      .run("feedback-provider/model-1", "feedback-provider", 100000, 1);

    // Record a model-not-found error
    await bandit.recordFeedback("feedback-provider/model-1", false, 0, {
      status: 400,
      message: "Model not found in active live catalog"
    });

    // Verify that the model is permanently banned (ban-model action)
    const modelRow = bandit.db.prepare(
      "SELECT permanent, banned_since FROM models WHERE id = ?"
    ).get("feedback-provider/model-1");

    assert.strictEqual(modelRow.permanent, 1, 
      "Model should be permanently banned after model-not-found error");
    assert.ok(modelRow.banned_since > Date.now() - 10000, 
      "Model should have a recent banned_since timestamp");
  });
});