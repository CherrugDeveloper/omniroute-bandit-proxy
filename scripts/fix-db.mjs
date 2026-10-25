import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "../bandit.db");

const db = new Database(dbPath, { readonly: false });

const providersToFix = ["no-think", "cfp", "xao", "xai-oauth", "openrouter", "cxa", "dva"];

for (const provider of providersToFix) {
  console.log(`Fixing ${provider}...`);
  db.prepare("UPDATE provider_history SET cooldown_until = 0, permanent = 0, needs_attention = 0 WHERE provider = ?").run(provider);
}

db.close();
console.log("Database updated.");
