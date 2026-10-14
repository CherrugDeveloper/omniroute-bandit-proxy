#!/usr/bin/env node
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

console.log(`=== DATABASE INSPECTION (${dbPath}) ===\n`);

console.log("=== Provider History ===");
const providers = db.prepare("SELECT * FROM provider_history").all();
console.log(JSON.stringify(providers, null, 2));

console.log("\n=== Models (from models table) ===");
const models = db.prepare("SELECT * FROM models").all();
console.log(JSON.stringify(models, null, 2));

console.log("\n=== Catalog (from catalog table) ===");
const catalog = db.prepare("SELECT id, provider, max_input_tokens, is_free, supports_tools FROM catalog").all();
console.log(JSON.stringify(catalog, null, 2));

console.log("\n=== Meta ===");
const meta = db.prepare("SELECT * FROM meta").all();
console.log(JSON.stringify(meta, null, 2));

console.log("\n=== Catalog count ===");
const catCount = db.prepare("SELECT COUNT(*) as count FROM catalog").get();
console.log(JSON.stringify(catCount));

console.log("\n=== Models with tool support ===");
const toolModels = db.prepare("SELECT id, provider FROM catalog WHERE supports_tools = 1").all();
console.log(JSON.stringify(toolModels, null, 2));

console.log("\n=== Free models ===");
const freeModels = db.prepare("SELECT id, provider FROM catalog WHERE is_free = 1").all();
console.log(JSON.stringify(freeModels, null, 2));

db.close();
