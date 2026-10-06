import { DiscountedUCB1Bandit } from "../src/bandit.mjs";

const bandit = new DiscountedUCB1Bandit();

console.log("[TEST] getFallbackModels() result:");
const fallbacks = bandit.getFallbackModels();
console.log(JSON.stringify(fallbacks, null, 2));

if (fallbacks.length === 2 && fallbacks[0] === "mistral/ministral-8b-latest" && fallbacks[1] === "groq/allam-2-7b") {
  console.log("\n✅ TEST PASSED: Fallback models loaded correctly from config");
} else {
  console.error("\n❌ TEST FAILED: Expected 2 fallback models, got", fallbacks);
  process.exit(1);
}

bandit.close();
