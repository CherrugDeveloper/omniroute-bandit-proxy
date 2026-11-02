import Database from "better-sqlite3";
import fs from "fs";

const dbPath = process.env.DATABASE_PATH || "bandit.db";
if (!fs.existsSync(dbPath)) {
  console.error(`Database not found at ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath);

console.log("Resetting all provider attention flags...");

const stmt = db.prepare(`
  UPDATE provider_history 
  SET needs_attention = 0, 
      attention_reason = '',
      attention_message = '',
      quota_resets_at = 0,
      quota_reason = ''
  WHERE needs_attention = 1
`);

const info = stmt.run();
console.log(`${info.changes} providers were reset.`);

console.log("\nDone!");
