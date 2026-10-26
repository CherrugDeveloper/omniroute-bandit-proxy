import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DiscountedUCB1Bandit } from "../src/bandit.mjs";

/**
 * @fileoverview Comprehensive integration test for [`tests/integration-proxy-full.test.mjs`](tests/integration-proxy-full.test.mjs:1)
 * verifying successful and failing request lifecycles, database logging in [`request_logs`](src/bandit.mjs:101),
 * and metrics / dashboard stats retrieval via [`DiscountedUCB1Bandit.getMetrics()`](src/bandit.mjs:1057)
 * and [`DiscountedUCB1Bandit.getDashboardStats()`](src/bandit.mjs:1069).
 */
describe("Integration Proxy Full Test Suite", () => {
  let bandit;

  beforeEach(() => {
    // 1. Set up a fresh in-memory test environment to avoid existing server state
    bandit = new DiscountedUCB1Bandit(":memory:");
  });

  afterEach(() => {
    if (bandit && typeof bandit.close === "function") {
      bandit.close();
    }
  });

  /**
   * @test Verify successful and failing request recording, logs, and metrics/dashboard stats.
   */
  test("records successful and failing requests and updates request_logs, metrics, and dashboard stats correctly", async () => {
    // Seed catalog and model
    bandit.db.prepare("INSERT INTO catalog (id, provider, is_free) VALUES (?, ?, ?)").run("test-provider/model-a", "test-provider", 1);
    await bandit.selectModel(new Set(), 0, false, false, null, true);

    // 2a. Make a successful request
    bandit.recordRequest();
    // Simulate successful completion of request
    bandit.recordFeedback("test-provider/model-a", true, 1.0, null);

    // 2b. Make a failing request
    bandit.recordRequest();
    // Simulate failing completion of request (e.g. 500 Internal Server Error)
    bandit.recordFeedback("test-provider/model-a", false, 0, { status: 500, message: "Internal Server Error" });

    // 3a. Assert that the request_logs table contains entries for BOTH requests with correct status_code, ended_at, and error_message
    const logs = bandit.db.prepare("SELECT * FROM request_logs ORDER BY id ASC").all();
    assert.equal(logs.length, 2, "request_logs should contain entries for both successful and failing requests");

    // Success request log assertions
    const successLog = logs[0];
    assert.equal(successLog.status_code, 200, "Successful request status_code should be 200");
    assert.ok(successLog.ended_at !== null, "Successful request ended_at should be recorded");
    assert.equal(successLog.error_message, null, "Successful request error_message should be null");
    assert.ok(successLog.started_at <= successLog.ended_at, "started_at should be <= ended_at");

    // Failing request log assertions
    const failureLog = logs[1];
    assert.equal(failureLog.status_code, 500, "Failing request status_code should be 500");
    assert.ok(failureLog.ended_at !== null, "Failing request ended_at should be recorded");
    assert.equal(failureLog.error_message, "Internal Server Error", "Failing request error_message should match");
    assert.ok(failureLog.started_at <= failureLog.ended_at, "started_at should be <= ended_at");

    // 3b. Assert that GET /v1/metrics (bandit.getMetrics()) and GET /v1/dashboard/stats (bandit.getDashboardStats()) correctly include these requests
    const metrics = bandit.getMetrics();
    assert.ok(metrics, "Metrics object should be returned");
    assert.ok(Array.isArray(metrics.models), "Metrics models should be an array");
    assert.ok(Array.isArray(metrics.providers), "Metrics providers should be an array");
    const modelMetric = metrics.models.find(m => m.id === "test-provider/model-a");
    assert.ok(modelMetric, "Model metrics should include test-provider/model-a");
    assert.equal(modelMetric.N, 1, "Model N observations should reflect the successful request feedback");
    assert.equal(modelMetric.fails, 1, "Model fails should reflect the failing request feedback");

    const dashboardStats = bandit.getDashboardStats();
    assert.ok(dashboardStats, "Dashboard stats object should be returned");
    assert.equal(dashboardStats.totalRequests, 2, "totalRequests throughput should equal 2");
    assert.equal(dashboardStats.totalObservations, 1, "totalObservations should equal 1 (successful requests only)");
    assert.ok(typeof dashboardStats.avgLatencySec === "number", "avgLatencySec should be a number");
    assert.equal(dashboardStats.catalogTotal, 1, "catalogTotal should be 1");
  });
});
