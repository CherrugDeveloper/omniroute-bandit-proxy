import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, "../bandit.db");

if (!fs.existsSync(dbPath)) {
  console.log(`Database not found at ${dbPath}`);
  process.exit(0);
}

const db = new Database(dbPath, { readonly: true });

console.log(`=== Provider History (${dbPath}) ===`);
const providers = db.prepare("SELECT * FROM provider_history").all();
console.log(JSON.stringify(providers, null, 2));

console.log("\n=== Meta ===");
const meta = db.prepare("SELECT * FROM meta").all();
console.log(JSON.stringify(meta, null, 2));

console.log("\n=== Catalog count ===");
const catCount = db.prepare("SELECT COUNT(*) as count FROM catalog").get();
console.log(JSON.stringify(catCount));

db.close();
