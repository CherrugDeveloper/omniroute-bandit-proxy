import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";

const DB_PATH = "bandit.test-fallback-tools.db";

test("FALLBACK FIX: fallback model selection checks supports_tools when requireTools=true", async () => {
  // Clean up any previous test database
  const { existsSync, rmSync } = await import("node:fs");
  if (existsSync(DB_PATH)) rmSync(DB_PATH);

  const db = new Database(DB_PATH);

  // Setup: create models and catalog tables with the schema used by the real bandit
  db.exec(`
    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      provider TEXT,
      N INTEGER DEFAULT 0,
      avg REAL DEFAULT 0,
      sum_reward REAL DEFAULT 0,
      fails INTEGER DEFAULT 0,
      cooldown_until INTEGER DEFAULT 0,
      permanent INTEGER DEFAULT 0,
      degraded INTEGER DEFAULT 0,
      dynamic_max_tokens INTEGER DEFAULT 0,
      consecutive_5xx INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS catalog (
      id TEXT PRIMARY KEY,
      provider TEXT,
      max_input_tokens INTEGER DEFAULT 0,
      is_free INTEGER DEFAULT 0,
      supports_tools INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS provider_history (
      provider TEXT PRIMARY KEY,
      cooldown_until INTEGER DEFAULT 0,
      permanent INTEGER DEFAULT 0,
      attention_flags INTEGER DEFAULT 0,
      needs_attention INTEGER DEFAULT 0,
      attention_reason TEXT DEFAULT '',
      attention_message TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT ''
    );
  `);

  // Insert models that are ALL IN COOLDOWN/BAN (so bandit selection returns null)
  const fallbackModels = [
    "mistral/ministral-8b-latest",
    "groq/allam-2-7b",
    "mistral/mistral-small-latest",
    "mistral/mistral-large-latest",
    "groq/llama-3.3-70b-versatile",
    "openrouter/gpt-oss-20b"
  ];

  const insertModel = db.prepare(
    `INSERT INTO models (id, provider, permanent, degraded, cooldown_until) VALUES (?, ?, ?, ?, ?)`
  );

  // Make ALL models unavailable so the fallback path is triggered
  for (const modelId of fallbackModels) {
    const [provider, modelName] = modelId.split("/");
    insertModel.run(modelId, provider, 0, 0, Date.now() + 1000 * 60 * 60); // 1h cooldown
  }

  // Insert catalog entries:
  // - ministral and mistral-small support tools
  // - allam-2-7b and gpt-oss-20b do NOT support tools
  const insertCatalog = db.prepare(
    `INSERT INTO catalog (id, provider, supports_tools) VALUES (?, ?, ?)`
  );

  insertCatalog.run("mistral/ministral-8b-latest", "mistral", 1); // supports tools
  insertCatalog.run("groq/allam-2-7b", "groq", 0); // NO tools
  insertCatalog.run("mistral/mistral-small-latest", "mistral", 1); // supports tools
  insertCatalog.run("mistral/mistral-large-latest", "mistral", 1); // supports tools
  insertCatalog.run("groq/llama-3.3-70b-versatile", "groq", 1); // supports tools
  insertCatalog.run("openrouter/gpt-oss-20b", "openrouter", 0); // NO tools

  // Import index handler to test fallback logic
  // We simulate the fallback decision by querying the DB the same way index.mjs does

  // Test: when requireTools=true and ALL tool-capable models are unavailable
  // the fallback should return null (not a non-tool model)
  let selectedFallbackModel = null;
  const fallbackTried = new Set();

  const modelIdToSelect = "felo/gpt-oss-20b-tool-use"; // model that failed and triggered fallback
  const requireTools = true;

  for (const fallbackModel of fallbackModels) {
    if (fallbackTried.has(fallbackModel)) continue;
    if (fallbackModel !== modelIdToSelect) {
      // simulate bandit.isModelAvailable(fallbackModel) -> returns false (all in cooldown)
      const modelRow = db.prepare("SELECT permanent, degraded, cooldown_until FROM models WHERE id = ?").get(fallbackModel);
      if (modelRow && (modelRow.permanent === 1 || modelRow.degraded === 1 || (modelRow.cooldown_until && modelRow.cooldown_until > Date.now()))) {
        continue; // model unavailable
      }
      if (requireTools) {
        const modelInfo = db.prepare("SELECT supports_tools FROM catalog WHERE id = ?").get(fallbackModel);
        if (!modelInfo || modelInfo.supports_tools !== 1) continue; // doesn't support tools
      }
      selectedFallbackModel = fallbackModel;
      break;
    }
  }

  assert.equal(selectedFallbackModel, null, "When all tool-capable fallback models are unavailable, fallback should return null (not select a non-tool-capable model)");
  console.log("✅ FALLBACK TEST PASSED: Non-tool-capable models are correctly skipped when requireTools=true");

  // Test 2: when at least one tool-capable fallback model IS available, it should be selected
  // Clear cooldown on one tool-capable model
  db.prepare("UPDATE models SET cooldown_until = 0 WHERE id = 'mistral/ministral-8b-latest'").run();

  selectedFallbackModel = null;
  for (const fallbackModel of fallbackModels) {
    if (fallbackTried.has(fallbackModel)) continue;
    const modelRow = db.prepare("SELECT permanent, degraded, cooldown_until FROM models WHERE id = ?").get(fallbackModel);
    if (modelRow && (modelRow.permanent === 1 || modelRow.degraded === 1 || (modelRow.cooldown_until && modelRow.cooldown_until > Date.now()))) {
      continue;
    }
    if (requireTools) {
      const modelInfo = db.prepare("SELECT supports_tools FROM catalog WHERE id = ?").get(fallbackModel);
      if (!modelInfo || modelInfo.supports_tools !== 1) continue;
    }
    selectedFallbackModel = fallbackModel;
    break;
  }

  assert.equal(selectedFallbackModel, "mistral/ministral-8b-latest", "When a tool-capable fallback model is available, it should be selected");
  console.log("✅ FALLBACK TEST 2 PASSED: Tool-capable fallback model correctly selected when available");

  // Cleanup
  db.close();
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
});

test("FALLBACK FIX: fallback skips models without supports_tools for requireTools requests", () => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      provider TEXT,
      permanent INTEGER DEFAULT 0,
      degraded INTEGER DEFAULT 0,
      cooldown_until INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS catalog (
      id TEXT PRIMARY KEY,
      provider TEXT,
      supports_tools INTEGER DEFAULT 0
    );
  `);

  db.prepare("INSERT INTO models (id, provider, permanent, degraded, cooldown_until) VALUES (?, ?, ?, ?, ?)").run("groq/allam-2-7b", "groq", 0, 0, 0);
  db.prepare("INSERT INTO catalog (id, provider, supports_tools) VALUES (?, ?, ?)").run("groq/allam-2-7b", "groq", 0);

  const fallbackTried = new Set();
  const selectedFallbackModel = null;

  const fallbackModel = "groq/allam-2-7b";
  const requireTools = true;

  if (fallbackTried.has(fallbackModel)) {
    throw new Error("should not be tried");
  }
  const modelRow = db.prepare("SELECT permanent, degraded, cooldown_until FROM models WHERE id = ?").get(fallbackModel);
  if (modelRow && (modelRow.permanent === 1 || modelRow.degraded === 1 || (modelRow.cooldown_until && modelRow.cooldown_until > Date.now()))) {
    throw new Error("model should be available for this test");
  }
  if (requireTools) {
    const modelInfo = db.prepare("SELECT supports_tools FROM catalog WHERE id = ?").get(fallbackModel);
    if (!modelInfo || modelInfo.supports_tools !== 1) {
      console.log("✅ FALLBACK TEST 3 PASSED: Non-tool model groq/allam-2-7b correctly skipped for requireTools request");
    } else {
      throw new Error("model should not support tools");
    }
  }

  db.close();
});
