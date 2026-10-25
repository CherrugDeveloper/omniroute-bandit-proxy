import Database from "better-sqlite3";
import path from "path";

const dbPath = process.env.DATABASE_PATH || "bandit.db";
const db = new Database(dbPath);

const models = db.prepare("SELECT id, provider, permanent, cooldown_until FROM models WHERE permanent = 1 OR cooldown_until > ?").all(Date.now());
console.log("Permanent or Cooldown models:", models);

const providers = db.prepare("SELECT provider, permanent, cooldown_until, needs_attention FROM provider_history WHERE permanent = 1 OR cooldown_until > ? OR needs_attention = 1").all(Date.now());
console.log("Permanent or Cooldown/Attention providers:", providers);
