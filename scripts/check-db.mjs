import Database from "better-sqlite3";
import fs from "node:fs";

const dbPath = "bandit.db";
if (!fs.existsSync(dbPath)) {
  console.log("Database not found");
  process.exit(0);
}

const db = new Database(dbPath, { readonly: true });

console.log("=== Provider History ===");
const providers = db.prepare("SELECT * FROM provider_history").all();
console.log(JSON.stringify(providers, null, 2));

console.log("\n=== Meta ===");
const meta = db.prepare("SELECT * FROM meta").all();
console.log(JSON.stringify(meta, null, 2));

console.log("\n=== Catalog count ===");
const catCount = db.prepare("SELECT COUNT(*) as count FROM catalog").get();
console.log(JSON.stringify(catCount));

db.close();