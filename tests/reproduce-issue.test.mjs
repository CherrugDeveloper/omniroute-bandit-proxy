import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DiscountedUCB1Bandit } from "../src/bandit.mjs";

describe("Reproduction Test: Failing requests missing from request_logs and metrics", () => {
  let bandit;

  beforeEach(() => {
    bandit = new DiscountedUCB1Bandit(":memory:");
  });

  afterEach(() => {
    if (bandit && typeof bandit.close === "function") {
      bandit.close();
    }
  });

  test("failing request records ended_at and error info in request_logs and updates metrics", async () => {
    bandit.db.prepare("INSERT INTO catalog (id, provider) VALUES (?, ?)").run("test-provider/model-a", "test-provider");
    await bandit.selectModel();

    // Record request start (as done in index.mjs via recordRequest)
    bandit.recordRequest();

    const logBefore = bandit.db.prepare("SELECT * FROM request_logs ORDER BY id DESC LIMIT 1").get();
    assert.ok(logBefore);
    assert.equal(logBefore.ended_at, null);

    // Simulate failure feedback (e.g. model failed with 500 or error)
    bandit.recordFeedback("test-provider/model-a", false, 0, { status: 500, message: "Internal Server Error" });

    const logAfter = bandit.db.prepare("SELECT * FROM request_logs ORDER BY id DESC LIMIT 1").get();
    assert.ok(logAfter);
    // Assertion that will fail currently because recordFeedback on failure does not update ended_at or status/error in request_logs
    assert.ok(logAfter.ended_at !== null, "ended_at should be set even on failure");
    assert.equal(logAfter.status_code, 500);
  });
});
