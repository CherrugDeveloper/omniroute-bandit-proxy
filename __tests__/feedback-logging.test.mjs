import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DiscountedUCB1Bandit } from "../src/bandit.mjs";

/**
 * @fileoverview Unit tests for Step 7: Feedback recording, reward calculation,
 * error classification, and database logging in src/bandit.mjs and src/index.mjs.
 */
describe("Step 7: Feedback Recording, Reward Calculation, Error Classification & Database Logging", () => {
  let bandit;

  beforeEach(() => {
    bandit = new DiscountedUCB1Bandit(":memory:");
  });

  afterEach(() => {
    if (bandit && typeof bandit.close === "function") {
      bandit.close();
    }
  });

  describe("Error Classification (_classifyError)", () => {
    /**
     * @test Verify ban-provider action for 403 account disabled / banned
     */
    test("classifies 403 account disabled as ban-provider", () => {
      const classification = bandit._classifyError({ status: 403, message: "account disabled or banned" }, "test-provider");
      assert.equal(classification.action, "ban-provider");
      assert.equal(classification.scope, "provider");
      assert.equal(classification.reason, "provider-banned");
    });

    /**
     * @test Verify ban-model action for 404 model not found
     */
    test("classifies 404 model not found as ban-model", () => {
      const classification = bandit._classifyError({ status: 404, message: "model does not exist or not found" }, "test-provider");
      assert.equal(classification.action, "ban-model");
      assert.equal(classification.scope, "model");
      assert.equal(classification.reason, "model-not-found");
    });

    /**
     * @test Verify cooldown-provider action for 429 quota exhausted
     */
    test("classifies 429 quota exhausted as cooldown-provider", () => {
      const classification = bandit._classifyError({ status: 429, message: "quota exceeded reset after 10m" }, "test-provider");
      assert.equal(classification.action, "cooldown-provider");
      assert.equal(classification.reason, "quota-exhausted");
      assert.equal(classification.cooldownMs, 24 * 3600 * 1000); // 24h per quota-exhausted (permanent condition)
    });

    /**
     * @test Verify cooldown-model action for 5xx server errors
     */
    test("classifies 500 server error as cooldown-model", () => {
      const classification = bandit._classifyError({ status: 500, message: "Internal Server Error" }, "test-provider");
      assert.equal(classification.action, "cooldown-model");
      assert.equal(classification.scope, "model");
      assert.equal(classification.reason, "server-error");
    });

    /**
     * @test Verify flag-provider action for 401 auth expired
     */
    test("classifies 401 authentication expired as flag-provider", () => {
      const classification = bandit._classifyError({ status: 401, message: "authentication expired" }, "test-provider");
      assert.equal(classification.action, "flag-provider");
      assert.equal(classification.reason, "auth-expired");
    });
  });

  describe("Reward Recording & Discounted UCB1 Statistics (recordFeedback)", () => {
    /**
     * @test Verify successful feedback updates N, sum_reward, resets fails
     */
    test("recordFeedback with success updates N and sum_reward correctly", async () => {
      bandit.db.prepare("INSERT INTO catalog (id, provider) VALUES (?, ?)").run("test-provider/model-a", "test-provider");
      await bandit.selectModel(new Set(), 0, false, false, null, true);

      const before = bandit.db.prepare("SELECT N, sum_reward, fails FROM models WHERE id = ?").get("test-provider/model-a");
      assert.equal(before.N, 0);

      bandit.recordFeedback("test-provider/model-a", true, 0.95, null);

      const after = bandit.db.prepare("SELECT N, sum_reward, fails FROM models WHERE id = ?").get("test-provider/model-a");
      assert.equal(after.N, 1);
      assert.equal(after.sum_reward, 0.95);
      assert.equal(after.fails, 0);
    });

    /**
     * @test Verify failure feedback increments fails count
     */
    test("recordFeedback with failure increments model fails count", async () => {
      bandit.db.prepare("INSERT INTO catalog (id, provider) VALUES (?, ?)").run("test-provider/model-a", "test-provider");
      await bandit.selectModel(new Set(), 0, false, false, null, true);

      bandit.recordFeedback("test-provider/model-a", false, 0, { status: 502, message: "Bad gateway" });

      const model = bandit.db.prepare("SELECT fails FROM models WHERE id = ?").get("test-provider/model-a");
      assert.equal(model.fails, 1);
    });
  });

  describe("Database Request Logging (request_logs)", () => {
    /**
     * @test Verify request_logs stores started_at and ended_at timestamps correctly
     */
    test("request_logs records started_at and ended_at timestamps on request lifecycle", async () => {
      bandit.db.prepare("INSERT INTO catalog (id, provider) VALUES (?, ?)").run("test-provider/model-a", "test-provider");
      await bandit.selectModel(new Set(), 0, false, false, null, true);

      // Simulate starting a request log (as done in index.mjs / bandit methods)
      bandit.db.prepare("INSERT INTO request_logs (started_at) VALUES (?)").run(Date.now());

      const logBefore = bandit.db.prepare("SELECT * FROM request_logs ORDER BY id DESC LIMIT 1").get();
      assert.ok(logBefore);
      assert.ok(logBefore.started_at > 0);
      assert.equal(logBefore.ended_at, null);

      // Simulate completing request feedback / logging end
      bandit.recordFeedback("test-provider/model-a", true, 1.0, null);

      const logAfter = bandit.db.prepare("SELECT * FROM request_logs ORDER BY id DESC LIMIT 1").get();
      assert.ok(logAfter);
      assert.ok(logAfter.ended_at > 0);
      assert.ok(logAfter.ended_at >= logAfter.started_at);
    });
  });
});
