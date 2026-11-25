import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

// Enable DEBUG-level structured logging BEFORE importing the bandit/structured-logger.
// The structured logger computes its MIN_LEVEL at module load time, so this env var
// must be set before the module is evaluated. Static imports are hoisted, therefore
// we use a dynamic import below to guarantee ordering.
process.env.STRUCTURED_LOG_LEVEL = "debug";
process.env.STRUCTURED_LOG = "true";

/**
 * @fileoverview Tests for model-not-found classification and punishment logic changes
 * [`__tests__/model-not-found-classification.test.js`](__tests__/model-not-found-classification.test.js:1)
 */

describe("Model-Not-Found Classification and Punishment Logic", () => {
  let bandit;
  let loggedMessages = [];
  let originalConsoleLog;

  /**
   * Parse a captured console.log argument into a structured log entry.
   * The structured logger emits JSON strings when STRUCTURED_LOG=true.
   * @param {*} raw - The raw captured argument
   * @returns {{level: string, message: string}|null}
   */
  function parseLogEntry(raw) {
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && parsed.message) {
          return { level: parsed.level, message: parsed.message };
        }
      } catch {
        // Not JSON - fall back to plain string matching
        return { level: "", message: raw };
      }
    } else if (raw && typeof raw === "object" && raw.message) {
      return { level: raw.level, message: raw.message };
    }
    return null;
  }

  beforeEach(async () => {
    // Reset logged messages and counters
    loggedMessages = [];
    
    // Spy on console.log to capture structured logger output
    originalConsoleLog = console.log;
    console.log = (...args) => {
      if (args.length > 0) {
        loggedMessages.push(args[0]);
      }
      originalConsoleLog.apply(console, args);
    };
    
    bandit = new (await import("../src/bandit.mjs")).DiscountedUCB1Bandit(":memory:");
  });

  afterEach(() => {
    // Restore console.log
    console.log = originalConsoleLog;
    
    if (bandit && typeof bandit.close === "function") {
      bandit.close();
    }
  });

  /**
   * @test Model-not-found errors are classified as ban-model (permanent) instead of cooldown-model (transient)
   */
  test("model-not-found errors are classified as cooldown-model (transient) instead of ban-model (permanent)", () => {
    // FIX: Generic model-not-found errors are now transient cooldowns to prevent cascade bans
    // Only specific catalog mismatch messages trigger permanent bans
    const transientErrorMessages = [
      "Model not found in active live catalog",
      "unknown model",
      "model_not_found",
      "does not exist",
      "no longer available",
      "invalid model",
      "not available in active live catalog"
    ];

    transientErrorMessages.forEach(errorMsg => {
      const classification = bandit._classifyError({ status: 400, message: errorMsg }, "test-provider");
      assert.strictEqual(classification.action, "cooldown-model",
        `Error "${errorMsg}" should be classified as cooldown-model (transient), not ban-model`);
      assert.strictEqual(classification.reason, "model-not-found",
        `Error "${errorMsg}" should have reason "model-not-found"`);
      assert.strictEqual(classification.category, "TRANSIENT",
        `Error "${errorMsg}" should be classified as TRANSIENT category`);
    });

    // Only specific catalog mismatch messages should trigger permanent ban
    const permanentErrorMessages = [
      "catalog mismatch",
      "active live catalog empty",
      "no models available"
    ];

    permanentErrorMessages.forEach(errorMsg => {
      const classification = bandit._classifyError({ status: 400, message: errorMsg }, "test-provider");
      assert.strictEqual(classification.action, "ban-model",
        `Error "${errorMsg}" should be classified as ban-model (permanent)`);
      assert.strictEqual(classification.reason, "model-not-found",
        `Error "${errorMsg}" should have reason "model-not-found"`);
      assert.strictEqual(classification.category, "PERMANENT",
        `Error "${errorMsg}" should be classified as PERMANENT category`);
      assert.strictEqual(classification.scope, "model",
        `Error "${errorMsg}" should have scope "model"`);
    });
  });

  /**
   * @test "not found" bare 404 should NOT trigger ban-model (it's excluded from pattern per v0.53.10)
   */
  test('"not found" bare 404 should NOT trigger ban-model (excluded from pattern)', () => {
    const bareNotFoundError = "not found";
    const classification = bandit._classifyError({ status: 404, message: bareNotFoundError }, "test-provider");
    
    // "not found" should NOT match the model-not-found pattern anymore
    // It should fall through to the transient 404 pattern
    assert.strictEqual(classification.action, "cooldown-model", 
      `"${bareNotFoundError}" should be classified as cooldown-model (transient), not ban-model`);
    assert.strictEqual(classification.reason, "transient-404", 
      `"${bareNotFoundError}" should have reason "transient-404"`);
    assert.strictEqual(classification.category, "TRANSIENT", 
      `"${bareNotFoundError}" should be classified as TRANSIENT category`);
  });

  /**
   * @test "not available" alone should NOT trigger ban-model
   */
  test('"not available" alone should NOT trigger ban-model', () => {
    const notAvailableError = "not available";
    const classification = bandit._classifyError({ status: 400, message: notAvailableError }, "test-provider");
    
    // "not available" alone should NOT match the model-not-found pattern
    // It should fall through to other classifications
    assert.notStrictEqual(classification.reason, "model-not-found",
      `"${notAvailableError}" should NOT have reason "model-not-found"`);
  });

  /**
   * @test Model-not-found errors are classified as critical failures in _isCriticalFailure()
   */
  test("model-not-found errors are classified as critical failures in _isCriticalFailure()", () => {
    // Only specific catalog mismatch messages trigger permanent ban (critical)
    const criticalErrorMessages = [
      "catalog mismatch",
      "active live catalog empty",
      "no models available"
    ];

    criticalErrorMessages.forEach(errorMsg => {
      const isCritical = bandit._isCriticalFailure(400, errorMsg, {});
      assert.strictEqual(isCritical, true,
        `Error "${errorMsg}" should be classified as critical failure`);
    });

    // Generic model-not-found errors are NOT critical - they are transient cooldowns
    const nonCriticalModelNotFoundErrors = [
      "Model not found in active live catalog",
      "unknown model",
      "model_not_found",
      "does not exist",
      "no longer available",
      "invalid model",
      "not available in active live catalog"
    ];

    nonCriticalModelNotFoundErrors.forEach(errorMsg => {
      const isCritical = bandit._isCriticalFailure(400, errorMsg, {});
      assert.strictEqual(isCritical, false,
        `Error "${errorMsg}" should NOT be classified as critical failure (transient cooldown)`);
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
   * @test Configuration pattern for model-not-found errors in bandit.json
   */
  test("configuration pattern for model-not-found errors in bandit.json", () => {
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

    // FIX: Pattern should ONLY match specific catalog mismatch messages
    // Generic "model not found" errors are now handled as transient cooldowns
    const shouldMatch = [
      "catalog mismatch",
      "active live catalog empty",
      "no models available",
      "no model available"
    ];

    shouldMatch.forEach(errorMsg => {
      const regex = new RegExp(modelNotFoundPattern.pattern, 'i');
      const matches = regex.test(errorMsg);
      assert.strictEqual(matches, true,
        `Pattern "${modelNotFoundPattern.pattern}" should match error "${errorMsg}"`);
    });

    // Test that the pattern does NOT match generic "not found" errors
    const shouldNotMatch = [
      "not found",
      "unknown model",
      "model_not_found",
      "does not exist",
      "no longer available",
      "invalid model",
      "not available in active live catalog",
      "Model not found in active live catalog"
    ];

    shouldNotMatch.forEach(errorMsg => {
      const regex = new RegExp(modelNotFoundPattern.pattern, 'i');
      const matches = regex.test(errorMsg);
      assert.strictEqual(matches, false,
        `Pattern "${modelNotFoundPattern.pattern}" should NOT match error "${errorMsg}"`);
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

    // Select a model - the cascade guard should reject the cooled provider,
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
  test("model-not-found error triggers cooldown-model action in recordFeedback (transient)", async () => {
    // Seed catalog with a model
    bandit.db.prepare("INSERT INTO catalog (id, provider, max_input_tokens, is_free) VALUES (?, ?, ?, ?)")
      .run("feedback-provider/model-1", "feedback-provider", 100000, 1);

    // Record a generic model-not-found error (should be transient cooldown, not permanent ban)
    await bandit.recordFeedback("feedback-provider/model-1", false, 0, {
      status: 400,
      message: "Model not found in active live catalog"
    });

    // Verify that the model is in cooldown, NOT permanently banned
    const modelRow = bandit.db.prepare(
      "SELECT permanent, cooldown_until FROM models WHERE id = ?"
    ).get("feedback-provider/model-1");

    assert.strictEqual(modelRow.permanent, 0,
      "Model should NOT be permanently banned after generic model-not-found error");
    assert.ok(modelRow.cooldown_until > Date.now(),
      "Model should have a cooldown_until timestamp in the future");
  });

  test("catalog mismatch error triggers ban-model action in recordFeedback (permanent)", async () => {
    // Seed catalog with a model
    bandit.db.prepare("INSERT INTO catalog (id, provider, max_input_tokens, is_free) VALUES (?, ?, ?, ?)")
      .run("feedback-provider/model-2", "feedback-provider", 100000, 1);

    // Record a SPECIFIC catalog mismatch error (should be permanent ban)
    await bandit.recordFeedback("feedback-provider/model-2", false, 0, {
      status: 400,
      message: "catalog mismatch: model not in active live catalog"
    });

    // Verify that the model is permanently banned
    const modelRow = bandit.db.prepare(
      "SELECT permanent, banned_since FROM models WHERE id = ?"
    ).get("feedback-provider/model-2");

    assert.strictEqual(modelRow.permanent, 1,
      "Model should be permanently banned after catalog mismatch error");
    assert.ok(modelRow.banned_since > Date.now() - 10000,
      "Model should have a recent banned_since timestamp");
  });

  /**
   * @test Cascade guard counters are incremented correctly when punishment is skipped
   */
  test("cascade guard counters are incremented correctly when punishment is skipped", async () => {
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

    // Verify counters start at 0
    assert.strictEqual(bandit.cascadeGuardSkipCount, 0, "cascadeGuardSkipCount should start at 0");
    assert.strictEqual(bandit.cascadeGuardApplyCount, 0, "cascadeGuardApplyCount should start at 0");

    // Select a model - the cascade guard should reject the cooled provider
    const selectedModel = await bandit.selectModel(new Set(), 0, false, false, false, null, new Set());

    // Verify that the healthy provider's model was selected
    assert.strictEqual(selectedModel, "healthy-provider/model-b",
      "Healthy provider's model should be selected when another provider is on cooldown");

    // Verify that cascadeGuardSkipCount was incremented
    assert.strictEqual(bandit.cascadeGuardSkipCount, 1, 
      "cascadeGuardSkipCount should be incremented when cascade guard skips punishment");
    assert.strictEqual(bandit.cascadeGuardApplyCount, 0, 
      "cascadeGuardApplyCount should NOT be incremented when cascade guard skips punishment");
  });

  /**
   * @test Cascade guard logs at DEBUG level when skipping punishment
   * Verifies that BANDIT-CASCADE-GUARD messages are logged at DEBUG level, not INFO
   */
  test("cascade guard logs at DEBUG level when skipping punishment", async () => {
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

    // Select a model - the cascade guard should reject the cooled provider
    const selectedModel = await bandit.selectModel(new Set(), 0, false, false, false, null, new Set());

    // Verify that the healthy provider's model was selected
    assert.strictEqual(selectedModel, "healthy-provider/model-b",
      "Healthy provider's model should be selected when another provider is on cooldown");

    // Verify that cascade guard logs at DEBUG level (not INFO)
    // The structured logger outputs JSON lines when STRUCTURED_LOG=true
    const cascadeGuardLogs = loggedMessages
      .map(parseLogEntry)
      .filter(entry => entry && entry.message.includes("[BANDIT-CASCADE-GUARD]"));
    assert.strictEqual(cascadeGuardLogs.length, 1,
      "Should have exactly one BANDIT-CASCADE-GUARD log message");
    
    // The log should contain [DEBUG] level indicator
    const logMessage = cascadeGuardLogs[0];
    assert.ok(logMessage.level === "DEBUG" || logMessage.message.includes('[DEBUG]'),
      `BANDIT-CASCADE-GUARD should be logged at DEBUG level, got: ${JSON.stringify(logMessage)}`);
    
    // Verify the log message contains the expected content
    assert.ok(logMessage.message.includes("Skipping ALL punishment"),
      "Log message should indicate punishment is being skipped");
  });

  /**
   * @test Cascade guard SKIPS punishment for model_permanent_ban (cascade prevention)
   * Verifies that BANDIT-CASCADE-GUARD messages are logged at DEBUG level when punishment is SKIPPED
   * Uses a rejection reason that IS in the cascade guard skip list ('model_permanent_ban')
   * This prevents cascade punishment storms where hundreds of models get simultaneous cooldowns
   * from a single provider failure.
   */
  test("cascade guard skips punishment for model_permanent_ban", async () => {
    // Seed a catalog model
    bandit.db.prepare("INSERT INTO catalog (id, provider, max_input_tokens, is_free) VALUES (?, ?, ?, ?)")
      .run("test-provider/model-a", "test-provider", 100000, 1);

    // Insert model into db tables with permanent ban
    bandit.db.prepare(
      `INSERT INTO models (id, provider, N, sum_reward, fails, cooldown_until, last_used_index, total_failures, permanent, degraded)
       VALUES (?, ?, 0, 0, 0, 0, 0, 0, 1, 0)`
    ).run("test-provider/model-a", "test-provider");

    // Select a model - the model is permanently banned, so rejectionReason = 'model_permanent_ban'
    // This IS in the cascade guard skip list, so it should SKIP punishment (DEBUG level)
    const selectedModel = await bandit.selectModel(new Set(), 0, false, false, false, null, new Set());

    // The absolute last resort tier may still select the model (it ignores all constraints)
    // What matters is that the cascade guard was triggered during the emergency tier
    assert.ok(selectedModel === "test-provider/model-a" || selectedModel === null,
      "Model may be selected by absolute last resort or return null");

    // Verify that cascade guard logs at DEBUG level when SKIPPING punishment
    // Note: The model is rejected in multiple tiers (tier0, tier1, tier2, tier3, emergency),
    // so the cascade guard may be triggered multiple times. We verify at least one DEBUG log.
    const cascadeGuardLogs = loggedMessages
      .map(parseLogEntry)
      .filter(entry => entry && entry.message.includes("[BANDIT-CASCADE-GUARD]"));
    assert.ok(cascadeGuardLogs.length >= 1,
      "Should have at least one BANDIT-CASCADE-GUARD log message");
    
    // At least one log should be at DEBUG level (skipping punishment)
    const debugLogs = cascadeGuardLogs.filter(entry => entry.level === "DEBUG" || entry.message.includes('[DEBUG]'));
    assert.ok(debugLogs.length >= 1,
      "Should have at least one BANDIT-CASCADE-GUARD log at DEBUG level (skipping punishment)");
    
    // Verify the log message contains the expected content
    const logMessage = debugLogs[0];
    assert.ok(logMessage.message.includes("Skipping ALL punishment"),
      "Log message should indicate punishment is being skipped for cascade prevention");
  });

  /**
   * @test Transient 400 errors with validation messages are classified as transient
   * Verifies that 400 errors with validation/bad request/invalid parameter messages
   * are classified as transient (cooldown-model) not permanent
   * NOTE: "token limit exceeded" is excluded because it matches the TPM pattern first in config/bandit.json
   */
  test("transient 400 errors with validation messages are classified as transient", () => {
    // NOTE: "400 invalid input: token limit exceeded" is intentionally excluded here because it matches
    // the TPM/context-window transient pattern (reason "tpm-exceeded") which appears
    // earlier in config/bandit.json and therefore wins the first-match rule.
    const validationErrorMessages = [
      "400 validation error: invalid input",
      "400 bad request: missing required field",
      "400 invalid request: parameter 'model' is invalid",
      "400 request invalid: missing field 'api_key'",
      "400 missing field: 'prompt' is required"
    ];

    validationErrorMessages.forEach(errorMsg => {
      const classification = bandit._classifyError({ status: 400, message: errorMsg }, "test-provider");
      assert.strictEqual(classification.action, "cooldown-model", 
        `Error "${errorMsg}" should be classified as cooldown-model (transient), not ban-model`);
      assert.strictEqual(classification.reason, "transient-400-error", 
        `Error "${errorMsg}" should have reason "transient-400-error"`);
      assert.strictEqual(classification.category, "TRANSIENT", 
        `Error "${errorMsg}" should be classified as TRANSIENT category`);
    });
  });

  /**
   * @test Transient 400 errors are not classified as critical failures
   */
  test("transient 400 errors are not classified as critical failures", () => {
    const validationErrorMessages = [
      "400 validation error: invalid input",
      "400 bad request: missing required field",
      "400 invalid request: parameter 'model' is invalid"
    ];

    validationErrorMessages.forEach(errorMsg => {
      const isCritical = bandit._isCriticalFailure(400, errorMsg, {});
      assert.strictEqual(isCritical, false, 
        `Error "${errorMsg}" should NOT be classified as critical failure`);
    });
  });

  /**
   * @test Cascade guard SKIPS punishment for model_permanent_ban (cascade prevention)
   * Verifies that cascadeGuardApplyCount stays at 0 when model_permanent_ban is in the skip list
   * Uses a rejection reason that IS in the cascade guard skip list ('model_permanent_ban')
   * This prevents cascade punishment storms where hundreds of models get simultaneous cooldowns
   * from a single provider failure.
   */
  test("cascade guard skips punishment for model_permanent_ban", async () => {
    // Seed a catalog model
    bandit.db.prepare("INSERT INTO catalog (id, provider, max_input_tokens, is_free) VALUES (?, ?, ?, ?)")
      .run("apply-test/model-a", "apply-test", 100000, 1);

    // Insert model into db tables with permanent ban
    bandit.db.prepare(
      `INSERT INTO models (id, provider, N, sum_reward, fails, cooldown_until, last_used_index, total_failures, permanent, degraded)
       VALUES (?, ?, 0, 0, 0, 0, 0, 0, 1, 0)`
    ).run("apply-test/model-a", "apply-test");

    // Verify counters start at 0
    assert.strictEqual(bandit.cascadeGuardSkipCount, 0, "cascadeGuardSkipCount should start at 0");
    assert.strictEqual(bandit.cascadeGuardApplyCount, 0, "cascadeGuardApplyCount should start at 0");

    // Select a model - the model is permanently banned, so rejectionReason = 'model_permanent_ban'
    // This IS in the cascade guard skip list, so it should SKIP punishment (apply counter stays at 0)
    const selectedModel = await bandit.selectModel(new Set(), 0, false, false, false, null, new Set());

    // The absolute last resort tier may still select the model (it ignores all constraints)
    // What matters is that the cascade guard was triggered during the emergency tier
    assert.ok(selectedModel === "apply-test/model-a" || selectedModel === null,
      "Model may be selected by absolute last resort or return null");

    // Verify that cascadeGuardApplyCount stays at 0 when punishment is SKIPPED
    assert.strictEqual(bandit.cascadeGuardApplyCount, 0,
      `cascadeGuardApplyCount should stay at 0 when cascade guard skips punishment (got ${bandit.cascadeGuardApplyCount})`);
    // cascadeGuardSkipCount IS incremented for each tier rejection (model rejected in multiple tiers)
    assert.ok(bandit.cascadeGuardSkipCount >= 1,
      `cascadeGuardSkipCount should be incremented when cascade guard skips punishment (got ${bandit.cascadeGuardSkipCount})`);
  });

  /**
   * @test Cascade guard counters increment correctly across multiple operations
   */
  test("cascade guard counters increment correctly across multiple operations", async () => {
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

    // Verify counters start at 0
    assert.strictEqual(bandit.cascadeGuardSkipCount, 0, "cascadeGuardSkipCount should start at 0");
    assert.strictEqual(bandit.cascadeGuardApplyCount, 0, "cascadeGuardApplyCount should start at 0");

    // First selection - cascade guard should skip punishment
    const selectedModel1 = await bandit.selectModel(new Set(), 0, false, false, false, null, new Set());
    assert.strictEqual(selectedModel1, "healthy-provider/model-b",
      "Healthy provider's model should be selected");

    // Verify skip counter incremented
    assert.strictEqual(bandit.cascadeGuardSkipCount, 1, 
      "cascadeGuardSkipCount should be 1 after first selection");
    assert.strictEqual(bandit.cascadeGuardApplyCount, 0, 
      "cascadeGuardApplyCount should be 0 after first selection");

    // Second selection - cascade guard should skip punishment again
    const selectedModel2 = await bandit.selectModel(new Set(), 0, false, false, false, null, new Set());
    assert.strictEqual(selectedModel2, "healthy-provider/model-b",
      "Healthy provider's model should be selected again");

    // Verify skip counter incremented again
    assert.strictEqual(bandit.cascadeGuardSkipCount, 2, 
      "cascadeGuardSkipCount should be 2 after second selection");
    assert.strictEqual(bandit.cascadeGuardApplyCount, 0, 
      "cascadeGuardApplyCount should still be 0");
  });
});