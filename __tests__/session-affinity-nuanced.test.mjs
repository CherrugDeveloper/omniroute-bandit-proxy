import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { sessionBlacklist } from "../src/index.mjs";

describe("Nuanced Session Affinity Banning (`__tests__/session-affinity-nuanced.test.mjs`)", () => {
  beforeEach(() => {
    sessionBlacklist.clear();
  });

  test("does not ban model on 1 or 2 transient failures, but bans on 3rd failure or severe failure", () => {
    const sessionKey = "test_nuanced_session_1";
    const modelId = "openai/gpt-4o";

    let bl = sessionBlacklist.get(sessionKey);
    if (!bl) {
      bl = new Map();
      sessionBlacklist.set(sessionKey, bl);
    }

    // Simulate failure 1 (transient)
    let record = bl.get(modelId);
    if (!record || typeof record === "number") {
      record = { fails: typeof record === "number" ? record : 0, severe: false, lastReason: "" };
      bl.set(modelId, record);
    }
    record.fails += 1;
    record.lastReason = "transient error 502";

    let isBanned = record.severe || record.fails >= 3;
    assert.equal(isBanned, false, "Model should not be banned after 1 transient failure");

    // Simulate failure 2 (transient)
    record.fails += 1;
    record.lastReason = "transient error 503";
    isBanned = record.severe || record.fails >= 3;
    assert.equal(isBanned, false, "Model should not be banned after 2 transient failures");

    // Simulate failure 3 (reaches threshold)
    record.fails += 1;
    record.lastReason = "transient error 500";
    isBanned = record.severe || record.fails >= 3;
    assert.equal(isBanned, true, "Model should be banned after 3 failures");
  });

  test("immediately bans model on severe error (e.g. status 400 or context window)", () => {
    const sessionKey = "test_nuanced_session_2";
    const modelId = "anthropic/claude-3.5-sonnet";

    let bl = sessionBlacklist.get(sessionKey);
    if (!bl) {
      bl = new Map();
      sessionBlacklist.set(sessionKey, bl);
    }

    let record = bl.get(modelId);
    if (!record || typeof record === "number") {
      record = { fails: typeof record === "number" ? record : 0, severe: false, lastReason: "" };
      bl.set(modelId, record);
    }
    record.fails += 1;
    record.lastReason = "status 400 context window exceeded";
    record.severe = true;

    const isBanned = record.severe || record.fails >= 3;
    assert.equal(isBanned, true, "Model should be immediately banned on severe status 400 error even on 1st failure");
  });
});
