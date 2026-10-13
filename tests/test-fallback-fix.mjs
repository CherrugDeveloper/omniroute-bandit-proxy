import { DiscountedUCB1Bandit } from "../src/bandit.mjs";

const bandit = new DiscountedUCB1Bandit();

console.log("[TEST] getFallbackModels() result:");
const fallbacks = bandit.getFallbackModels();
console.log(JSON.stringify(fallbacks, null, 2));

const expectedFallbacks = [
  "mistral/ministral-8b-latest",
  "groq/allam-2-7b",
  "mistral/mistral-small-latest",
  "mistral/mistral-large-latest",
  "groq/llama-3.3-70b-versatile",
  "openrouter/gpt-oss-20b"
];

if (fallbacks.length === expectedFallbacks.length && fallbacks.every((f, i) => f === expectedFallbacks[i])) {
  console.log("\n✅ TEST PASSED: Fallback models loaded correctly from config");
} else {
  console.error("\n❌ TEST FAILED: Expected", expectedFallbacks, "got", fallbacks);
  process.exit(1);
}

bandit.close();
