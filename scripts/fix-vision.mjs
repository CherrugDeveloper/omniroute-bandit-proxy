import Database from "better-sqlite3";
const db = Database("bandit.db");

const visionPatterns = [
  "%vision%", "%image%", "%-vl%", "%-vision%", "%-vl-%",
  "%gpt-4o%", "%claude-3%", "%claude-4%", "%claude-opus%", "%claude-sonnet%",
  "%gemini-1.5%", "%gemini-2.%", "%qwen%vl%", "%qwen3%vl%", "%llava%",
  "%pixtral%", "%moondream%", "%fuyu%", "%cogvlm%", "%internvl%",
  "%minicpm-v%", "%ovis%", "%capybara%", "%openflamingo%", "%kosmos%",
  "%nova-lite%", "%nova-micro%", "%nova-pro%", "%command-r+", "%command-r7b%"
];

let totalUpdated = 0;
for (const pattern of visionPatterns) {
  const stmt = db.prepare("UPDATE catalog SET supports_vision = 1 WHERE supports_vision = 0 AND id LIKE ?");
  const info = stmt.run(pattern);
  totalUpdated += info.changes;
  if (info.changes > 0) {
    console.log(`Pattern ${pattern}: updated ${info.changes} rows`);
  }
}

console.log(`Total updated rows: ${totalUpdated}`);
console.log(`Total vision models: ${db.prepare("SELECT COUNT(*) as count FROM catalog WHERE supports_vision = 1").get().count}`);
