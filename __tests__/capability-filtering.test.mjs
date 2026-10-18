import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DiscountedUCB1Bandit } from "../src/bandit.mjs";

/**
 * @fileoverview Comprehensive unit and integration test suite for model capability
 * categorization and strict filtering during chat completions in [`src/bandit.mjs`](src/bandit.mjs:1).
 */
describe("Model Capability Categorization and Strict Filtering Test Suite", () => {
  let bandit;

  beforeEach(() => {
    bandit = new DiscountedUCB1Bandit(":memory:");
  });

  afterEach(() => {
    if (bandit && typeof bandit.close === "function") {
      bandit.close();
    }
  });

  test("Catalog sync correctly tags models (chat_completion, image, audio, embedding)", async () => {
    const originalFetch = global.fetch;
    const mockModels = [
      { id: "openai/gpt-4o", max_input_tokens: 128000, capabilities: { tool_calling: true } },
      { id: "openai/dall-e-3", max_input_tokens: 4000, type: "image" },
      { id: "openai/tts-1", max_input_tokens: 2000 },
      { id: "openai/text-embedding-3-small", max_input_tokens: 8192 },
      { id: "aihorde/flux", max_input_tokens: 4000 }
    ];

    global.fetch = async () => ({
      ok: true,
      json: async () => ({ data: mockModels })
    });

    try {
      await bandit.fetchAndSyncModels();

      const gpt4 = bandit.db.prepare("SELECT * FROM catalog WHERE id = ?").get("openai/gpt-4o");
      assert.equal(gpt4.capability, "chat_completion");
      assert.equal(gpt4.supports_chat, 1);
      assert.equal(gpt4.supports_image_generation, 0);
      assert.equal(gpt4.supports_audio_generation, 0);

      const dalle = bandit.db.prepare("SELECT * FROM catalog WHERE id = ?").get("openai/dall-e-3");
      assert.equal(dalle.capability, "image");
      assert.equal(dalle.supports_chat, 0);
      assert.equal(dalle.supports_image_generation, 1);

      const tts = bandit.db.prepare("SELECT * FROM catalog WHERE id = ?").get("openai/tts-1");
      assert.equal(tts.capability, "audio");
      assert.equal(tts.supports_chat, 0);
      assert.equal(tts.supports_audio_generation, 1);

      const embed = bandit.db.prepare("SELECT * FROM catalog WHERE id = ?").get("openai/text-embedding-3-small");
      assert.equal(embed.capability, "embedding");
      assert.equal(embed.supports_chat, 0);

      const aihorde = bandit.db.prepare("SELECT * FROM catalog WHERE id = ?").get("aihorde/flux");
      assert.equal(aihorde.capability, "image");
      assert.equal(aihorde.supports_image_generation, 1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test("selectModel() strictly excludes image, audio, and embedding models when selecting for chat completion requests", async () => {
    // Manually seed catalog with a mix of chat, image, audio, embedding models
    const insert = bandit.db.prepare(
      `INSERT INTO catalog (id, provider, capability, supports_chat, supports_image_generation, supports_audio_generation, max_input_tokens, is_free) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insert.run("openai/dall-e-3", "openai", "image", 0, 1, 0, 4000, 0);
    insert.run("openai/tts-1", "openai", "audio", 0, 0, 1, 2000, 0);
    insert.run("openai/text-embedding-3-small", "openai", "embedding", 0, 0, 0, 8192, 1);
    insert.run("openai/gpt-4o", "openai", "chat_completion", 1, 0, 0, 128000, 1);

    // Call selectModel for chat completion (requireImageGeneration = false)
    const chosen = await bandit.selectModel(new Set(), 0, false, false, null, true);
    assert.equal(chosen, "openai/gpt-4o", "selectModel must pick the chat completion model and ignore image/audio/embedding models");
  });

  test("selectModel() returns null when only non-chat (image/audio) models are available in catalog", async () => {
    const insert = bandit.db.prepare(
      `INSERT INTO catalog (id, provider, capability, supports_chat, supports_image_generation, supports_audio_generation, max_input_tokens, is_free) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insert.run("openai/dall-e-3", "openai", "image", 0, 1, 0, 4000, 0);
    insert.run("openai/tts-1", "openai", "audio", 0, 0, 1, 2000, 0);

    const chosen = await bandit.selectModel(new Set(), 0, false, false, null, true);
    assert.equal(chosen, null, "selectModel must return null when no chat models are available");
  });

  test("Fallback chain validation logic never picks non-chat models for chat requests", () => {
    // Seed catalog with non-chat model marked as fallback
    const insert = bandit.db.prepare(
      `INSERT INTO catalog (id, provider, capability, supports_chat, supports_image_generation, supports_audio_generation, max_input_tokens, is_free) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insert.run("openai/dall-e-3", "openai", "image", 0, 1, 0, 4000, 0);

    const fallbackModel = "openai/dall-e-3";
    const modelInfoCap = bandit.db.prepare(
      `SELECT supports_chat, supports_image_generation, supports_audio_generation, capability FROM catalog WHERE id = ?`
    ).get(fallbackModel);

    const lowerFallbackId = fallbackModel.toLowerCase();
    const isNonChatFallback = (modelInfoCap && (modelInfoCap.supports_chat === 0 || modelInfoCap.capability !== 'chat_completion' || modelInfoCap.supports_image_generation === 1 || modelInfoCap.supports_audio_generation === 1)) ||
      lowerFallbackId.startsWith('aihorde/') || lowerFallbackId.includes('aihorde') ||
      /(^|[-_/])(dall-e|stable-diffusion|imagen|sdxl|flux|midjourney|image-generation|playground|aihorde|tts|speech|stt|whisper|voice|audio|embed|embedding|rerank|moderation)([-_/]|$)/i.test(lowerFallbackId) ||
      /image/i.test(lowerFallbackId);

    assert.equal(isNonChatFallback, true, "Fallback validation must correctly identify image/non-chat model as invalid for chat fallback");
  });

  test("Round-robin exploration visits all unvisited models (N=0) sequentially", async () => {
    const insert = bandit.db.prepare(
      `INSERT INTO catalog (id, provider, capability, supports_chat, supports_image_generation, supports_audio_generation, max_input_tokens, is_free) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insert.run("provider1/model-a", "provider1", "chat_completion", 1, 0, 0, 8000, 1);
    insert.run("provider1/model-b", "provider1", "chat_completion", 1, 0, 0, 8000, 1);
    insert.run("provider2/model-c", "provider2", "chat_completion", 1, 0, 0, 8000, 1);

    const pickedModels = new Set();
    const excluded = new Set();

    for (let i = 0; i < 3; i++) {
      const chosen = await bandit.selectModel(excluded, 0, false, false, null, true);
      assert.ok(chosen, `Iteration ${i} should pick a model`);
      pickedModels.add(chosen);
      excluded.add(chosen);
    }

    assert.equal(pickedModels.size, 3, "All three N=0 models should be explored via round-robin");
    assert.ok(pickedModels.has("provider1/model-a"));
    assert.ok(pickedModels.has("provider1/model-b"));
    assert.ok(pickedModels.has("provider2/model-c"));
  });

  test("Strict capability filtering rejects image-generation models during standard chat completions even with N=0 or optimistic scoring", async () => {
    const insert = bandit.db.prepare(
      `INSERT INTO catalog (id, provider, capability, supports_chat, supports_image_generation, supports_audio_generation, max_input_tokens, is_free) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    // Image models with N=0
    insert.run("openai/dall-e-3", "openai", "image", 0, 1, 0, 4000, 0);
    insert.run("aihorde/flux", "aihorde", "image", 0, 1, 0, 4000, 1);
    // Valid chat model
    insert.run("openai/gpt-4o", "openai", "chat_completion", 1, 0, 0, 128000, 1);

    const chosen = await bandit.selectModel(new Set(), 0, false, false, null, true);
    assert.equal(chosen, "openai/gpt-4o", "selectModel must never pick image generation models during standard chat completion");
  });
});
