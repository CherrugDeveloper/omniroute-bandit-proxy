import Database from "better-sqlite3";

const db = new Database("bandit.db");

const providersToReset = ['openrouter', 'xao', 'xai-oauth'];

console.log("Resetting provider attention flags...");

const stmt = db.prepare(`
  UPDATE provider_history 
  SET needs_attention = 0, 
      attention_reason = '',
      attention_message = '',
      quota_resets_at = 0,
      quota_reason = ''
  WHERE provider = ?
`);

for (const provider of providersToReset) {
  const info = stmt.run(provider);
  console.log(`Provider ${provider}: ${info.changes} rows updated`);
}

console.log("\nVerification:");
const checkStmt = db.prepare("SELECT provider, needs_attention, attention_reason, quota_resets_at FROM provider_history WHERE provider IN (?, ?, ?)");
const results = checkStmt.all(...providersToReset);

results.forEach(r => {
  console.log(`${r.provider}: needs_attention=${r.needs_attention}, attention_reason='${r.attention_reason}', quota_resets_at=${r.quota_resets_at}`);
});

console.log("\nDone!");
