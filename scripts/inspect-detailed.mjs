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

console.log(`=== DETAILED DATABASE INSPECTION (${dbPath}) ===\n`);
console.log(`Current time (ms): ${Date.now()}\n`);

// Get table schemas
console.log("=== TABLE SCHEMAS ===");
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
for (const t of tables) {
  const schema = db.prepare(`PRAGMA table_info(${t.name})`).all();
  console.log(`\nTable: ${t.name}`);
  console.log(JSON.stringify(schema, null, 2));
}

// Count rows in each table
console.log("\n=== ROW COUNTS ===");
for (const t of tables) {
  const count = db.prepare(`SELECT COUNT(*) as count FROM ${t.name}`).get();
  console.log(`${t.name}: ${count.count}`);
}

// Provider History details
console.log("\n=== PROVIDER HISTORY (all) ===");
const providers = db.prepare("SELECT * FROM provider_history").all();
console.log(JSON.stringify(providers, null, 2));

// Models table - check schema first
console.log("\n=== MODELS TABLE ===");
const modelsSchema = db.prepare("PRAGMA table_info(models)").all();
console.log("Schema:", JSON.stringify(modelsSchema, null, 2));
const models = db.prepare("SELECT * FROM models").all();
console.log(`Total models: ${models.length}`);
console.log(JSON.stringify(models, null, 2));

// Catalog table - full details
console.log("\n=== CATALOG TABLE ===");
const catalogSchema = db.prepare("PRAGMA table_info(catalog)").all();
console.log("Schema:", JSON.stringify(catalogSchema, null, 2));
const catalog = db.prepare("SELECT * FROM catalog").all();
console.log(`Total catalog entries: ${catalog.length}`);

// Vision-capable models in catalog
console.log("\n=== VISION-CAPABLE MODELS (catalog) ===");
const visionModels = db.prepare("SELECT * FROM catalog WHERE supports_vision = 1").all();
console.log(`Count: ${visionModels.length}`);
console.log(JSON.stringify(visionModels, null, 2));

// Models with both vision and tools
console.log("\n=== MODELS WITH VISION+TOOLS (catalog) ===");
const visionToolModels = db.prepare("SELECT * FROM catalog WHERE supports_vision = 1 AND supports_tools = 1").all();
console.log(`Count: ${visionToolModels.length}`);
console.log(JSON.stringify(visionToolModels, null, 2));

// Models with tools
console.log("\n=== MODELS WITH TOOLS (catalog) ===");
const toolModels = db.prepare("SELECT * FROM catalog WHERE supports_tools = 1").all();
console.log(`Count: ${toolModels.length}`);
console.log(JSON.stringify(toolModels, null, 2));

// Models in cooldown
console.log("\n=== MODELS IN COOLDOWN (models table) ===");
const cooldownModels = db.prepare("SELECT * FROM models WHERE cooldown_until > ?").all(Date.now());
console.log(`Count: ${cooldownModels.length}`);
console.log(JSON.stringify(cooldownModels, null, 2));

// Permanently banned models
console.log("\n=== PERMANENTLY BANNED MODELS (models table) ===");
const bannedModels = db.prepare("SELECT * FROM models WHERE permanent = 1").all();
console.log(`Count: ${bannedModels.length}`);
console.log(JSON.stringify(bannedModels, null, 2));

// Degraded models
console.log("\n=== DEGRADED MODELS (models table) ===");
const degradedModels = db.prepare("SELECT * FROM models WHERE degraded = 1").all();
console.log(`Count: ${degradedModels.length}`);
console.log(JSON.stringify(degradedModels, null, 2));

// Models with needs_attention - models table doesn't have this column, check provider_history instead
console.log("\n=== MODELS WITH NEEDS_ATTENTION (models table - N/A, column doesn't exist) ===");
console.log("Note: models table does not have needs_attention column. Checking provider_history instead.");
const attentionProviders = db.prepare("SELECT * FROM provider_history WHERE needs_attention = 1").all();
console.log(`Providers with needs_attention: ${attentionProviders.length}`);
console.log(JSON.stringify(attentionProviders, null, 2));

// models_train table
console.log("\n=== MODELS_TRAIN TABLE ===");
const trainSchema = db.prepare("PRAGMA table_info(models_train)").all();
console.log("Schema:", JSON.stringify(trainSchema, null, 2));
const trainModels = db.prepare("SELECT * FROM models_train").all();
console.log(`Total: ${trainModels.length}`);
console.log(JSON.stringify(trainModels, null, 2));

// Meta table
console.log("\n=== META TABLE ===");
const meta = db.prepare("SELECT * FROM meta").all();
console.log(JSON.stringify(meta, null, 2));

// request_logs table (if exists)
console.log("\n=== REQUEST_LOGS TABLE ===");
const requestLogsExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='request_logs'").get();
if (requestLogsExists) {
  const requestLogs = db.prepare("SELECT * FROM request_logs ORDER BY rowid DESC LIMIT 50").all();
  console.log(`Recent logs count: ${requestLogs.length}`);
  console.log(JSON.stringify(requestLogs, null, 2));
} else {
  console.log("request_logs table does not exist");
}

db.close();