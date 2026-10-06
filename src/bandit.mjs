import Database from "better-sqlite3";
import { profileMultiplier } from './modes-registry.mjs';
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";


export class DiscountedUCB1Bandit {
  constructor(dbPath = "bandit.db") {
    this.db = new Database(dbPath);
    this.discountFactor = 0.99;
    this.notifier = null;
    this.excludePaid = String(process.env.EXCLUDE_PAID || "false").toLowerCase() === "true";
    this.exploitOnly = String(process.env.EXPLOIT_ONLY || "false").toLowerCase() === "true";
    this.excludeThinking = String(process.env.EXCLUDE_THINKING || "false").toLowerCase() === "true";
    this.onlyFree = String(process.env.ONLY_FREE || "false").toLowerCase() === "true";
    this._initDB();
    this._migrateDB();
    this.totalObservations = this._getMeta("totalObservations");
    this._lastReward = new Map();
    this._rankCache = { at: 0, map: new Map() }; // cache classifica (30s TTL)
    this.totalRequests = this._getMeta("totalRequests");
  }

  getFallbackModels() {
    try {
      const modulePath = fileURLToPath(import.meta.url);
      const configPath = path.join(path.dirname(modulePath), "..", "config", "bandit.json");
      const configContent = fs.readFileSync(configPath, "utf8");
      const config = JSON.parse(configContent);
      return config.fallbackModels || [];
    } catch (err) {
      console.error("[BANDIT] Error reading fallback config:", err.message);
      return [];
    }
  }

  _initDB() {
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS models (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          N REAL DEFAULT 0,
          sum_reward REAL DEFAULT 0,
          fails INTEGER DEFAULT 0,
          cooldown_until REAL DEFAULT 0,
          permanent INTEGER DEFAULT 0,
          last_used_index INTEGER DEFAULT 0,
          consecutive_5xx INTEGER DEFAULT 0,
          degraded INTEGER DEFAULT 0,
          degraded_since REAL DEFAULT 0,
          is_paid INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS models_train (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          N REAL DEFAULT 0,
          sum_reward REAL DEFAULT 0,
          last_used_index INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS provider_history (
          provider TEXT PRIMARY KEY,
          fails INTEGER DEFAULT 0,
          cooldown_until REAL DEFAULT 0,
          pointer INTEGER DEFAULT 0,
          permanent INTEGER DEFAULT 0,
          needs_attention INTEGER DEFAULT 0,
          attention_reason TEXT DEFAULT '',
          attention_message TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY,
          value REAL NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS catalog (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          max_input_tokens INTEGER DEFAULT 0,
          is_free INTEGER DEFAULT 0,
          supports_tools INTEGER DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider);
        CREATE INDEX IF NOT EXISTS idx_catalog_provider ON catalog(provider);

        CREATE INDEX IF NOT EXISTS idx_models_cooldown ON models(cooldown_until);
      `);
    } catch (err) {
      console.error("[BANDIT] Errore inizializzazione DB:", err.message);
      throw err;
    }
  }

  _migrateDB() {
    try {
      const modelColumns = this.db.pragma("table_info(models)");
      const hasLastUsedIndex = modelColumns.some(col => col.name === "last_used_index");

      if (!hasLastUsedIndex) {
        console.log("[BANDIT] Migrazione: aggiungo last_used_index a models");
        try {
          this.db.exec(`ALTER TABLE models ADD COLUMN last_used_index INTEGER DEFAULT 0`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna last_used_index:", err.message);
          throw err;
        }
      }

      const providerColumns = this.db.pragma("table_info(provider_history)");
      const hasPointer = providerColumns.some(col => col.name === "pointer");

      if (!hasPointer) {
        console.log("[BANDIT] Migrazione: aggiungo pointer a provider_history");
        try {
          this.db.exec(`ALTER TABLE provider_history ADD COLUMN pointer INTEGER DEFAULT 0`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna pointer:", err.message);
          throw err;
        }
      }

      const hasNeedsAttention = providerColumns.some(col => col.name === "needs_attention");

      if (!hasNeedsAttention) {
        console.log("[BANDIT] Migrazione: aggiungo needs_attention a provider_history");
        try {
          this.db.exec(`ALTER TABLE provider_history ADD COLUMN needs_attention INTEGER DEFAULT 0`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna needs_attention:", err.message);
          throw err;
        }
      }

      const catalogColumns = this.db.pragma("table_info(catalog)");
      const hasMaxInput = catalogColumns.some(col => col.name === "max_input_tokens");

      if (!hasMaxInput) {
        console.log("[BANDIT] Migrazione: aggiungo max_input_tokens a catalog");
        try {
          this.db.exec(`ALTER TABLE catalog ADD COLUMN max_input_tokens INTEGER DEFAULT 0`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna max_input_tokens:", err.message);
          throw err;
        }
      }

      const hasSupportsTools = catalogColumns.some(col => col.name === "supports_tools");
      if (!hasSupportsTools) {
        console.log("[BANDIT] Migrazione: aggiungo supports_tools a catalog");
        try {
          this.db.exec(`ALTER TABLE catalog ADD COLUMN supports_tools INTEGER DEFAULT 0`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna supports_tools:", err.message);
          throw err;
        }
      }

      const hasCatalogIsFree = catalogColumns.some(col => col.name === "is_free");
      if (!hasCatalogIsFree) {
        console.log("[BANDIT] Migrazione: aggiungo is_free a catalog");
        try {
          this.db.exec(`ALTER TABLE catalog ADD COLUMN is_free INTEGER DEFAULT 0`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna is_free:", err.message);
          throw err;
        }
      }

      const hasModelsIsPaid = modelColumns.some(col => col.name === "is_paid");
      if (!hasModelsIsPaid) {
        console.log("[BANDIT] Migrazione: aggiungo is_paid a models");
        try {
          this.db.exec(`ALTER TABLE models ADD COLUMN is_paid INTEGER DEFAULT 0`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna is_paid:", err.message);
          throw err;
        }
      }

      const hasDynMax = modelColumns.some(col => col.name === "dynamic_max_tokens");
      if (!hasDynMax) {
        console.log("[BANDIT] Migrazione: aggiungo dynamic_max_tokens a models");
        try {
          this.db.exec(`ALTER TABLE models ADD COLUMN dynamic_max_tokens INTEGER DEFAULT 0`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna dynamic_max_tokens:", err.message);
          throw err;
        }
      }

      const hasConsecutive5xx = modelColumns.some(col => col.name === "consecutive_5xx");
      if (!hasConsecutive5xx) {
        console.log("[BANDIT] Migrazione: aggiungo consecutive_5xx a models");
        try {
          this.db.exec(`ALTER TABLE models ADD COLUMN consecutive_5xx INTEGER DEFAULT 0`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna consecutive_5xx:", err.message);
          throw err;
        }
      }

      const hasDegraded = modelColumns.some(col => col.name === "degraded");
      if (!hasDegraded) {
        console.log("[BANDIT] Migrazione: aggiungo degraded/degraded_since a models");
        try {
          this.db.exec(`ALTER TABLE models ADD COLUMN degraded INTEGER DEFAULT 0`);
          this.db.exec(`ALTER TABLE models ADD COLUMN degraded_since REAL DEFAULT 0`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonne degraded:", err.message);
          throw err;
        }
      }

      const hasAttentionReason = providerColumns.some(col => col.name === "attention_reason");
      if (!hasAttentionReason) {
        console.log("[BANDIT] Migrazione: aggiungo attention_reason/attention_message a provider_history");
        try {
          this.db.exec(`ALTER TABLE provider_history ADD COLUMN attention_reason TEXT DEFAULT ''`);
          this.db.exec(`ALTER TABLE provider_history ADD COLUMN attention_message TEXT DEFAULT ''`);
        } catch (err) {
          console.error("[BANDIT] Errore migrazione attention_reason:", err.message);
          throw err;
        }
      }

      console.log("[BANDIT] Migrazione database completata");
    } catch (err) {
      console.error("[BANDIT] Errore durante migrazione:", err.message);
      throw err;
    }
  }

  _getMeta(key) {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
    return row ? row.value : 0;
  }

  _setMeta(key, value) {
    this.db.prepare(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(key, value);
  }

  _incrMeta(key, delta = 1) {
    this.db.prepare(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = value + excluded.value`
    ).run(key, delta);
  }

  _registerModelUse(modelId, provider) {
    this.db.prepare(
      `INSERT OR IGNORE INTO provider_history (provider, fails, cooldown_until, pointer, permanent)
       VALUES (?, 0, 0, 0, 0)`
    ).run(provider);

    this.db.prepare(
      `INSERT INTO models (id, provider, last_used_index)
       VALUES (?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET last_used_index = last_used_index + 1`
    ).run(modelId, provider);
  }

  recordRequest() {
    this.totalRequests++;
    this._setMeta("totalRequests", this.totalRequests);
  }

  async fetchAndSyncModels() {
    try {
      const apiKey = process.env.OMNIROUTE_API_KEY || "";
      const baseUrl = process.env.OMNIROUTE_BASE_URL || "https://router.omniroute.ai/v1";

      const headers = {};
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

      const res = await fetch(`${baseUrl}/models`, { headers });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Impossibile recuperare i modelli da OmniRoute`);
      }

      const data = await res.json();
      const modelList = data.data || data.models || data;

      if (!Array.isArray(modelList)) {
        throw new Error("Response malformato: data.data non è array");
      }

      const insertStmt = this.db.prepare(
        `INSERT INTO catalog (id, provider, max_input_tokens, is_free, supports_tools) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET 
           provider = excluded.provider,
           max_input_tokens = excluded.max_input_tokens,
           is_free = excluded.is_free,
           supports_tools = excluded.supports_tools`
      );

      const isFreeModel = (id) => {
        const lower = String(id).toLowerCase();
        return /(:free|-free|_free|\/free)/.test(lower) || lower.includes(":free");
      };

      const isChatModel = (m, id) => {
        if (!m || typeof m !== "object") return true;

        if (m.type && !["chat", "text"].includes(String(m.type).toLowerCase())) {
          return false;
        }

        const outputs = m.output_modalities;
        if (Array.isArray(outputs)) {
          if (outputs.length !== 1 || String(outputs[0]).toLowerCase() !== "text") {
            return false;
          }
        }

        const lower = String(id).toLowerCase();
        if (/:batch\b/.test(lower)) return false;
        if (/(^|[-_/])tts([-_/]|$)|text-to-speech/.test(lower)) return false;
        if (/(^|[-_/])audio([-_/]|$)|speech/.test(lower)) return false;
        if (/(^|[-_/])image([-_/]|$)|dall-e|midjourney|stable-diffusion/.test(lower)) return false;
        if (/(^|[-_/])embed([-_/]|$)/.test(lower)) return false;
        if (/(^|[-_/])whisper([-_/]|$)/.test(lower)) return false;
        if (/(^|[-_/])music([-_/]|$)|lyria|suno|udio/.test(lower)) return false;

        return true;
      };

      const syncCatalog = this.db.transaction((models) => {
        this.db.prepare("DELETE FROM catalog").run();
        let inserted = 0;
        let skipped = 0;
        let raw = 0;

        for (const m of models) {
          const modelId = typeof m === "string" ? m : (m.id || m.name);
          if (!modelId) continue;
          raw++;

          if (modelId.startsWith("auto/") || modelId.includes("combo") || modelId.startsWith("gh/")) {
            continue;
          }

          if (!isChatModel(m, modelId)) {
            skipped++;
            continue;
          }

          const provider = this._getProvider(modelId);
          const maxInput = Number(m?.max_input_tokens || m?.context_length || 0) || 0;
          const isFree = isFreeModel(modelId) ? 1 : 0;
          const isFim = /fim|fill.?in.?the.?middle/i.test(modelId);
          const supportsTools = (!isFim && m && typeof m === "object" && m.capabilities && m.capabilities.tool_calling === true) ? 1 : 0;
          insertStmt.run(modelId, provider, maxInput, isFree, supportsTools);
          inserted++;
        }
        return { inserted, skipped, raw };
      });

      const { inserted, skipped, raw } = syncCatalog(modelList);
      this._setMeta("catalogRawCount", raw);
      console.log(`[BANDIT] Catalog sincronizzato: ${inserted} modelli chat (esclusi ${skipped} non-chat su ${raw} totali)`);
    } catch (err) {
      console.error("[BANDIT] Errore durante fetch modelli:", err.message);
      throw err;
    }
  }

  _getProvider(modelId) {
    if (!modelId || typeof modelId !== "string") return "unknown";
    if (modelId.includes("/")) {
      return modelId.split("/")[0];
    }
    const parts = modelId.split("-");
    const VARIANTS = new Set(["high", "low", "medium", "max", "minimal", "xhigh", "none", "ultra", "pro", "thinking", "1m", "latest", "flash", "luna", "sol", "terra"]);
    if (parts.length > 1 && VARIANTS.has(parts[parts.length - 1].toLowerCase())) {
      parts.pop();
    }
    return parts.slice(0, 2).join("-") || "default";
  }

  _normalizeExcludedModels(excludedModels) {
    if (excludedModels instanceof Set) {
      return excludedModels;
    }
    if (Array.isArray(excludedModels)) {
      return new Set(excludedModels.filter(m => typeof m === "string"));
    }
    if (typeof excludedModels === "string") {
      return new Set([excludedModels]);
    }
    return new Set();
  }

  getModelInfo(modelId) {
    const row = this.db.prepare(
      `SELECT id, provider, N, sum_reward, fails, degraded, cooldown_until, permanent
       FROM models WHERE id = ?`
    ).get(modelId);
    if (!row) {
      const cat = this.db.prepare("SELECT id, provider FROM catalog WHERE id = ?").get(modelId);
      if (!cat) return null;
      return {
        id: cat.id,
        provider: cat.provider,
        N: 0,
        avg: null,
        lastReward: null,
        trend: 'new',
        fails: 0,
        degraded: false,
        permanent: false,
      };
    }
    const avg = row.N > 0 ? row.sum_reward / row.N : null;
    const last = this._lastReward.get(modelId) ?? null;
    let trend = 'flat';
    if (avg != null && last != null) {
      trend = last > avg + 0.02 ? 'up' : last < avg - 0.02 ? 'down' : 'flat';
    }
    return {
      id: row.id,
      provider: row.provider,
      N: Math.round(row.N * 10) / 10,
      avg: avg != null ? Math.round(avg * 1000) / 1000 : null,
      lastReward: last,
      trend,
      fails: row.fails,
      degraded: !!row.degraded,
      permanent: !!row.permanent,
    };
  }

  getLastReward(modelId) {
    return this._lastReward.get(modelId) ?? null;
  }

  _getModelCooldownMs(fails) {
    if (fails >= 4) return null;
    const cooldowns = [
      0,
      30 * 60000,    // 1° fail → 30 min
      4 * 3600000,   // 2° fail → 4h
      12 * 3600000   // 3° fail → 12h
    ];
    return cooldowns[Math.min(fails, 3)];
  }

  getModelRank(modelId) {
    const now = Date.now();
    if (now - this._rankCache.at > 30000) {
      const rows = this.db.prepare(
        `SELECT id, sum_reward / N AS avg
         FROM models
         WHERE permanent = 0 AND degraded = 0 AND N >= 3 AND N > 0
         ORDER BY avg DESC`
      ).all();
      this._rankCache.map = new Map(rows.map((r, i) => [r.id, i + 1]));
      this._rankCache.at = now;
    }
    return this._rankCache.map.get(modelId) ?? null;
  }

  _getProviderCooldownMs(fails) {
    if (fails >= 4) return null;
    const cooldowns = [
      0,
      2 * 3600000,   // 1° fail → 2h
      8 * 3600000,   // 2° fail → 8h
      24 * 3600000   // 3° fail → 24h
    ];
    return cooldowns[Math.min(fails, 3)];
  }

  recordFeedback(modelId, success, reward = 1.0, errorDetails = null, opts = {}) {
    const tx = this.db.transaction(() => {
      const now = Date.now();
      const source = opts.source === 'training' ? 'training' : 'prod';

      if (source === 'training' || source === 'prod') {
        if (!success && errorDetails && typeof errorDetails === "object") {
          const cat = this.db.prepare("SELECT provider FROM catalog WHERE id = ?").get(modelId);
          const provider = cat?.provider || null;
          if (provider) {
            console.log(`[BANDIT] Processing error for model: ${modelId}, provider: ${provider}`);
            const c = this._classifyError(errorDetails, provider);
            console.log(`[BANDIT] Error classified: ${JSON.stringify(c)}`);
            switch (c.action) {
              case "ban-provider":
                console.log(`[BANDIT-TRAIN] ${modelId}: ban-provider (${c.reason})`);
                this._banProvider(provider);
                break;
              case "ban-model":
                console.log(`[BANDIT-TRAIN] ${modelId}: ban-model (${c.reason})`);
                this.db.prepare(`UPDATE models SET permanent = 1 WHERE id = ?`).run(modelId);
                break;
              case "cooldown-provider":
                console.log(`[BANDIT-TRAIN] ${modelId}: cooldown-provider (${c.reason}) per ${(c.cooldownMs/1000)|0}s`);
                if (c.reason === "no-credit" || /402|payment|credit|funds/i.test(String(errorDetails?.status || "") + " " + String(errorDetails?.message || ""))) {
                  this.db.prepare(`UPDATE models SET is_paid = 1 WHERE id = ?`).run(modelId);
                }
                this._forceProviderCooldown(provider, c.cooldownMs, c.reason);
                break;
              case "cooldown-paid-only":
                this._cooldownPaidOnly(provider, c.cooldownMs);
                break;
              case "flag-provider":
                console.log(`[BANDIT-TRAIN] ${modelId}: flag-provider (${c.reason})`);
                this._flagProviderAttention(provider, c.reason, errorDetails.message || errorDetails.error || "");
                break;
              case "cooldown-model": {
                const isTransient = ["server-error", "timeout", "unknown"].includes(c.reason);
                if (isTransient) {
                  this.db.prepare(`UPDATE models SET consecutive_5xx = consecutive_5xx + 1 WHERE id = ?`).run(modelId);
                }
                // Apply cooldown to model
                if (c.cooldownMs > 0) {
                  this.db.prepare(`UPDATE models SET cooldown_until = ? WHERE id = ?`).run(Date.now() + c.cooldownMs, modelId);
                } else if (isTransient) {
                  // For transient errors (server-error, timeout, unknown), set a default cooldown
                  // Use the model's cooldown based on its current fail count
                  const model = this.db.prepare("SELECT fails FROM models WHERE id = ?").get(modelId);
                  const failCount = model ? model.fails : 0;
                  const cooldownMs = this._getModelCooldownMs(failCount + 1);
                  if (cooldownMs && cooldownMs > 0) {
                    this.db.prepare(`UPDATE models SET cooldown_until = ? WHERE id = ?`).run(Date.now() + cooldownMs, modelId);
                  }
                }
                break;
              }
            }
          }
        }
      }

      if (success) {
        this.db.prepare(
          `UPDATE models SET sum_reward = sum_reward + ?, N = N + 1, fails = 0, last_used_index = last_used_index + 1, consecutive_5xx = 0
           WHERE id = ?`
        ).run(reward, modelId);
        this._lastReward.set(modelId, reward);
      } else {
        this.db.prepare(
          `UPDATE models SET fails = fails + 1, last_used_index = last_used_index + 1
           WHERE id = ?`
        ).run(modelId);
      }
    });
    tx();
  }

  _classifyError(errorDetails, provider) {
    const status = errorDetails.status || 0;
    const message = errorDetails.message || "";
    const reason = errorDetails.reason || "unknown";
    const is429 = status === 429;

    // 404 model not found -> ban-model
    if (status === 404 && /does not exist|not found/i.test(message)) {
      return { action: "ban-model", scope: "model", reason: "model-not-found" };
    }

    // 400 model not supported -> ban-model
    if (status === 400 && /not supported/i.test(message)) {
      return { action: "ban-model", scope: "model", reason: "model-not-supported" };
    }

    // Upstream bug (Assignment to constant) -> ban-model
    if (/Assignment to constant variable/i.test(message)) {
      return { action: "ban-model", scope: "model", reason: "upstream-bug" };
    }

    // No auth provided -> flag-provider
    if (status === 502 && /No auth provided|Please log in/i.test(message)) {
      return { action: "flag-provider", reason: "provider-misconfigured" };
    }

    // Playwright not available -> flag-provider
    if (status === 502 && /Playwright is not available/i.test(message)) {
      return { action: "flag-provider", reason: "provider-misconfigured" };
    }

    // 403 banned -> ban-provider
    if (status === 403 && /account disabled|banned/i.test(message)) {
      return { action: "ban-provider", scope: "provider", reason: "provider-banned" };
    }

    // 429 with model_cooldown code -> cooldown-model
    if (is429 && errorDetails.code === "model_cooldown") {
      return { action: "cooldown-model", scope: "model", reason: "rate-limit", cooldownMs: 0 };
    }

    // 429 quota exhausted -> cooldown-provider
    if (is429) {
      let cooldownMs;
      // Try to parse retryAfter from message (e.g., "reset after 5m")
      const retryAfterMatch = errorDetails.message.match(/reset after (\d+)(s|m|h)/i);
      if (retryAfterMatch) {
        const unit = retryAfterMatch[2];
        const value = parseInt(retryAfterMatch[1], 10);
        if (unit === 's') cooldownMs = value * 1000;
        else if (unit === 'm') cooldownMs = value * 60 * 1000;
        else if (unit === 'h') cooldownMs = value * 3600 * 1000;
      }
      if (cooldownMs === undefined) {
        const retryAfter = errorDetails.retryAfter || 0;
        cooldownMs = retryAfter > 0 ? retryAfter * 1000 : 30 * 60 * 1000;
      }

      const modelId = errorDetails.modelId || "";
      const model = this.db.prepare("SELECT fails FROM models WHERE id = ?").get(modelId);
      const repeated429 = model && model.fails >= 2;

      if (repeated429) {
        const cooldownMultiplier = 2;
        return {
          action: "cooldown-provider",
          reason: "quota-exhausted",
          cooldownMs: cooldownMs * cooldownMultiplier
        };
      } else {
        return {
          action: "cooldown-provider",
          reason: "quota-exhausted",
          cooldownMs: cooldownMs
        };
      }
    }

    // Timeout -> cooldown-model 10m
    if (/fetch timeout|timeout/i.test(message)) {
      return { action: "cooldown-model", scope: "model", reason: "timeout", cooldownMs: 10 * 60 * 1000 };
    }

    // 5xx -> cooldown-model (non provider)
    if (status >= 500 && status < 600) {
      return { action: "cooldown-model", scope: "model", reason: "server-error", cooldownMs: 0 };
    }

    // 402 insufficient funds -> cooldown-provider 6h
    if (status === 402 && /insufficient|funds|credit/i.test(message)) {
      return { action: "cooldown-provider", reason: "no-credit", cooldownMs: 6 * 3600 * 1000 };
    }

    // 418 anti-abuse -> cooldown-provider 6h
    if (status === 418 && /anti-abuse/i.test(message)) {
      return { action: "cooldown-provider", reason: "provider-blocked", cooldownMs: 6 * 3600 * 1000 };
    }

    return {
      action: "cooldown-model",
      reason: reason,
      cooldownMs: 0
    };
  }

  _parseResetAfter(message) {
    if (!message || typeof message !== "string") return 0;
    // Try "reset after 5m" / "retry after 30s"
    const match = message.match(/(?:reset|retry)\s+after\s+(\d+)(s|m|h)/i);
    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2].toLowerCase();
      if (unit === "s") return value * 1000;
      if (unit === "m") return value * 60 * 1000;
      if (unit === "h") return value * 3600 * 1000;
    }
    // Try JSON-like '"reset_seconds":117'
    const secsMatch = message.match(/"reset_seconds"\s*:\s*(\d+)/);
    if (secsMatch) {
      return parseInt(secsMatch[1], 10) * 1000;
    }
    return 0;
  }

  _unlockProvider(provider) {
    this.db.prepare(
      `UPDATE provider_history SET cooldown_until = 0 WHERE provider = ?`
    ).run(provider);
  }

  _recordTrainingFeedback(modelId, success, reward = 1.0) {
    this.db.prepare(
      `INSERT INTO models_train (id, provider, sum_reward, N, last_used_index)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET 
         sum_reward = sum_reward + excluded.sum_reward,
         N = N + excluded.N,
         last_used_index = last_used_index + 1`
    ).run(modelId, this._getProvider(modelId), reward, 1, 1);
  }

  _recordProviderFailure(provider) {
    this.db.prepare(
      `UPDATE provider_history SET fails = fails + 1 WHERE provider = ?`
    ).run(provider);
  }

  _forceProviderCooldown(provider, cooldownMs, reason = "") {
    const now = Date.now();
    this.db.prepare(
      `UPDATE provider_history SET cooldown_until = ?, needs_attention = 1, attention_reason = ?, attention_message = ? WHERE provider = ?`
    ).run(now + cooldownMs, reason, "Quota esaurita", provider);
  }

  _triggerFallback(modelId) {
    const fallbackModels = this.getFallbackModels();
    if (fallbackModels.length > 0) {
      console.log(`[BANDIT] Triggering fallback for model ${modelId}`);
      return fallbackModels[0];
    }
    return null;
  }

  _banProvider(provider) {
    this.db.prepare(
      `UPDATE provider_history SET permanent = 1 WHERE provider = ?`
    ).run(provider);
  }

  _cooldownPaidOnly(provider, cooldownMs) {
    this.db.prepare(
      `UPDATE models SET cooldown_until = ?, permanent = 0 WHERE provider = ?`
    ).run(Date.now() + cooldownMs, provider);
  }

  _flagProviderAttention(provider, reason, message) {
    this.db.prepare(
      `UPDATE provider_history SET needs_attention = 1, attention_reason = ?, attention_message = ? WHERE provider = ?`
    ).run(reason, message, provider);
  }

  _getModelCooldownMs(fails) {
    if (fails >= 4) return null;
    const cooldowns = [
      0,
      30 * 60000,    // 1° fail → 30 min
      4 * 3600000,   // 2° fail → 4h
      12 * 3600000   // 3° fail → 12h
    ];
    return cooldowns[Math.min(fails, 3)];
  }

  _getProviderCooldownMs(fails) {
    if (fails >= 4) return null;
    const cooldowns = [
      0,
      2 * 3600000,   // 1° fail → 2h
      8 * 3600000,   // 2° fail → 8h
      24 * 3600000   // 3° fail → 24h
    ];
    return cooldowns[Math.min(fails, 3)];
  }

  resetModel(modelId) {
    this.db.prepare(
      `UPDATE models SET fails = 0, cooldown_until = 0, permanent = 0, degraded = 0, consecutive_5xx = 0 WHERE id = ?`
    ).run(modelId);
  }

  resetProvider(provider) {
    this.db.prepare(
      `UPDATE provider_history SET fails = 0, cooldown_until = 0, permanent = 0, needs_attention = 0 WHERE provider = ?`
    ).run(provider);
  }

  resetGlobalCounters() {
    this.db.prepare("UPDATE meta SET value = 0 WHERE key = 'totalRequests'").run();
    this.db.prepare("UPDATE meta SET value = 0 WHERE key = 'totalObservations'").run();
  }

  blockModel(modelId) {
    this.db.prepare(
      `UPDATE models SET permanent = 1 WHERE id = ?`
    ).run(modelId);
  }

  clearProviderAttention(provider) {
    this.db.prepare(
      `UPDATE provider_history SET needs_attention = 0, attention_reason = '', attention_message = '' WHERE provider = ?`
    ).run(provider);
  }

  ignoreProvider(provider) {
    this.db.prepare(
      `UPDATE provider_history SET needs_attention = 0 WHERE provider = ?`
    ).run(provider);
  }

  getMetrics() {
    const models = this.db.prepare(
      `SELECT id, provider, N, sum_reward, fails, degraded, cooldown_until, permanent
       FROM models`
    ).all();
    const providers = this.db.prepare(
      `SELECT provider, fails, cooldown_until, permanent, needs_attention
       FROM provider_history`
    ).all();
    return { models, providers };
  }

  isModelAvailable(modelId) {
    const model = this.db.prepare(
      `SELECT cooldown_until FROM models WHERE id = ?`
    ).get(modelId);
    return !model || model.cooldown_until <= Date.now();
  }

  estimateTokens(body) {
    // Implementazione realistica: stima approssimativa del numero di token
    if (!body || typeof body !== "object") return 0;
    
    // Conta i messaggi
    const messages = body.messages || [];
    let totalChars = 0;
    
    for (const msg of messages) {
      if (typeof msg.content === "string") {
        totalChars += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        // Per i messaggi con contenuti multimodali, stima approssimativa
        for (const part of msg.content) {
          if (part.text) totalChars += part.text.length;
          if (part.type === "image_url") totalChars += 1000; // Stima approssimativa per immagine
        }
      } else {
        // Fallback: converti in JSON
        totalChars += JSON.stringify(msg.content).length;
      }
    }
    
    // Conversione approssimativa da caratteri a token (media ~4 caratteri per token)
    return Math.ceil(totalChars / 4);
  }

  maxCatalogInput() {
    const row = this.db.prepare("SELECT MAX(max_input_tokens) FROM catalog").get();
    return row ? row['MAX(max_input_tokens)'] : 0;
  }

  getProviderCount() {
    return this.db.prepare("SELECT COUNT(DISTINCT provider) FROM catalog").get()['COUNT(DISTINCT provider)'] || 0;
  }

  getModelRank(modelId) {
    const now = Date.now();
    if (now - this._rankCache.at > 30000) {
      const rows = this.db.prepare(
        `SELECT id, sum_reward / N AS avg
         FROM models
         WHERE permanent = 0 AND degraded = 0 AND N >= 3 AND N > 0
         ORDER BY avg DESC`
      ).all();
      this._rankCache.map = new Map(rows.map((r, i) => [r.id, i + 1]));
      this._rankCache.at = now;
    }
    return this._rankCache.map.get(modelId) ?? null;
  }

  selectModel(excluded = new Set(), estimatedTokens = 0, requireTools = false, profile = null, cooledDownThisRequest = true) {
    const now = Date.now();
    const excludeSet = this._normalizeExcludedModels(excluded);

    // Get all models from catalog that are available
    const catalogModels = this.db.prepare(`
      SELECT c.id, c.provider, 0 AS N, 0 AS sum_reward, 0 AS fails, 0 AS degraded, 0 AS cooldown_until, 0 AS permanent, c.max_input_tokens, c.supports_tools
      FROM catalog c
    `).all();

    // Get all models from models table
    const dbModels = this.db.prepare(`
      SELECT m.id, m.provider, m.N, m.sum_reward, m.fails, m.degraded, m.cooldown_until, m.permanent
      FROM models m
      WHERE m.permanent = 0
    `).all();

    // Combine catalog and db models, preferring db models when there's a conflict
    const modelMap = new Map();
    for (const model of catalogModels) {
      modelMap.set(model.id, model);
    }
    for (const model of dbModels) {
      modelMap.set(model.id, model); // db models overwrite catalog models
    }
    const models = Array.from(modelMap.values());

    // Log filter criteria for debugging
    console.log(`[BANDIT] selectModel: estimatedTokens=${estimatedTokens} requireTools=${requireTools} excluded=${[...excludeSet].join(",")} profile=${profile}`);

    // Filter out models that are unavailable
    const availableModels = models.filter(model => {
      // Skip if model is in cooldown
      if (model.cooldown_until && model.cooldown_until > now) {
        console.log(`[BANDIT] Filter ${model.id}: in cooldown`);
        return false;
      }
      // Check provider status: cooldown, permanent, needs_attention
      const prov = this.db.prepare(
        `SELECT cooldown_until, permanent, needs_attention FROM provider_history WHERE provider = ?`
      ).get(model.provider);
      if (prov) {
        if (prov.cooldown_until > now) {
          console.log(`[BANDIT] Filter ${model.id}: provider ${model.provider} in cooldown`);
          return false;
        }
        if (prov.permanent === 1) {
          console.log(`[BANDIT] Filter ${model.id}: provider ${model.provider} permanently banned`);
          return false;
        }
        if (prov.needs_attention === 1) {
          console.log(`[BANDIT] Filter ${model.id}: provider ${model.provider} needs attention`);
          return false;
        }
      }
      // Skip if permanently banned at model level
      if (model.permanent === 1) {
        console.log(`[BANDIT] Filter ${model.id}: permanently banned`);
        return false;
      }
      // Skip if in exclude set
      if (excludeSet.has(model.id)) {
        console.log(`[BANDIT] Filter ${model.id}: in excluded set`);
        return false;
      }
      // Skip if model can't handle the estimated tokens
      if (estimatedTokens > 0) {
        const maxInput = model.max_input_tokens || 0;
        // Allow 10% margin for estimation error
        if (maxInput > 0 && estimatedTokens > maxInput * 1.1) {
          console.log(`[BANDIT] Filter ${model.id}: estimatedTokens=${estimatedTokens} > max_input_tokens=${maxInput}`);
          return false;
        }
      }
      // Skip if model doesn't support tools and tools are required
      if (requireTools && !(model.supports_tools || 0)) {
        console.log(`[BANDIT] Filter ${model.id}: requires tools but doesn't support them`);
        return false;
      }
      return true;
    });

    if (availableModels.length === 0) {
      return null;
    }

    // Select model using UCB1-like ranking (simplified: pick highest rank)
    // First, filter out cooldown models and rank the rest
    let bestModel = availableModels[0];
    let bestScore = -Infinity;

    for (const model of availableModels) {
      const rank = this.getModelRank(model.id) ?? 0;
      if (rank > bestScore) {
        bestScore = rank;
        bestModel = model;
      }
    }

    // Register the selected model use
    this._registerModelUse(bestModel.id, bestModel.provider);

    return bestModel.id;
  }

  getUnhealthyModels(batchSize = 5) {
    const now = Date.now();
    return this.db.prepare(`
      SELECT m.id, m.provider, m.N, m.sum_reward, m.fails, m.degraded, m.cooldown_until, m.permanent
      FROM models m
      WHERE m.degraded = 1 OR (m.cooldown_until > 0 AND m.cooldown_until > ?)
      LIMIT ?
    `, [now, batchSize]).all();
  }

  getModelMaxInput(modelId) {
    // First check the catalog
    const catRow = this.db.prepare(
      `SELECT max_input_tokens FROM catalog WHERE id = ?`
    ).get(modelId);

    if (catRow && catRow.max_input_tokens > 0) {
      return catRow.max_input_tokens;
    }

    // Fallback to models table
    const modelRow = this.db.prepare(
      `SELECT max_input_tokens FROM models WHERE id = ?`
    ).get(modelId);

    if (modelRow && modelRow.max_input_tokens > 0) {
      return modelRow.max_input_tokens;
    }

    // Default fallback
    return 0;
  }

  reviveModel(modelId) {
    this.db.prepare(
      `UPDATE models SET cooldown_until = 0, degraded = 0 WHERE id = ?`
    ).run(modelId);
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}