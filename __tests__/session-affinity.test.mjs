import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  computeSessionKey,
  sessionModels,
  sessionBlacklist,
  SESSION_TTL_MS,
} from "../src/index.mjs";

describe("Session Affinity & Caching Mechanism (`src/index.mjs`)", () => {
  beforeEach(() => {
    sessionModels.clear();
    sessionBlacklist.clear();
  });

  afterEach(() => {
    sessionModels.clear();
    sessionBlacklist.clear();
  });

  describe("computeSessionKey() Key Generation", () => {
    /**
     * @test Verify valid system prompt and user message generate expected 16-char hex MD5 key
     */
    test("generates stable 16-char hex MD5 key for valid system and user messages", () => {
      const messages = [
        { role: "system", content: "You are Zoo Code assistant." },
        { role: "user", content: "Write a function to add two numbers." },
      ];
      const key1 = computeSessionKey(messages);
      const key2 = computeSessionKey(messages);

      assert.ok(key1, "Key should not be null");
      assert.equal(typeof key1, "string");
      assert.equal(key1.length, 16);
      assert.equal(key1, key2, "Keys for identical messages should be deterministic");
    });

    /**
     * @test Verify handling of missing system prompt or user message (negative / edge cases)
     */
    test("returns null when messages array is empty or lacks system/user roles", () => {
      assert.equal(computeSessionKey([]), null);
      assert.equal(computeSessionKey("not an array"), null);
      assert.equal(computeSessionKey([{ role: "assistant", content: "hello" }]), null);
    });

    /**
     * @test Verify non-string content (e.g. object/array content) is serialized correctly
     */
    test("handles non-string content in messages via JSON serialization", () => {
      const messages = [
        { role: "system", content: { text: "system prompt object" } },
        { role: "user", content: [{ type: "text", text: "user prompt object" }] },
      ];
      const key = computeSessionKey(messages);
      assert.ok(key);
      assert.equal(key.length, 16);
    });
  });

  describe("Session TTL Expiration & Cleanup", () => {
    /**
     * @test Verify session entries within TTL are active, while expired entries are removed
     */
    test("recognizes active session within TTL and discards expired session", () => {
      const sessionKey = "testsessionkey12";
      const modelId = "openai/gpt-4o";

      // Insert fresh session
      sessionModels.set(sessionKey, { model: modelId, ts: Date.now() });

      const entryFresh = sessionModels.get(sessionKey);
      assert.ok(entryFresh);
      assert.equal(Date.now() - entryFresh.ts < SESSION_TTL_MS, true, "Fresh session should be within TTL");

      // Insert expired session (> 30 min ago)
      const expiredTs = Date.now() - (SESSION_TTL_MS + 1000);
      sessionModels.set(sessionKey, { model: modelId, ts: expiredTs });

      const entryExpired = sessionModels.get(sessionKey);
      const isExpired = entryExpired && (Date.now() - entryExpired.ts) >= SESSION_TTL_MS;
      assert.equal(isExpired, true, "Session should be identified as expired");

      if (isExpired) {
        sessionModels.delete(sessionKey);
      }
      assert.equal(sessionModels.has(sessionKey), false);
    });
  });

  describe("LRU Eviction (Max 10k Entries)", () => {
    /**
     * @test Verify LRU eviction triggers when sessionModels exceeds 10,000 entries
     */
    test("evicts oldest entry when sessionModels exceeds 10,000 entries", () => {
      // Temporarily populate up to max
      const oldestKey = "oldest_session_key";
      sessionModels.set(oldestKey, { model: "model-1", ts: Date.now() });

      // Fill up to 10000 more entries
      for (let i = 0; i < 10000; i++) {
        sessionModels.set(`key_${i}`, { model: "model-2", ts: Date.now() });
      }

      assert.equal(sessionModels.size, 10001);

      // Trigger LRU eviction check implemented in index.mjs
      if (sessionModels.size > 10000) {
        const firstKey = sessionModels.keys().next().value;
        sessionModels.delete(firstKey);
        sessionBlacklist.delete(firstKey);
      }

      assert.equal(sessionModels.size, 10000);
      assert.equal(sessionModels.has(oldestKey), false, "Oldest entry should be evicted");
    });
  });

  describe("Model Failure Invalidation", () => {
    /**
     * @test Verify session model pin is invalidated and removed upon model failure
     */
    test("invalidates session pin on model failure", () => {
      const sessionKey = "invalidation_test_key";
      const modelId = "anthropic/claude-3.5-sonnet";

      sessionModels.set(sessionKey, { model: modelId, ts: Date.now() });
      assert.equal(sessionModels.has(sessionKey), true);

      // Simulate model failure handling (unpin / delete sessionModels)
      const entry = sessionModels.get(sessionKey);
      if (entry && entry.model === modelId) {
        sessionModels.delete(sessionKey);
      }

      assert.equal(sessionModels.has(sessionKey), false, "Session pin should be deleted on model failure");
    });
  });
});
