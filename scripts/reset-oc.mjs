#!/usr/bin/env node
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, "../bandit.db");

if (!fs.existsSync(dbPath)) {
  console.log(`Database not found at ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath);

console.log("=== RESETTING OC PROVIDER STATE ===\n");

// Show current state
const beforeStmt = db.prepare("SELECT * FROM provider_history WHERE provider = 'oc'");
const before = beforeStmt.get();
console.log("BEFORE reset:");
console.log(`  cooldown_until: ${before.cooldown_until}`);
console.log(`  needs_attention: ${before.needs_attention}`);
console.log(`  attention_reason: ${before.attention_reason}`);
console.log(`  attention_message: ${before.attention_message.substring(0, 100)}...`);

// Use the same reset logic as _resetProviderCooldown in src/bandit.mjs
const resetStmt = db.prepare(`
  UPDATE provider_history 
  SET cooldown_until = 0, 
      circuit_breaker_until = 0, 
      consecutive_failures = 0, 
      needs_attention = 0, 
      attention_reason = '', 
      attention_message = ''
  WHERE provider = ?
`);

const info = resetStmt.run('oc');
console.log(`\nRows updated: ${info.changes}`);

// Verify
const afterStmt = db.prepare("SELECT * FROM provider_history WHERE provider = 'oc'");
const after = afterStmt.get();
console.log("\nAFTER reset:");
console.log(`  cooldown_until: ${after.cooldown_until}`);
console.log(`  needs_attention: ${after.needs_attention}`);
console.log(`  attention_reason: '${after.attention_reason}'`);
console.log(`  attention_message: '${after.attention_message}'`);

db.close();
console.log("\n=== RESET COMPLETE ===");