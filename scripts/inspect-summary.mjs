#!/usr/bin/env node
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, "../bandit.db");

if (!fs.existsSync(dbPath)) {
  console.log("Database not found at " + dbPath);
  process.exit(0);
}

const db = new Database(dbPath, { readonly: true });

console.log("=== DATABASE STATE SUMMARY (" + dbPath + ") ===\n");
console.log("Current time (ms): " + Date.now() + "\n");

// 1. Models table summary
console.log("=== MODELS TABLE SUMMARY ===");
const models = db.prepare("SELECT * FROM models").all();
console.log("Total models: " + models.length);

// Count by status
const permanentModels = models.filter(m => m.permanent === 1);
const cooldownModels = models.filter(m => m.cooldown_until > Date.now());
const degradedModels = models.filter(m => m.degraded === 1);

console.log("Permanently banned models: " + permanentModels.length);
console.log("Models in cooldown: " + cooldownModels.length);
console.log("Degraded models: " + degradedModels.length);
console.log("Models with needs_attention: N/A (column does not exist in models table)");

// Show some examples
if (permanentModels.length > 0) {
  console.log("\nExamples of permanently banned models:");
  permanentModels.slice(0, 5).forEach(m => {
    console.log("  - " + m.id + " (provider: " + m.provider + ")");
  });
}

if (cooldownModels.length > 0) {
  console.log("\nExamples of models in cooldown:");
  cooldownModels.slice(0, 5).forEach(m => {
    const cooldownTime = new Date(m.cooldown_until).toISOString();
    console.log("  - " + m.id + " (provider: " + m.provider + ") until " + cooldownTime);
  });
}

// 2. Provider History summary
console.log("\n=== PROVIDER HISTORY SUMMARY ===");
const providers = db.prepare("SELECT * FROM provider_history").all();
console.log("Total providers: " + providers.length);

const permanentProviders = providers.filter(p => p.permanent === 1);
const cooldownProviders = providers.filter(p => p.cooldown_until > Date.now());
const attentionProviders = providers.filter(p => p.needs_attention === 1);

console.log("Permanently banned providers: " + permanentProviders.length);
console.log("Providers in cooldown: " + cooldownProviders.length);
console.log("Providers with needs_attention: " + attentionProviders.length);

if (attentionProviders.length > 0) {
  console.log("\nProviders with needs_attention:");
  attentionProviders.forEach(p => {
    console.log("  - " + p.provider + ": " + p.attention_reason + " (" + p.attention_message + ")");
  });
}

// 3. Catalog table summary
console.log("\n=== CATALOG TABLE SUMMARY ===");
const catalog = db.prepare("SELECT * FROM catalog").all();
console.log("Total catalog entries: " + catalog.length);

const visionModels = catalog.filter(c => c.supports_vision === 1);
const toolModels = catalog.filter(c => c.supports_tools === 1);
const visionToolModels = catalog.filter(c => c.supports_vision === 1 && c.supports_tools === 1);

console.log("Vision-capable models: " + visionModels.length);
console.log("Models with tool support: " + toolModels.length);
console.log("Models with both vision and tools: " + visionToolModels.length);

if (visionModels.length > 0) {
  console.log("\nVision-capable models:");
  visionModels.slice(0, 10).forEach(c => {
    console.log("  - " + c.id + " (provider: " + c.provider + ")");
  });
}

// 4. models_train table summary
console.log("\n=== MODELS_TRAIN TABLE SUMMARY ===");
const trainModels = db.prepare("SELECT * FROM models_train").all();
console.log("Total training models: " + trainModels.length);

// 5. Meta table
console.log("\n=== META TABLE ===");
const meta = db.prepare("SELECT * FROM meta").all();
console.log(JSON.stringify(meta, null, 2));

// 6. Check for emergency cooldown relaxation triggers
console.log("\n=== EMERGENCY COOLDOWN RELAXATION ANALYSIS ===");
const emergencyTriggers = {
  highPermanentCount: permanentModels.length > 50,
  highCooldownCount: cooldownModels.length > 100,
  highAttentionCount: attentionProviders.length > 5,
  quotaExhausted: attentionProviders.some(p => p.attention_reason === 'quota-exhausted'),
  highVisionToolCount: visionToolModels.length > 20
};

console.log("Emergency cooldown relaxation triggers:");
for (const [trigger, active] of Object.entries(emergencyTriggers)) {
  console.log("  - " + trigger + ": " + (active ? "ACTIVE" : "INACTIVE"));
}

// 7. Summary of why models are being filtered
console.log("\n=== MODEL FILTERING ANALYSIS ===");
const totalFilteredModels = permanentModels.length + cooldownModels.length + degradedModels.length;
const percentageFiltered = (totalFilteredModels / models.length) * 100;

console.log("Total models: " + models.length);
console.log("Models filtered out (permanent + cooldown + degraded): " + totalFilteredModels + " (" + percentageFiltered.toFixed(2) + "%)");
console.log("\nThis explains why emergency cooldown relaxation is triggered - " + percentageFiltered.toFixed(2) + "% of models are unavailable.");

db.close();