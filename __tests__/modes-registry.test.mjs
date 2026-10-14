import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  initRegistry,
  detectProfile,
  profileMultiplier,
  listDiscovered,
  labelDiscovered,
  dismissDiscovered,
  registryStats,
} from "../src/modes-registry.mjs";

// Initialize registry before running tests
initRegistry();

describe("Modes Registry & Profiling", () => {
  test("detectProfile: empty or whitespace system prompt returns empty source", () => {
    const res1 = detectProfile("");
    assert.equal(res1.mode, "enhance-prompt");
    assert.equal(res1.profile, "general");
    assert.equal(res1.source, "empty");

    const res2 = detectProfile("   ");
    assert.equal(res2.source, "empty");
  });

  test("detectProfile: pattern match correctly identifies mode and profile", () => {
    const res = detectProfile("You are a jest test engineer specializing in testing.");
    assert.equal(res.mode, "jest-test-engineer");
    assert.equal(res.profile, "code");
    assert.equal(res.source, "pattern");
    assert.ok(res.sig);
  });

  test("detectProfile: signature cache hit on subsequent calls", () => {
    const prompt = "You are a software architect designing scalable microservices.";
    const first = detectProfile(prompt);
    assert.equal(first.source, "pattern");

    const second = detectProfile(prompt);
    assert.equal(second.source, "signature");
    assert.equal(second.mode, first.mode);
    assert.equal(second.profile, first.profile);
    assert.equal(second.sig, first.sig);
  });

  test("detectProfile: unknown system prompt triggers discovery", () => {
    const uniquePrompt = `Unknown custom system prompt test ${Date.now()}`;
    const res = detectProfile(uniquePrompt);
    assert.equal(res.mode, null);
    assert.equal(res.profile, "generic");
    assert.equal(res.source, "unknown");
    assert.ok(res.sig);

    const stats = registryStats();
    assert.ok(stats.discovered >= 1);
  });

  test("profileMultiplier: generic or empty returns 1.0", () => {
    assert.equal(profileMultiplier("generic", "gpt-4"), 1.0);
    assert.equal(profileMultiplier("code", null), 1.0);
    assert.equal(profileMultiplier(null, "codestral"), 1.0);
  });

  test("profileMultiplier: FIM model returns 0.3", () => {
    assert.equal(profileMultiplier("code", "deepseek-coder-fim"), 0.3);
    assert.equal(profileMultiplier("summarizer", "qwen-fill-in-middle"), 0.3);
  });

  test("profileMultiplier: code profile boosts code models and penalizes thinking/small models", () => {
    // Code profile multipliers: codeBoost: 1.35, thinkingPenalty: 0.65, smallPenalty: 0.75
    const multiplierCode = profileMultiplier("code", "deepseek-coder");
    assert.ok(multiplierCode > 1.0, "code model should get codeBoost");

    const multiplierThinking = profileMultiplier("code", "deepseek-r1-thinking");
    assert.ok(multiplierThinking < 1.0, "thinking model should get thinkingPenalty in code profile");
  });

  test("profileMultiplier: summarizer profile penalizes big/thinking models and boosts fast models", () => {
    // summarizer: fastBoost: 2.5, notFastPenalty: 0.25, bigPenalty: 0.15, thinkingPenalty: 0.1, codePenalty: 0.5, smallPenalty: 0.9, tpmLowPenalty: 0.05
    const multiplierFast = profileMultiplier("summarizer", "gemini-3-flash");
    assert.ok(multiplierFast > 1.0, "fast model gets boosted for summarizer");

    const multiplierBig = profileMultiplier("summarizer", "gpt-5.2-pro");
    assert.ok(multiplierBig < 1.0, "big model gets penalized for summarizer");
  });

  test("discovery lifecycle: list, label, and dismiss", () => {
    const prompt = `Lifecycle test prompt ${Math.random()}`;
    const detected = detectProfile(prompt);
    assert.equal(detected.source, "unknown");

    const discoveredList = listDiscovered();
    const found = discoveredList.find(d => d.sig === detected.sig);
    assert.ok(found);

    // Label it
    const labelResult = labelDiscovered(detected.sig, "custom-mode", "code");
    assert.equal(labelResult.ok, true);

    // Verify it's now in signature cache
    const reDetected = detectProfile(prompt);
    assert.equal(reDetected.source, "signature");
    assert.equal(reDetected.mode, "custom-mode");
    assert.equal(reDetected.profile, "code");

    // Dismiss another unknown prompt
    const prompt2 = `Another unknown prompt ${Math.random()}`;
    const det2 = detectProfile(prompt2);
    assert.equal(det2.source, "unknown");
    const dismissed = dismissDiscovered(det2.sig);
    assert.equal(dismissed, true);
  });
});
