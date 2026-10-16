import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DiscountedUCB1Bandit } from "../src/bandit.mjs";
import ProviderQuota from "../src/provider-quota.mjs";

/**
 * @fileoverview Comprehensive unit and integration test suite for ITPM quota limits,
 * [`__tests__/itpm-quota.test.js`](__tests__/itpm-quota.test.js:1) 413 error parsing, rolling token/call windows,
 * and provider/model skipping in [`DiscountedUCB1Bandit`](src/bandit.mjs:30) and [`ProviderQuota`](src/provider-quota.mjs:5).
 */
describe("ITPM Quota and Error Parsing Test Suite", () => {
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
   * @test Error classification parsing of 413 messages containing ITPM limits and reset times.
   */
  test("_classifyError parses 413 and ITPM limit messages with custom reset duration", () => {
    const errorMsg = "ITPM limit exceeded. Limit 7000, Requested 7861. Please reset after 3s.";
    const classification = bandit._classifyError({ status: 413, message: errorMsg });

    assert.equal(classification.action, "cooldown-model");
    assert.equal(classification.scope, "model");
    assert.equal(classification.reason, "tpm-exceeded");
    assert.equal(classification.cooldownMs, 3000, "Should parse 'reset after 3s' into 3000ms");
  });

  /**
   * @test Error classification parsing of general 413 error without explicit reset time.
   */
  test("_classifyError parses standard 413 payload too large with default 5m cooldown", () => {
    const classification = bandit._classifyError({ status: 413, message: "Payload too large" });

    assert.equal(classification.action, "cooldown-model");
    assert.equal(classification.scope, "model");
    assert.equal(classification.cooldownMs, 300000, "Default 413 cooldown should be 5 minutes (300000ms)");
  });

  /**
   * @test ProviderQuota canCall, recordCall, and recordQuotaExhausted behavior.
   */
  test("ProviderQuota canCall, recordCall, and recordQuotaExhausted enforce rolling limits and quota resets", () => {
    const quota = bandit.quota;
    const provider = "test-provider";

    // Initially canCall should be true
    assert.equal(quota.canCall(provider), true);

    // Record calls
    quota.recordCall(provider);
    assert.equal(quota.canCall(provider), true);

    // Simulate quota exhaustion with a future reset timestamp
    const futureReset = Date.now() + 10000;
    quota.recordQuotaExhausted(provider, futureReset, "quota_exhausted");

    // canCall should now return false due to active quota reset
    assert.equal(quota.canCall(provider), false);

    // Snapshot should reflect quota exhaustion
    const snap = quota.snapshot();
    const providerSnap = snap.find(p => p.provider === provider);
    assert.ok(providerSnap, "Snapshot should contain provider");
    assert.equal(providerSnap.quotaExhausted, true);
    assert.equal(providerSnap.quotaReason, "quota_exhausted");

    // Simulate expired reset timestamp
    const pastReset = Date.now() - 1000;
    quota.recordQuotaExhausted(provider, pastReset, "quota_exhausted");
    assert.equal(quota.canCall(provider), true, "Should allow calls after quota_resets_at has passed");
  });

  /**
   * @test Integration behavior where a provider exceeding ITPM or quota is skipped on subsequent requests.
   */
  test("Integration: provider exceeding ITPM/quota is correctly skipped on subsequent requests until reset period passes", async () => {
    // Seed catalog with two models from different providers
    bandit.db.prepare("INSERT INTO catalog (id, provider, max_input_tokens, is_free) VALUES (?, ?, ?, ?)").run("prov-a/model-1", "prov-a", 100000, 1);
    bandit.db.prepare("INSERT INTO catalog (id, provider, max_input_tokens, is_free) VALUES (?, ?, ?, ?)").run("prov-b/model-2", "prov-b", 100000, 1);

    // Select initial model
    const selected1 = await bandit.selectModel();
    assert.ok(selected1, "Should select a model initially");

    // Simulate ITPM / quota exhaustion on prov-a via recordQuotaExhausted
    const futureReset = Date.now() + 30000;
    bandit.quota.recordQuotaExhausted("prov-a", futureReset, "itpm_exceeded");

    // Verify selectModel skips prov-a because quota.canCall("prov-a") is false
    const selected2 = await bandit.selectModel();
    assert.ok(selected2, "Should select another available model");
    assert.notEqual(selected2.provider, "prov-a", "Should skip provider prov-a when quota is exhausted");
    assert.equal(selected2.provider, "prov-b", "Should fall back to prov-b");

    // Simulate reset time passing for prov-a
    const pastReset = Date.now() - 1000;
    bandit.quota.recordQuotaExhausted("prov-a", pastReset, "itpm_exceeded");

    // Now prov-a should be eligible again
    const selected3 = await bandit.selectModel();
    assert.ok(selected3, "Should be able to select model from prov-a after quota reset");
  });
});
