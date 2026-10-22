import Database from "better-sqlite3";
import { profileMultiplier } from './modes-registry.mjs';
import { sanitizeBaseUrl, buildEndpointUrl } from './health-check.mjs';
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ProviderQuota from './provider-quota.mjs';


export class DiscountedUCB1Bandit {
  constructor(dbPath = "bandit.db") {
    if (typeof DEBUG !== 'undefined' && DEBUG) console.log(`[DIAGNOSTIC] Initializing database at ${dbPath}`);
    this.db = new Database(dbPath);
    this.db.function('REGEXP', (pattern, text) => {
      return new RegExp(pattern, 'i').test(String(text || '')) ? 1 : 0;
    });
    try {
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('busy_timeout = 5000');
      const mode = this.db.pragma('journal_mode', { simple: true });
      const timeout = this.db.pragma('busy_timeout', { simple: true });
      console.log(`[BANDIT] DB pragma configured - journal_mode: ${mode}, busy_timeout: ${timeout}`);
    } catch (e) {
      console.error(`[BANDIT] Error setting DB pragmas: ${e.message}`);
    }
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
    this.quota = new ProviderQuota(this.db);
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
          supports_tools INTEGER DEFAULT 0,
          supports_image_generation INTEGER DEFAULT 0,
          capability TEXT DEFAULT 'chat_completion',
          supports_chat INTEGER DEFAULT 1,
          supports_audio_generation INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS request_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          started_at REAL,
          ended_at REAL,
          status_code INTEGER,
          error_message TEXT,
          model TEXT,
          provider TEXT
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

      const hasSupportsImageGeneration = catalogColumns.some(col => col.name === "supports_image_generation");
      if (!hasSupportsImageGeneration) {
        console.log("[BANDIT] Migrazione: aggiungo supports_image_generation a catalog");
        try {
          this.db.exec(`ALTER TABLE catalog ADD COLUMN supports_image_generation INTEGER DEFAULT 0`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna supports_image_generation:", err.message);
          throw err;
        }
      }

      const hasCapability = catalogColumns.some(col => col.name === "capability");
      if (!hasCapability) {
        console.log("[BANDIT] Migrazione: aggiungo capability a catalog");
        try {
          this.db.exec(`ALTER TABLE catalog ADD COLUMN capability TEXT DEFAULT 'chat_completion'`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna capability:", err.message);
          throw err;
        }
      }

      const hasSupportsChat = catalogColumns.some(col => col.name === "supports_chat");
      if (!hasSupportsChat) {
        console.log("[BANDIT] Migrazione: aggiungo supports_chat a catalog");
        try {
          this.db.exec(`ALTER TABLE catalog ADD COLUMN supports_chat INTEGER DEFAULT 1`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna supports_chat:", err.message);
          throw err;
        }
      }

      const hasSupportsAudioGeneration = catalogColumns.some(col => col.name === "supports_audio_generation");
      if (!hasSupportsAudioGeneration) {
        console.log("[BANDIT] Migrazione: aggiungo supports_audio_generation a catalog");
        try {
          this.db.exec(`ALTER TABLE catalog ADD COLUMN supports_audio_generation INTEGER DEFAULT 0`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna supports_audio_generation:", err.message);
          throw err;
        }
      }

      const requestLogsColumns = this.db.pragma("table_info(request_logs)");
      const hasStatusCode = requestLogsColumns.some(col => col.name === "status_code");
      if (!hasStatusCode) {
        console.log("[BANDIT] Migrazione: aggiungo status_code a request_logs");
        try {
          this.db.exec(`ALTER TABLE request_logs ADD COLUMN status_code INTEGER`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna status_code:", err.message);
          throw err;
        }
      }
      const hasErrorMessage = requestLogsColumns.some(col => col.name === "error_message");
      if (!hasErrorMessage) {
        console.log("[BANDIT] Migrazione: aggiungo error_message a request_logs");
        try {
          this.db.exec(`ALTER TABLE request_logs ADD COLUMN error_message TEXT`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna error_message:", err.message);
          throw err;
        }
      }
      const hasModelLog = requestLogsColumns.some(col => col.name === "model");
      if (!hasModelLog) {
        console.log("[BANDIT] Migrazione: aggiungo model a request_logs");
        try {
          this.db.exec(`ALTER TABLE request_logs ADD COLUMN model TEXT`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna model:", err.message);
          throw err;
        }
      }
      const hasProviderLog = requestLogsColumns.some(col => col.name === "provider");
      if (!hasProviderLog) {
        console.log("[BANDIT] Migrazione: aggiungo provider a request_logs");
        try {
          this.db.exec(`ALTER TABLE request_logs ADD COLUMN provider TEXT`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna provider:", err.message);
          throw err;
        }
      }

      // Migrazione quota provider (colonne per sistema quota)
      const quotaCols = [
        "rpm_limit INTEGER DEFAULT 0",
        "rpd_limit INTEGER DEFAULT 0",
        "calls_last_minute INTEGER DEFAULT 0",
        "calls_minute_started INTEGER DEFAULT 0",
        "calls_today INTEGER DEFAULT 0",
        "calls_today_date TEXT DEFAULT ''",
        "quota_resets_at INTEGER DEFAULT 0",
        "quota_reason TEXT DEFAULT ''"
      ];
      for (const colDef of quotaCols) {
        const colName = colDef.split(" ")[0];
        const has = providerColumns.some(c => c.name === colName);
        if (!has) {
          try {
            this.db.exec(`ALTER TABLE provider_history ADD COLUMN ${colDef}`);
            console.log(`[BANDIT] Migrazione: aggiungo ${colName} a provider_history`);
          } catch (e) {
            console.error(`[BANDIT] Errore aggiunta ${colName}:`, e.message);
          }
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

  recordRequest(model = null, provider = null) {
    this.totalRequests++;
    this._setMeta("totalRequests", this.totalRequests);
    this.totalObservations++;
    this._setMeta("totalObservations", this.totalObservations);
    this.db.prepare("INSERT INTO request_logs (started_at, model, provider) VALUES (?, ?, ?)").run(Date.now(), model, provider);
  }

  recordRequestError(statusCode, errorMessage = null, model = null, provider = null) {
    this.db.prepare(
      "UPDATE request_logs SET ended_at = ?, status_code = ?, error_message = ?, model = COALESCE(?, model), provider = COALESCE(?, provider) WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1"
    ).run(Date.now(), statusCode, errorMessage, model, provider);
  }

  async fetchAndSyncModels() {
    try {
      const apiKey = process.env.OMNIROUTE_API_KEY || "";
      const baseUrl = sanitizeBaseUrl(process.env.OMNIROUTE_BASE_URL, "https://router.omniroute.ai/v1");
      const modelsUrl = buildEndpointUrl(baseUrl, "/models");

      const headers = {};
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

      const res = await fetch(modelsUrl, { headers });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Impossibile recuperare i modelli da OmniRoute`);
      }

      const data = await res.json();
      const modelList = data.data || data.models || data;

      if (!Array.isArray(modelList)) {
        throw new Error("Response malformato: data.data non è array");
      }

      const insertStmt = this.db.prepare(
        `INSERT INTO catalog (id, provider, max_input_tokens, is_free, supports_tools, supports_image_generation, capability, supports_chat, supports_audio_generation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           provider = excluded.provider,
           max_input_tokens = excluded.max_input_tokens,
           is_free = excluded.is_free,
           supports_tools = excluded.supports_tools,
           supports_image_generation = excluded.supports_image_generation,
           capability = excluded.capability,
           supports_chat = excluded.supports_chat,
           supports_audio_generation = excluded.supports_audio_generation`
      );

      const isFreeModel = (id) => {
        const lower = String(id).toLowerCase();
        return /(:free|-free|_free|\/free)/.test(lower) || lower.includes(":free");
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

          if (modelId.startsWith("auto/") || modelId.startsWith("gh/")) {
            skipped++;
            continue;
          }

          const provider = this._getProvider(modelId);
          const maxInput = Number(m?.max_input_tokens || m?.context_length || 0) || 0;
          const isFree = isFreeModel(modelId) ? 1 : 0;
          const isFim = /fim|fill.?in.?the.?middle/i.test(modelId);
          const supportsTools = (!isFim && m && typeof m === "object" && m.capabilities && m.capabilities.tool_calling === true) ? 1 : 0;

          const lowerId = modelId.toLowerCase();
          let capability = 'chat_completion';
          let supportsChat = 1;
          let supportsImageGeneration = 0;
          let supportsAudioGeneration = 0;

          const isBatch = /:batch\b/.test(lowerId);
          const isRerankOrMod = /(^|[-_/])(rerank|moderation)([-_/]|$)/.test(lowerId);
          const isEmbed = /(^|[-_/])(embed|embedding|embeddings|rerank|moderation|batch)([-_/]|$)/i.test(lowerId);
          const isAudio = /(^|[-_/])(tts|text-to-speech|speech|stt|speech-to-text|whisper|voice|audio)([-_/]|$)/i.test(lowerId) && !lowerId.includes("omni") && !lowerId.includes("chat");
          const isAihordeId = lowerId.startsWith("aihorde/") || lowerId.includes("aihorde");
          const isImageGenId = isAihordeId || /(^|[-_/])(dall-e|stable-diffusion|imagen|sdxl|flux|midjourney|image-generation|aihorde)([-_/]|$)/i.test(lowerId);
          const isImageGenType = m && typeof m === "object" && (
            String(m.type || "").toLowerCase() === "image" ||
            m.capabilities?.image_generation === true ||
            isImageGenId
          );

          if (isBatch) {
            capability = 'batch';
            supportsChat = 0;
          } else if (isRerankOrMod) {
            capability = lowerId.includes('rerank') ? 'rerank' : 'moderation';
            supportsChat = 0;
          } else if (isEmbed) {
            capability = 'embedding';
            supportsChat = 0;
          } else if (isAudio) {
            capability = 'audio';
            supportsChat = 0;
            supportsAudioGeneration = 1;
          } else if (isImageGenType) {
            capability = 'image';
            supportsChat = 0;
            supportsImageGeneration = 1;
          }

          insertStmt.run(modelId, provider, maxInput, isFree, supportsTools, supportsImageGeneration, capability, supportsChat, supportsAudioGeneration);
          inserted++;
        }
        return { inserted, skipped, raw };
      });

      const { inserted, skipped, raw } = syncCatalog(modelList);
      this._rankCache = { at: 0, map: new Map() };
      this._setMeta("catalogRawCount", raw);
      this._setMeta("catalogTotal", inserted);
      this._setMeta("lastSyncTimestamp", Date.now());
      console.log(`[BANDIT] Catalog sincronizzato: ${inserted} modelli totali (inclusi chat e non-chat, esclusi ${skipped} ignorati su ${raw} totali)`);
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

  async resolveModelPrefix(modelId) {
    // Already has explicit provider prefix
    if (modelId.includes('/')) return modelId;

    // Special static model resolution
    if (modelId === 'static-best-free') {
      return await this.getBestFreeModel();
    }

    // Search the catalog for an exact match on the full id
    const exact = this.db.prepare("SELECT id FROM catalog WHERE id = ?").get(modelId);
    if (exact) {
      return exact.id;
    }

    // Search for model part match: extract model name from id (after the '/')
    const catalogMatch = this.db.prepare(
      "SELECT id FROM catalog WHERE substr(id, instr(id, '/') + 1) = ?"
    ).get(modelId);

    if (catalogMatch) {
      return catalogMatch.id;
    }

    // Search the models table too
    const modelsMatch = this.db.prepare(
      "SELECT id FROM models WHERE substr(id, instr(id, '/') + 1) = ?"
    ).get(modelId);

    if (modelsMatch) {
      return modelsMatch.id;
    }

    // Fallback: heuristic parsing
    return this._getProvider(modelId);
  }

  async getBestFreeModel() {
    // Get all free models from the catalog
    const freeModels = this.db.prepare(
      `SELECT c.id, c.provider, c.max_input_tokens, c.supports_tools
       FROM catalog c
       WHERE c.is_free = 1
       ORDER BY c.provider, substr(c.id, instr(c.id, '/') + 1)`
    ).all();

    if (freeModels.length === 0) {
      return null;
    }

    // Get performance data for these models from the models table
    const modelIds = freeModels.map(m => m.id);
    const placeholders = modelIds.map(() => '?').join(', ');
    const modelStats = this.db.prepare(
      `SELECT id, N, sum_reward, fails, cooldown_until, permanent, degraded
       FROM models
       WHERE id IN (${placeholders})`
    ).all(...modelIds);

    // Filter out unavailable models (cooldown, permanent, degraded)
    const now = Date.now();
    const availableModels = freeModels.filter(fm => {
      const stats = modelStats.find(ms => ms.id === fm.id);
      if (!stats) return true; // Model exists in catalog but not in models table (new model)
      if (stats.permanent === 1) return false;
      if (stats.degraded === 1) return false;
      if (stats.cooldown_until > now) return false;
      return true;
    });

    if (availableModels.length === 0) {
      return null;
    }

    // Rank by UCB1 average reward (sum_reward / N)
    const rankedModels = availableModels.map(fm => {
      const stats = modelStats.find(ms => ms.id === fm.id);
      const N = stats ? stats.N : 0;
      const sum_reward = stats ? stats.sum_reward : 0;
      const avg = N > 0 ? sum_reward / N : 0;
      return { ...fm, avg, N };
    });

    // Sort by average reward (descending), then by N (descending for more data)
    rankedModels.sort((a, b) => {
      if (b.avg !== a.avg) return b.avg - a.avg;
      return b.N - a.N;
    });

    // Return the best available model's full provider/model ID
    return rankedModels[0].id;
  }

  getModelRank(modelId) {
    const now = Date.now();
    if (now - this._rankCache.at > 30000) {
      const rows = this.db.prepare(
        `SELECT id, CASE WHEN N > 0 THEN sum_reward / N ELSE 1.0 END AS avg
         FROM models
         WHERE permanent = 0 AND degraded = 0
         ORDER BY avg DESC, N DESC`
      ).all();
      this._rankCache.map = new Map(rows.map((r, i) => [r.id, i + 1]));
      this._rankCache.at = now;
    }
    return this._rankCache.map.get(modelId) ?? null;
  }

  getLastSelectionHistory() {
    return this.lastSelectionHistory || [];
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

      // Ensure model exists in models table (for catalog-only models or any model receiving feedback)
      const cat = this.db.prepare("SELECT provider FROM catalog WHERE id = ?").get(modelId);
      const existingModel = this.db.prepare("SELECT provider FROM models WHERE id = ?").get(modelId);
      const provider = cat?.provider || existingModel?.provider || opts.provider || 'unknown';
      if (provider) {
        this.db.prepare(
          `INSERT OR IGNORE INTO models (id, provider, N, sum_reward, fails, cooldown_until, last_used_index, permanent, degraded)
           VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0)`
        ).run(modelId, provider);
      }

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
                if (source === 'training' || String(process.env.DEBUG_BANDIT || "").toLowerCase() === "true") {
                  console.log(`[BANDIT-TRAIN] ${modelId}: ban-provider (${c.reason})`);
                }
                this._banProvider(provider);
                break;
              case "ban-model":
                if (source === 'training' || String(process.env.DEBUG_BANDIT || "").toLowerCase() === "true") {
                  console.log(`[BANDIT-TRAIN] ${modelId}: ban-model (${c.reason})`);
                }
                this.db.prepare(
                  `INSERT INTO models (id, provider, permanent, N, sum_reward, fails, cooldown_until, last_used_index)
                   VALUES (?, ?, 1, 0, 0, 0, 0, 0)
                   ON CONFLICT(id) DO UPDATE SET permanent = 1`
                ).run(modelId, provider);
                break;
              case "cooldown-provider":
                if (source === 'training' || String(process.env.DEBUG_BANDIT || "").toLowerCase() === "true") {
                  console.log(`[BANDIT-TRAIN] ${modelId}: cooldown-provider (${c.reason}) per ${(c.cooldownMs/1000)|0}s`);
                }
                if (c.reason === "no-credit" || /402|payment|credit|funds/i.test(String(errorDetails?.status || "") + " " + String(errorDetails?.message || ""))) {
                  this.db.prepare(`UPDATE models SET is_paid = 1 WHERE id = ?`).run(modelId);
                }
                this._forceProviderCooldown(provider, c.cooldownMs, c.reason);
                break;
              case "cooldown-paid-only":
                this._cooldownPaidOnly(provider, c.cooldownMs);
                break;
              case "flag-provider":
                if (source === 'training' || String(process.env.DEBUG_BANDIT || "").toLowerCase() === "true") {
                  console.log(`[BANDIT-TRAIN] ${modelId}: flag-provider (${c.reason})`);
                }
                this._flagProviderAttention(provider, c.reason, errorDetails.message || errorDetails.error || "");
                break;
              case "cooldown-model": {
                const isTransient = ["server-error", "timeout", "unknown"].includes(c.reason);
                if (c.reason === "tpm-exceeded" || errorDetails?.status === 413) {
                  const errorMessage = String(errorDetails?.message || errorDetails?.error || errorDetails || "");
                  const parsedLimit = this._parseTokenLimit(errorMessage);
                  const targetLimit = parsedLimit !== null ? parsedLimit : 0;
                  if (targetLimit > 0) {
                    this.db.prepare(
                      `INSERT INTO models (id, provider, dynamic_max_tokens, N, sum_reward, fails, cooldown_until, last_used_index)
                       VALUES (?, ?, ?, 0, 0, 0, 0, 0)
                       ON CONFLICT(id) DO UPDATE SET dynamic_max_tokens = CASE
                         WHEN dynamic_max_tokens = 0 OR dynamic_max_tokens > excluded.dynamic_max_tokens THEN excluded.dynamic_max_tokens
                         ELSE MIN(dynamic_max_tokens, excluded.dynamic_max_tokens)
                       END`
                    ).run(modelId, provider, targetLimit);
                  }
                }
                if (isTransient) {
                  this.db.prepare(`UPDATE models SET consecutive_5xx = consecutive_5xx + 1 WHERE id = ?`).run(modelId);
                  const modelRow = this.db.prepare(`SELECT consecutive_5xx FROM models WHERE id = ?`).get(modelId);
                  if (modelRow && modelRow.consecutive_5xx >= 3) {
                    this.db.prepare(`UPDATE models SET degraded = 1, degraded_since = ? WHERE id = ?`).run(Date.now(), modelId);
                  }
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
        this.totalObservations++;
        this._setMeta("totalObservations", this.totalObservations);
        this.db.prepare(
          `UPDATE models SET sum_reward = sum_reward + ?, N = N + 1, fails = 0, last_used_index = last_used_index + 1, consecutive_5xx = 0
           WHERE id = ?`
        ).run(reward, modelId);
        this.db.prepare(
          "UPDATE request_logs SET ended_at = ?, status_code = ?, error_message = ?, model = ?, provider = ? WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1"
        ).run(Date.now(), 200, null, modelId, provider);
        this._lastReward.set(modelId, reward);
      } else {
        this.db.prepare(
          `UPDATE models SET fails = fails + 1, last_used_index = last_used_index + 1
           WHERE id = ?`
        ).run(modelId);
        const statusCode = errorDetails?.status || 500;
        const errorMessage = errorDetails?.message || errorDetails?.error || String(errorDetails) || "Unknown error";
        this.db.prepare(
          "UPDATE request_logs SET ended_at = ?, status_code = ?, error_message = ?, model = ?, provider = ? WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1"
        ).run(Date.now(), statusCode, errorMessage, modelId, provider);
      }
    });
    tx();
  }

  _classifyError(errorDetails, provider) {
    const status = errorDetails.status || 0;
    const message = errorDetails.message || "";
    const reason = errorDetails.reason || "unknown";
    const is429 = status === 429;
    const resolvedProvider = provider || errorDetails.provider || (errorDetails.modelId ? errorDetails.modelId.split('/')[0] : '');

    // Tool-calling requirement failure -> ban-model
    if (/no-tool-call-but-required/i.test(message)) {
      return { action: "ban-model", scope: "model", reason: "no-tool-call-but-required" };
    }

    // Status 502 misconfiguration / gateway errors -> ban-provider if provider-level, else flag-provider
    if (status === 502 && /No auth provided|Please log in|Playwright is not available|missing url or token|browserType\.launch|Executable doesn't exist|ENOENT/i.test(message)) {
      if (resolvedProvider === 'cfp' || resolvedProvider === 'zc' || resolvedProvider) {
        return { action: "ban-provider", scope: "provider", reason: "provider-misconfigured" };
      }
      return { action: "flag-provider", reason: "provider-misconfigured" };
    }

    // Sandbox, Missing Binary, and Environment Configuration Errors across status codes -> ban-provider for provider-level / cfp / zc
    if (/ENOENT|spawn\s+.*ENOENT|command not found|CLI not found|Executable doesn't exist|browserType\.launch|must be an absolute path|bridge sandbox|transport is not configured|Playwright is not available/i.test(message)) {
      const isProviderLevel = resolvedProvider === 'zc' || resolvedProvider === 'cfp' || !!resolvedProvider || /CLI not found|command not found|bridge sandbox|transport is not configured|spawn\s+/i.test(message);
      if (isProviderLevel) {
        return { action: "ban-provider", scope: "provider", reason: "provider-misconfigured" };
      } else {
        return { action: "ban-model", scope: "model", reason: "environment-error" };
      }
    }

    // Image generation mismatch / chat incompatibility on 400 -> ban-model
    if (status === 400 && /image generation model|cannot be used for chat|not a chat model|image-only|incompatible/i.test(message)) {
      return { action: "ban-model", scope: "model", reason: "model-incompatible" };
    }

    // Catalog mismatch / unknown model / 404 / 400 model not found / live catalog errors
    if (/catalog mismatch|unknown model|model_not_found|does not exist|not found|no longer available|not available|invalid model|not available in active live catalog/i.test(message) || status === 404 || status === 400) {
      return { action: "ban-model", scope: "model", reason: "model-not-found" };
    }
    // 400 model non utilizzabile (non supportato, provider sconosciuto, code=model_not_found)
    if (status === 400 && /not supported|unknown provider for model|model_not_found/i.test(message)) {
      return { action: "ban-model", scope: "model", reason: "model-not-supported" };
    }
    // Upstream bug (Assignment to constant) -> ban-model
    if (/Assignment to constant variable/i.test(message)) {
      return { action: "ban-model", scope: "model", reason: "upstream-bug" };
    }
    // 410 model shutdown (end of life) -> ban-model
    if (status === 410 && /model_shutdown|model is gone|end of life|no longer available|model_shutdown/i.test(message + " " + (errorDetails.code || ""))) {
      return { action: "ban-model", scope: "model", reason: "model-shutdown" };
    }
    // NEW: OpenCode's free tier can only be used from within OpenCode -> ban-model with permission-denied
    if (/OpenCode's free tier can only be used from within OpenCode/i.test(message)) {
      return { action: "ban-model", scope: "model", reason: "permission-denied" };
    }
    // NEW: No active credentials for provider (401) -> flag-provider with reason auth-expired and 24h cooldown
    if (status === 401 && /No active credentials|authentication expired/i.test(message)) {
      return { action: "flag-provider", reason: "auth-expired", cooldownMs: 24 * 3600 * 1000 };
    }
    // NEW: authentication expired (401) -> flag-provider with reason auth-expired
    if (status === 401 && /authentication expired/i.test(message)) {
      return { action: "flag-provider", reason: "auth-expired" };
    }
    // 413 / TPM / ITPM / tokens per minute / Request too large / context length / token limit -> cooldown-model (not provider, since TPM/context is model-specific)
    if (status === 413 || /413|ITPM|tokens?\s*per\s*minute|TPM|Request too large|Requested \d+.*Limit \d+|Limit \d+.*Requested \d+|context\s*(?:window|length|exceeded)|token\s*limit|payload\s*too\s*large/i.test(message)) {
      const m = message.match(/reset after (\d+)(s|m|h)/i);
      let cooldownMs = status === 413 ? 300000 : 30000; // default 5m for 413, 30s for TPM
      if (m) {
        const v = parseInt(m[1], 10);
        const u = m[2].toLowerCase();
        if (u === 's') cooldownMs = v * 1000;
        else if (u === 'm') cooldownMs = v * 60 * 1000;
        else if (u === 'h') cooldownMs = v * 3600 * 1000;
      }
      return { action: "cooldown-model", scope: "model", reason: "tpm-exceeded", cooldownMs };
    }
    // No auth provided -> flag-provider
    if (status === 502 && /No auth provided|Please log in/i.test(message)) {
      return { action: "flag-provider", reason: "provider-misconfigured" };
    }
    // Playwright not available -> flag-provider
    if (status === 502 && /Playwright is not available/i.test(message)) {
      return { action: "flag-provider", reason: "provider-misconfigured" };
    }
    // CLI / binario mancante o non configurato -> flag-provider
    if (status === 502 && /is not configured|missing url or token/i.test(message)) {
      return { action: "flag-provider", reason: "provider-misconfigured" };
    }
    // 403 banned -> ban-provider
    if (status === 403 && /account disabled|banned/i.test(message)) {
      return { action: "ban-provider", scope: "provider", reason: "provider-banned" };
    }
    // Non-Resetting Key/Quota Limits (403, Key limit exceeded, total limit, hard limit, lifetime limit, does not reset)
    if (status === 403 || /Key limit exceeded|total limit|hard limit|lifetime limit/i.test(message)) {
      const isNonResetting = /does not reset|never resets|no reset|lifetime|permanent/i.test(message);
      let cooldownMs = this._parseResetAfter(message, errorDetails);
      if (isNonResetting) {
        return { action: "ban-provider", scope: "provider", reason: "quota-exhausted" };
      } else if (!cooldownMs || cooldownMs <= 0) {
        return { action: "cooldown-provider", reason: "key-limit-exceeded", cooldownMs: 24 * 3600 * 1000 };
      } else {
        return { action: "cooldown-provider", reason: "key-limit-exceeded", cooldownMs };
      }
    }

    // 429 with model_cooldown code or cooling down -> cooldown-model
    if ((is429 && errorDetails.code === "model_cooldown") || /cooling down|model_cooldown/i.test(message)) {
      let cooldownMs = this._parseResetAfter(message, errorDetails);
      if (!cooldownMs || cooldownMs <= 0) {
        const retryAfter = errorDetails.retryAfter || errorDetails.retry_after || errorDetails.reset_seconds || 0;
        cooldownMs = retryAfter > 0 ? retryAfter * 1000 : 30000;
      }
      return { action: "cooldown-model", scope: "model", reason: "rate-limit", cooldownMs };
    }

    // Check for permanent ban indicators (even if status is 403 or 429)
    if (/account\s+(?:has\s+been\s+)?(?:disabled|suspended|banned|terminated|closed|deactivated)|organization\s+(?:has\s+been\s+)?(?:disabled|suspended|banned|deleted|deactivated)|project\s+(?:has\s+been\s+)?(?:deleted|disabled|suspended)|workspace\s+(?:has\s+been\s+)?(?:disabled|suspended|deleted)|policy\s+violation|\b(account\s+suspended|provider\s+banned|banned|suspended)\b/i.test(message)) {
      return { action: "ban-provider", scope: "provider", reason: "provider-banned" };
    }

    // 429 quota exhausted / rate limit -> cooldown-provider / cooldown-model
    if (is429 || /rate\s*limit|too\s+many\s+requests|throttled|quota\s*exceeded/i.test(message)) {
      let cooldownMs = this._parseResetAfter(message, errorDetails);
      if (!cooldownMs || cooldownMs <= 0) {
        const retryAfter = errorDetails.retryAfter || errorDetails.retry_after || 0;
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

    // RATE_LIMIT_QUEUE_TIMEOUT / 503 queue timeout -> cooldown-model queue-timeout
    if (errorDetails.code === "RATE_LIMIT_QUEUE_TIMEOUT" || /RATE_LIMIT_QUEUE_TIMEOUT|503 queue timeout|queue timeout/i.test(message) || (status === 503 && /queue.*timeout|timeout.*queue/i.test(message))) {
      let cooldownMs = this._parseResetAfter(message, errorDetails);
      if (!cooldownMs || cooldownMs <= 0) {
        cooldownMs = 45000; // 45s (appropriate cooldown between 30s-60s)
      }
      return { action: "cooldown-model", scope: "model", reason: "queue-timeout", cooldownMs };
    }

    // High demand / service unavailable messages -> cooldown-model high-demand
    if (/currently experiencing high demand|service_unavailable|service unavailable|high demand/i.test(message) || errorDetails.code === "service_unavailable") {
      let cooldownMs = this._parseResetAfter(message, errorDetails);
      if (!cooldownMs || cooldownMs <= 0) {
        cooldownMs = 30000; // 30s (appropriate cooldown)
      }
      return { action: "cooldown-model", scope: "model", reason: "high-demand", cooldownMs };
    }

    // Timeout -> cooldown-model 10m
    if (/fetch timeout|timeout/i.test(message)) {
      return { action: "cooldown-model", scope: "model", reason: "timeout", cooldownMs: 10 * 60 * 1000 };
    }

    // 5xx -> cooldown-model (non provider)
    if (status >= 500 && status < 600) {
      return { action: "cooldown-model", scope: "model", reason: "server-error", cooldownMs: 30000 };
    }

    // 402 insufficient funds / billing error -> ban-provider (quota-exhausted)
    if (status === 402 && /insufficient|funds|credit|payment/i.test(message)) {
      return { action: "ban-provider", scope: "provider", reason: "quota-exhausted" };
    }

    // 418 anti-abuse -> cooldown-provider 6h
    if (status === 418 && /anti-abuse/i.test(message)) {
      return { action: "cooldown-provider", reason: "provider-blocked", cooldownMs: 6 * 3600 * 1000 };
    }

    return {
      action: "cooldown-model",
      reason: reason,
      cooldownMs: 30000
    };
  }

  _parseResetAfter(message, errorDetails = {}) {
    // Helper to parse numeric value (seconds, ms epoch, or seconds epoch)
    const parseNum = (val) => {
      const num = Number(val);
      if (isNaN(num)) return null;
      if (num > 1000000000000) {
        // ms epoch
        const diff = num - Date.now();
        return diff > 0 ? diff : 0;
      } else if (num > 1000000000) {
        // seconds epoch
        const diff = num * 1000 - Date.now();
        return diff > 0 ? diff : 0;
      }
      return num > 0 ? num * 1000 : 0;
    };

    // 1. Check errorDetails.retryAfter or retry_after
    const ra = errorDetails.retryAfter !== undefined ? errorDetails.retryAfter : errorDetails.retry_after;
    if (ra !== undefined && ra !== null && ra !== "") {
      const parsed = parseNum(ra);
      if (parsed !== null && !isNaN(parsed)) return parsed;
      const trimmedRa = String(ra).trim();
      if (/^\d+$/.test(trimmedRa)) {
        return parseNum(trimmedRa);
      }
      const d = new Date(trimmedRa);
      if (!isNaN(d.getTime())) {
        const diff = d.getTime() - Date.now();
        return diff > 0 ? diff : 0;
      }
    }

    // 2. Check errorDetails.headers ('retry-after' or 'Retry-After')
    const headers = errorDetails.headers;
    if (headers) {
      const headerVal = typeof headers.get === 'function'
        ? (headers.get('retry-after') || headers.get('Retry-After'))
        : (headers['retry-after'] || headers['Retry-After'] || headers['RETRY-AFTER']);
      if (headerVal !== undefined && headerVal !== null && headerVal !== "") {
        const parsed = parseNum(headerVal);
        if (parsed !== null && !isNaN(parsed)) return parsed;
        const trimmedH = String(headerVal).trim();
        if (/^\d+$/.test(trimmedH)) {
          return parseNum(trimmedH);
        }
        const d = new Date(trimmedH);
        if (!isNaN(d.getTime())) {
          const diff = d.getTime() - Date.now();
          return diff > 0 ? diff : 0;
        }
      }
    }

    if (!message || typeof message !== "string") return 0;
    // Try "reset after 5m" / "retry after 30s" / "reset in 10 seconds"
    const match = message.match(/(?:reset|retry)\s+(?:after|in)\s+(\d+)\s*(s|m|h|seconds?|minutes?|hours?)/i);
    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2].toLowerCase();
      if (unit.startsWith('s')) return value * 1000;
      if (unit.startsWith('m')) return value * 60 * 1000;
      if (unit.startsWith('h')) return value * 3600 * 1000;
    }
    // Try JSON-like '"reset_seconds":117' or 'reset_seconds: 50' or 'reset_in: 50'
    const secsMatch = message.match(/"reset_seconds"\s*:\s*(\d+)|reset_seconds[^\d]*(\d+)|reset_in[^\d]*(\d+)/i);
    if (secsMatch) {
      const val = parseInt(secsMatch[1] || secsMatch[2] || secsMatch[3], 10);
      return val * 1000;
    }
    return 0;
  }

  _unlockProvider(provider) {
    this.db.prepare(
      `UPDATE provider_history
       SET cooldown_until = 0,
           needs_attention = 0,
           attention_reason = NULL,
           attention_message = NULL
       WHERE provider = ?`
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
      `UPDATE provider_history SET cooldown_until = ?, needs_attention = 1, attention_reason = ?, attention_message = ? WHERE provider = ?`
    ).run(Date.now() + 24 * 3600000, reason, message, provider);
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
    try {
      let models = [];
      try {
        models = this.db.prepare(
          `SELECT id, provider, N, sum_reward, fails, degraded, cooldown_until, permanent
           FROM models`
        ).all() || [];
      } catch (e) {
        console.warn("[BANDIT] getMetrics models query error:", e.message);
      }

      let providers = [];
      try {
        providers = this.db.prepare(
          `SELECT provider, fails, cooldown_until, permanent, needs_attention
           FROM provider_history`
        ).all() || [];
      } catch (e) {
        console.warn("[BANDIT] getMetrics providers query error:", e.message);
      }

      let stats = { modelsActive: 0, avgReward: 0, avgLatencySec: 0, freeActive: 0, topModel: null };
      try {
        stats = this.getDashboardStats() || stats;
      } catch (e) {
        console.warn("[BANDIT] getMetrics getDashboardStats error:", e.message);
      }

      const summary = {
        activeCount: stats.modelsActive || 0,
        avgReward: stats.avgReward || 0,
        avgLatencySec: stats.avgLatencySec || 0,
        freeActive: stats.freeActive || 0,
        topModel: stats.topModel ? (typeof stats.topModel === 'object' ? stats.topModel : { id: stats.topModel }) : null
      };
      return { models, providers, summary };
    } catch (e) {
      console.error("[BANDIT] Critical error in getMetrics:", e.message);
      return { models: [], providers: [], summary: { activeCount: 0, avgReward: 0, avgLatencySec: 0, freeActive: 0, topModel: null } };
    }
  }

  getDashboardStats() {
    try {
      const totalRequests = this._getMeta("totalRequests") || 0;
      if (typeof DEBUG !== 'undefined' && DEBUG) console.log(`[DEBUG DashboardStats Validation] totalRequests from meta: ${totalRequests}`);
      const totalObservations = this._getMeta("totalObservations") || 0;

      let stats = { totalN: 0, totalReward: 0, avgReward: 0 };
      try {
        const res = this.db.prepare(`
          SELECT
            SUM(N) as totalN,
            SUM(sum_reward) as totalReward,
            AVG(CASE WHEN N > 0 THEN sum_reward / N ELSE NULL END) as avgReward
          FROM models
        `).get();
        if (res) stats = res;
      } catch (e) {
        console.warn("[BANDIT] getDashboardStats models query error:", e.message);
      }

      let latency = { avgLatency: 0 };
      try {
        const latencyResult = this.db.prepare(`
          SELECT AVG(duration) as avgLatency
          FROM (
            SELECT (ended_at - started_at) as duration
            FROM request_logs
            WHERE ended_at IS NOT NULL AND started_at IS NOT NULL
            ORDER BY ended_at DESC
            LIMIT 1000
          )
        `).get();
        if (latencyResult && latencyResult.avgLatency !== null) {
          latency = latencyResult;
        }
      } catch (e) {
        console.warn("[BANDIT] Errore calcolo latenza (request_logs mancante?):", e.message);
      }

      // freeActive: check both model-level and provider-level status
      let freeActive = { count: 0 };
      try {
        freeActive = this.db.prepare(`
          SELECT COUNT(*) as count
          FROM models m
          JOIN catalog c ON m.id = c.id
          LEFT JOIN provider_history ph ON c.provider = ph.provider
          WHERE c.is_free = 1
            AND (m.cooldown_until IS NULL OR m.cooldown_until <= ?)
            AND m.permanent = 0
            AND m.degraded = 0
            AND (ph.cooldown_until IS NULL OR ph.cooldown_until <= ? OR ph.cooldown_until = 0)
            AND (ph.permanent IS NULL OR ph.permanent = 0)
            AND (ph.needs_attention IS NULL OR ph.needs_attention = 0)
        `).get(Date.now(), Date.now()) || { count: 0 };
      } catch (e) {
        console.warn("[BANDIT] getDashboardStats freeActive query error:", e.message);
      }

      let topModel = null;
      try {
        const topRes = this.db.prepare(`
          SELECT id, (sum_reward / NULLIF(N, 0)) as avg
          FROM models
          WHERE N >= 10
          ORDER BY avg DESC
          LIMIT 1
        `).get();
        if (topRes) topModel = topRes.id;
      } catch (e) {
        console.warn("[BANDIT] getDashboardStats topModel query error:", e.message);
      }

      let catalogCounts = { total: 0, free: 0 };
      try {
        const catRes = this.db.prepare(`
          SELECT COUNT(*) as total, SUM(is_free) as free
          FROM catalog
        `).get();
        if (catRes) catalogCounts = catRes;
      } catch (e) {
        console.warn("[BANDIT] getDashboardStats catalogCounts query error:", e.message);
      }

      let totalModels = { count: 0 };
      try {
        const tmRes = this.db.prepare(`
          SELECT COUNT(*) as count
          FROM models
        `).get();
        if (tmRes) totalModels = tmRes;
      } catch (e) {
        console.warn("[BANDIT] getDashboardStats totalModels query error:", e.message);
      }

      let modelsSummary = { active: 0, cooldown: 0, banned: 0, degraded: 0 };
      try {
        modelsSummary = this.getModelsSummary("prod") || modelsSummary;
      } catch (e) {
        console.warn("[BANDIT] getDashboardStats getModelsSummary error:", e.message);
      }

      let providersList = [];
      try {
        providersList = this.getProviders() || [];
      } catch (e) {
        console.warn("[BANDIT] getDashboardStats getProviders error:", e.message);
      }

      const providersActive = providersList.filter(p => !p.permanent && !p.needs_attention && p.cooldownRemaining === 0).length;
      const providersCooldown = providersList.filter(p => p.cooldownRemaining > 0).length;
      const providersBanned = providersList.filter(p => p.permanent).length;
      const providersAttention = providersList.filter(p => p.needs_attention).length;
      const totalProviders = providersList.length;

      let catalogProviders = 0;
      try {
        const catalogProvidersResult = this.db.prepare(`
          SELECT COUNT(DISTINCT provider) as count FROM catalog
        `).get();
        if (catalogProvidersResult) catalogProviders = catalogProvidersResult.count;
      } catch (e) {
        console.warn("[BANDIT] getDashboardStats catalogProviders error:", e.message);
      }

      // Compute success rate from models table
      let successRateStats = { modelsWithObservations: 0, modelsAboveThreshold: 0 };
      try {
        const srRes = this.db.prepare(`
          SELECT
            SUM(CASE WHEN N > 0 THEN 1 ELSE 0 END) as modelsWithObservations,
            SUM(CASE WHEN N > 0 AND sum_reward / N > 0.5 THEN 1 ELSE 0 END) as modelsAboveThreshold
          FROM models
        `).get();
        if (srRes) successRateStats = srRes;
      } catch (e) {
        console.warn("[BANDIT] getDashboardStats successRateStats error:", e.message);
      }

      return {
        totalRequests,
        totalObservations,
        avgReward: (stats && stats.avgReward !== null) ? stats.avgReward : 0,
        avgLatencySec: (latency.avgLatency || 0) / 1000,
        freeActive: freeActive.count || 0,
        topModel,
        catalogTotal: catalogCounts.total || 0,
        catalogRawCount: this._getMeta("catalogRawCount") || 0,
        catalogFree: catalogCounts.free || 0,
        catalogProviders,
        totalModels: totalModels.count || 0,
        modelsActive: modelsSummary.active || 0,
        modelsCooldown: modelsSummary.cooldown || 0,
        modelsBanned: modelsSummary.banned || 0,
        modelsDegraded: modelsSummary.degraded || 0,
        modelsAttention: 0,
        providersActive,
        providersCooldown,
        providersBanned,
        providersAttention,
        totalProviders,
        successRate: (successRateStats && successRateStats.modelsWithObservations > 0)
          ? (successRateStats.modelsAboveThreshold / successRateStats.modelsWithObservations)
          : 0
      };
    } catch (e) {
      console.error("[BANDIT] Critical error in getDashboardStats:", e.message);
      return {
        totalRequests: 0,
        totalObservations: 0,
        avgReward: 0,
        avgLatencySec: 0,
        freeActive: 0,
        topModel: null,
        catalogTotal: 0,
        catalogRawCount: 0,
        catalogFree: 0,
        catalogProviders: 0,
        totalModels: 0,
        modelsActive: 0,
        modelsCooldown: 0,
        modelsBanned: 0,
        modelsDegraded: 0,
        modelsAttention: 0,
        providersActive: 0,
        providersCooldown: 0,
        providersBanned: 0,
        providersAttention: 0,
        totalProviders: 0,
        successRate: 0
      };
    }
  }

  isModelAvailable(modelId, estimatedTokens = 0, requireImageGeneration = false) {
    const now = Date.now();
    const model = this.db.prepare(
      `SELECT cooldown_until, permanent, degraded, provider FROM models WHERE id = ?`
    ).get(modelId);

    const catModel = this.db.prepare(
      `SELECT provider, max_input_tokens, supports_chat, supports_image_generation, supports_audio_generation, capability FROM catalog WHERE id = ?`
    ).get(modelId);

    if (!requireImageGeneration && catModel) {
      const lowerId = modelId.toLowerCase();
      const isImageGen = (catModel.supports_image_generation || 0) === 1 ||
        catModel.provider === 'aihorde' || lowerId.startsWith('aihorde/') || lowerId.includes('aihorde') ||
        /(^|[-_/])(dall-e|stable-diffusion|imagen|sdxl|flux|midjourney|image-generation|playground|aihorde)([-_/]|$)/i.test(lowerId) ||
        /image/i.test(lowerId);
      const isNonChat = (catModel.supports_chat || 1) === 0 || (catModel.capability || 'chat_completion') !== 'chat_completion' || (catModel.supports_audio_generation || 0) === 1 ||
        /(^|[-_/])(tts|speech|stt|whisper|voice|audio|embed|embedding|rerank|moderation)([-_/]|$)/i.test(lowerId);
      if (isImageGen || isNonChat) {
        return false;
      }
    }

    const provider = model?.provider || catModel?.provider;

    if (model) {
      if (model.permanent === 1 || model.degraded === 1) return false;
      if (model.cooldown_until && model.cooldown_until > now) return false;
    }

    if (provider) {
      const prov = this.db.prepare(
        `SELECT cooldown_until, permanent, needs_attention, quota_resets_at FROM provider_history WHERE provider = ?`
      ).get(provider);

      if (prov) {
        if (prov.permanent === 1) return false;
        if (prov.cooldown_until && prov.cooldown_until > now) return false;
        if (prov.quota_resets_at && prov.quota_resets_at > now) return false;
        if (prov.needs_attention === 1 && (!(prov.cooldown_until > 0 && prov.cooldown_until <= now))) {
          return false;
        }
      }

      if (!this.quota.canCall(provider)) {
        return false;
      }
    }

    if (estimatedTokens > 0) {
      const maxInput = this.getModelMaxInput(modelId) || catModel?.max_input_tokens || 0;
      if (maxInput > 0 && estimatedTokens > maxInput) {
        return false;
      }
    }

    return true;
  }

  estimateTokens(body) {
    // Implementazione realistica: stima approssimativa del numero di token
    if (!body || typeof body !== "object") return 0;

    let totalChars = 0;

    // Conta i messaggi
    const messages = body.messages || [];
    for (const msg of messages) {
      if (typeof msg.content === "string") {
        totalChars += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        // Per i messaggi con contenuti multimodali, stima approssimativa
        for (const part of msg.content) {
          if (part.text) totalChars += part.text.length;
          if (part.type === "image_url") totalChars += 1000; // Stima approssimativa per immagine
        }
      } else if (msg.content) {
        totalChars += JSON.stringify(msg.content).length;
      }
      // Conta eventuali tool_calls nei messaggi assistente
      if (Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          totalChars += JSON.stringify(tc).length;
        }
      }
    }

    // Includi prompt di sistema o system field separati se presenti
    if (body.system) {
      if (typeof body.system === "string") {
        totalChars += body.system.length;
      } else {
        totalChars += JSON.stringify(body.system).length;
      }
    }
    if (body.prompt) {
      if (typeof body.prompt === "string") {
        totalChars += body.prompt.length;
      } else {
        totalChars += JSON.stringify(body.prompt).length;
      }
    }

    // Includi tools / functions / tool_choice definiti nella richiesta
    if (body.tools && Array.isArray(body.tools)) {
      totalChars += JSON.stringify(body.tools).length;
    }
    if (body.functions && Array.isArray(body.functions)) {
      totalChars += JSON.stringify(body.functions).length;
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

  async selectModel(excluded = new Set(), estimatedTokens = 0, requireTools = false, requireImageGeneration = false, profile = null, cooledDownThisRequest = true) {
    const DEBUG = String(process.env.DEBUG || "false").toLowerCase() === "true";
    const now = Date.now();
    const excludeSet = this._normalizeExcludedModels(excluded);

    // Resolve ambiguous model names (without provider prefix) to full catalog IDs
    // This handles cases like "gpt-5.6-luna-high" -> "openrouter/gpt-5.6-luna-high"
    let resolvedExcluded = new Set();
    for (const modelId of excludeSet) {
      resolvedExcluded.add(await this.resolveModelPrefix(modelId));
    }
    // Also resolve the excluded parameter if it's a single string
    if (typeof excluded === "string") {
      resolvedExcluded.add(await this.resolveModelPrefix(excluded));
    }

    // Get all models from catalog that are available
    const catalogModels = this.db.prepare(`
      SELECT c.id, c.provider, 0 AS N, 0 AS sum_reward, 0 AS fails, 0 AS degraded, 0 AS cooldown_until, 0 AS permanent, c.max_input_tokens, c.supports_tools, c.supports_image_generation, c.capability, c.supports_chat, c.supports_audio_generation, c.is_free, 0 AS is_paid, 0 AS dynamic_max_tokens
      FROM catalog c
    `).all();
    const dbModels = this.db.prepare(`
      SELECT m.id, m.provider, m.N, m.sum_reward, m.fails, m.degraded, m.cooldown_until, m.permanent, m.is_paid, m.dynamic_max_tokens, c.is_free, c.supports_tools, c.supports_image_generation, c.capability, c.supports_chat, c.supports_audio_generation, c.max_input_tokens
      FROM models m
      LEFT JOIN catalog c ON m.id = c.id
    `).all();
    if (DEBUG) console.log(`[BANDIT][DEBUG] selectModel: catalog=${catalogModels.length} db=${dbModels.length} excluded=${excludeSet.size} tokens=${estimatedTokens} tools=${requireTools}`);
    // Combine catalog and db models, preferring db models when there's a conflict
    const modelMap = new Map();
    for (const model of catalogModels) {
      modelMap.set(model.id, model);
    }
    for (const model of dbModels) {
      const existing = modelMap.get(model.id) || {};
      modelMap.set(model.id, {
        ...existing,
        ...model,
        is_free: model.is_free !== undefined ? model.is_free : existing.is_free,
        is_paid: model.is_paid !== undefined ? model.is_paid : existing.is_paid,
        max_input_tokens: model.max_input_tokens !== undefined ? model.max_input_tokens : existing.max_input_tokens,
        supports_tools: model.supports_tools !== undefined ? model.supports_tools : existing.supports_tools,
        supports_image_generation: model.supports_image_generation !== undefined ? model.supports_image_generation : existing.supports_image_generation,
        supports_chat: model.supports_chat !== undefined ? model.supports_chat : existing.supports_chat,
        supports_audio_generation: model.supports_audio_generation !== undefined ? model.supports_audio_generation : existing.supports_audio_generation,
        capability: model.capability !== undefined ? model.capability : existing.capability,
      }); // db models overwrite catalog models
    }
    const models = Array.from(modelMap.values());
    const selectionHistory = [];

    // Helper filtering function with multi-tier relaxation options
    const filterModels = (tierName, opts = {}) => {
      const { ignoreCooldown = false, ignoreTokenLimit = false, ignoreTools = false, ignorePolicies = false, ignoreImageGeneration = false } = opts;
      return models.filter(model => {
        let rejectionReason = null;

        // Skip if excluded
        if (resolvedExcluded.has(model.id)) {
          rejectionReason = 'already_tried';
        } else if (model.permanent === 1) {
          rejectionReason = 'model_permanent_ban';
        } else if (model.degraded === 1) {
          rejectionReason = 'model_degraded';
        } else {
          // Skip if provider is permanently banned
          const prov = this.db.prepare(
            `SELECT cooldown_until, permanent, needs_attention, quota_resets_at FROM provider_history WHERE provider = ?`
          ).get(model.provider);
          if (prov && prov.permanent === 1) {
            rejectionReason = 'provider_permanent_ban';
          } else if (!ignoreCooldown) {
            // Skip if model is in cooldown
            if (model.cooldown_until && model.cooldown_until > now) {
              rejectionReason = 'model_cooldown';
            }
            // Skip if provider quota or rate limit is exhausted
            else if (!this.quota.canCall(model.provider)) {
              rejectionReason = 'provider_quota_exhausted';
            } else if (prov) {
              if (prov.cooldown_until > now) {
                rejectionReason = 'provider_cooldown';
              } else if (prov.quota_resets_at && prov.quota_resets_at > now) {
                rejectionReason = 'provider_quota_resets_at';
              } else if (prov.needs_attention === 1) {
                // Auto-reset if cooldown expired
                if (prov.cooldown_until > 0 && prov.cooldown_until <= now) {
                  this.db.prepare("UPDATE provider_history SET needs_attention = 0, attention_reason = NULL, attention_message = NULL WHERE provider = ?").run(model.provider);
                } else {
                  rejectionReason = 'provider_needs_attention';
                }
              }
            }
          }

          if (!rejectionReason && !ignorePolicies) {
            // Skip if thinking model and excludeThinking is true
            if (this.excludeThinking && /thinking|reasoning|[-_]r1[-_]|[-_]r1$|^r1[-_]|o1[-_]|o3[-_]|o4[-_]|qwq/i.test(model.id)) {
              rejectionReason = 'exclude_thinking';
            }
            // Skip if paid model and excludePaid is true
            else if (this.excludePaid && (model.is_paid === 1 || model.is_paid === true)) {
              rejectionReason = 'exclude_paid';
            }
            // Skip if onlyFree is true and model is not free
            else if (this.onlyFree && model.is_free === 0) {
              rejectionReason = 'only_free';
            }
          }

          if (!rejectionReason && estimatedTokens > 0) {
            const maxInput = this.getModelMaxInput(model.id) || model.max_input_tokens || 0;
            const dynamicMax = model.dynamic_max_tokens || 0;
            // Always respect dynamic_max_tokens (runtime 413/TPM limit) even if ignoreTokenLimit is true
            if (dynamicMax > 0 && estimatedTokens > dynamicMax) {
              rejectionReason = 'dynamic_max_tokens_exceeded';
            } else if (!ignoreTokenLimit && maxInput > 0 && estimatedTokens > maxInput) {
              rejectionReason = 'max_input_tokens_exceeded';
            }
          }

          if (!rejectionReason && requireTools && !ignoreTools && !(model.supports_tools || 0)) {
            rejectionReason = 'no_tools_support';
          }

          if (!rejectionReason && requireImageGeneration && !ignoreImageGeneration && !(model.supports_image_generation || 0)) {
            rejectionReason = 'no_image_generation_support';
          }

          if (!rejectionReason && !requireImageGeneration) {
            const lowerModelId = model.id.toLowerCase();
            const isNonChat = model.supports_chat === 0 || (model.capability || 'chat_completion') !== 'chat_completion' || model.supports_image_generation === 1 || model.supports_audio_generation === 1 ||
              model.provider === 'aihorde' || lowerModelId.startsWith("aihorde/") || lowerModelId.includes("aihorde") ||
              /(^|[-_/])(dall-e|stable-diffusion|imagen|sdxl|flux|midjourney|image-generation|playground|aihorde|tts|speech|stt|whisper|voice|audio|embed|embedding|rerank|moderation)([-_/]|$)/i.test(lowerModelId) ||
              /image/i.test(lowerModelId);
            if (isNonChat) {
              rejectionReason = 'non_chat_model_excluded';
            }
          }
        }

        if (rejectionReason) {
          selectionHistory.push({
            id: model.id,
            provider: model.provider,
            status: 'rejected',
            reason: rejectionReason,
            tier: tierName,
            N: model.N || 0,
            sum_reward: model.sum_reward || 0,
            avg_reward: (model.N || 0) > 0 ? (model.sum_reward || 0) / (model.N || 0) : 1.0,
            avg_latency: model.avg_latency || 250
          });
          return false;
        }

        model._selectionTier = tierName;
        return true;
      });
    };

    // --- MODEL SELECTION RELAXATION STRATEGY ---
    // We attempt to find the best model by progressively relaxing constraints.
    // This ensures we always try to provide the highest quality/correct model first,
    // but avoid total failure if the strict environment is too restrictive.

    // Tier 0: Strict Filtering (The Ideal Case)
    let availableModels = filterModels('strict');

    // Tier 0.1: Maintenance Recovery
    // If no models, reset expired provider flags and retry strict filtering.
    if (availableModels.length === 0) {
      this.db.prepare(`
        UPDATE provider_history
        SET needs_attention = 0, attention_reason = NULL, attention_message = NULL
        WHERE needs_attention = 1 AND cooldown_until > 0 AND cooldown_until <= ?
      `).run(now);

      this.db.prepare(`
        UPDATE provider_history
        SET cooldown_until = 0
        WHERE cooldown_until > 0 AND cooldown_until <= ?
      `).run(now);

      availableModels = filterModels('strict');
    }

    // Tier 1: Capability Relaxation (Ignore Tool requirements)
    if (availableModels.length === 0) {
      if (DEBUG) console.log(`[BANDIT] Relaxation Tier 1: Ignoring tool requirements`);
      availableModels = filterModels('tier1', { ignoreTools: true });
    }

    // Tier 2: Policy Relaxation (Ignore excludePaid, onlyFree, excludeThinking)
    if (availableModels.length === 0) {
      if (DEBUG) console.log(`[BANDIT] Relaxation Tier 2: Ignoring usage policies`);
      availableModels = filterModels('tier2', { ignoreTools: true, ignorePolicies: true });
    }

    // Tier 3: Resource Relaxation (Ignore token limits)
    if (availableModels.length === 0) {
      if (DEBUG) console.log(`[BANDIT] Relaxation Tier 3: Ignoring token limits`);
      availableModels = filterModels('tier3', { ignoreTokenLimit: true, ignoreTools: true, ignorePolicies: true });
    }

    // Tier 4: Emergency Relaxation (Ignore Cooldowns)
    if (availableModels.length === 0) {
      console.warn(`[BANDIT] Warning: All models filtered. Applying emergency cooldown relaxation.`);
      availableModels = filterModels('emergency', { ignoreCooldown: true, ignoreTokenLimit: true, ignoreTools: true, ignorePolicies: true });
    }

    // Absolute last resort: if still 0 models (e.g. all excluded), pick from all models ignoring all constraints and exclusion (respecting image generation requirement)
    if (availableModels.length === 0) {
      console.warn(`[BANDIT] Warning: All models excluded or unavailable. Picking from all catalog/db models as absolute last resort.`);
      const isImageGenModel = (model) => {
        const isAihordeModel = model.provider === 'aihorde' || model.id.toLowerCase().startsWith("aihorde/") || model.id.toLowerCase().includes("aihorde");
        return isAihordeModel || (model.supports_image_generation || 0) === 1 ||
          /(^|[-_/])(dall-e|stable-diffusion|imagen|sdxl|flux|midjourney|image-generation|playground|aihorde)([-_/]|$)/i.test(model.id) ||
          /image/i.test(model.id);
      };
      availableModels = requireImageGeneration
        ? models.filter(m => m.supports_image_generation || 0)
        : models.filter(m => {
            const lowerId = m.id.toLowerCase();
            const isNonChat = m.supports_chat === 0 || m.capability !== 'chat_completion' || m.supports_image_generation === 1 || m.supports_audio_generation === 1 ||
              isImageGenModel(m) ||
              /(^|[-_/])(tts|speech|stt|whisper|voice|audio|embed|embedding|rerank|moderation)([-_/]|$)/i.test(lowerId);
            return !isNonChat;
          });
    }

    if (availableModels.length === 0) {
      return null;
    }

    // Select model using robust Discounted UCB1 scoring with N=0 prioritization, Quality-to-Speed ratio metrics, and profileMultiplier soft bias
    const totalObservations = this._getMeta("totalObservations") || models.reduce((acc, m) => acc + (m.N || 0), 0) || 1;

    let bestModel = availableModels[0];
    let bestScore = -Infinity;

    for (const model of availableModels) {
      const N = model.N || 0;
      const sum_reward = model.sum_reward || 0;

      // Quality-to-Speed ratio calculation
      const avgReward = N > 0 ? sum_reward / N : 1.0;
      const avgLatency = model.avg_latency || 250;
      const baselineLatency = 500;
      const latencyFactor = baselineLatency / Math.max(avgLatency, 100);
      const qualitySpeedScore = avgReward * latencyFactor;

      let ucbScore;
      if (N === 0) {
        // Prioritize untested models (N = 0) with high optimistic bonus
        ucbScore = 2.0 * qualitySpeedScore + 0.8 * Math.sqrt(Math.log(totalObservations + 1) / 1);
      } else {
        const explorationBonus = 0.5 * Math.sqrt(Math.log(totalObservations + 1) / N);
        ucbScore = (avgReward + explorationBonus) * qualitySpeedScore;
      }

      // Apply soft bias multiplier from profile if specified, plus small random tie-breaker for rotation
      const mult = profileMultiplier(profile, model.id);
      const finalScore = (ucbScore * mult) + (Math.random() * 0.0001);

      if (finalScore > bestScore) {
        bestScore = finalScore;
        bestModel = model;
      }
    }

    const bestN = bestModel.N || 0;
    const bestSumReward = bestModel.sum_reward || 0;
    const bestAvgReward = bestN > 0 ? bestSumReward / bestN : 1.0;
    selectionHistory.push({
      id: bestModel.id,
      provider: bestModel.provider,
      status: 'selected',
      reason: bestModel.N === 0 ? 'untested_model_prioritized' : 'selected_by_ucb_quality_speed',
      tier: 'strict',
      N: bestN,
      sum_reward: bestSumReward,
      avg_reward: bestAvgReward,
      avg_latency: bestModel.avg_latency || 250,
      score: bestScore
    });

    // Register the selected model use
    this._registerModelUse(bestModel.id, bestModel.provider);
    this.lastSelectionHistory = selectionHistory;

    if (DEBUG) {
      console.log(`[BANDIT][SELECT] Selected model: ${bestModel.id} (provider: ${bestModel.provider}, score: ${bestScore.toFixed(4)}, available: ${availableModels.length}/${models.length})`);
    }

    return bestModel.id;
  }

  getLastSelectionHistory() {
    return this.lastSelectionHistory || [];
  }

  getUnhealthyModels(batchSize = 5) {
    const now = Date.now();
    return this.db.prepare(`
      SELECT m.id, m.provider, m.N, m.sum_reward, m.fails, m.degraded, m.cooldown_until, m.permanent
      FROM models m
      WHERE m.degraded = 1 OR (m.cooldown_until > 0 AND m.cooldown_until > ?) OR
            EXISTS (
              SELECT 1 FROM provider_history WHERE provider = m.provider AND quota_resets_at > ?
            )
      LIMIT ?
    `).all(now, now, batchSize);
  }

  _parseTokenLimit(message) {
    if (!message || typeof message !== 'string') return null;
    const limitPatterns = [
      /(?:limit|maximum|max|capacity|tpm|token\s+limit|rate\s+limit)[^\d]*(\d+)/i,
      /(\d+)\s*(?:tokens\s+per\s+minute|tpm)/i
    ];
    for (const pat of limitPatterns) {
      const m = message.match(pat);
      if (m && m[1]) {
        const val = parseInt(m[1], 10);
        if (val > 0) return val;
      }
    }
    return null;
  }

  getModelMaxInput(modelId) {
    let catMax = 0;
    try {
      const catRow = this.db.prepare(
        `SELECT max_input_tokens FROM catalog WHERE id = ?`
      ).get(modelId);
      if (catRow && catRow.max_input_tokens > 0) catMax = catRow.max_input_tokens;
    } catch (_) {}

    let dynMax = 0;
    try {
      const modelRow = this.db.prepare(
        `SELECT dynamic_max_tokens FROM models WHERE id = ?`
      ).get(modelId);
      // Defensive guard: dynamic_max_tokens values below 1000 tokens are almost
      // certainly data corruption from a bug, not a real limit. Ignore them so
      // they don't silently filter out all real requests.
      if (modelRow && modelRow.dynamic_max_tokens >= 1000) dynMax = modelRow.dynamic_max_tokens;
    } catch (_) {}

    if (dynMax > 0 && catMax > 0) {
      return Math.min(dynMax, catMax);
    }
    return dynMax > 0 ? dynMax : catMax;
  }

  reviveModel(modelId) {
    this.db.prepare(
      `UPDATE models SET cooldown_until = 0, degraded = 0 WHERE id = ?`
    ).run(modelId);
  }

  getModels(source = "prod", filters = {}) {
    const now = Date.now();
    let query = `
      SELECT
        m.id,
        m.provider,
        m.N,
        m.sum_reward,
        m.fails,
        m.cooldown_until,
        m.permanent,
        m.degraded,
        m.consecutive_5xx,
        m.dynamic_max_tokens,
        c.is_free,
        c.supports_tools,
        c.max_input_tokens
    `;

    if (source === "train") {
      query += `, 0 AS is_paid`;
      query += `
        FROM models_train m
        LEFT JOIN catalog c ON m.id = c.id
      `;
      // models_train table doesn't have these columns, provide defaults
      query = query.replace('m.fails,', '0 AS fails,')
                 .replace('m.cooldown_until,', '0 AS cooldown_until,')
                 .replace('m.permanent,', '0 AS permanent,')
                 .replace('m.degraded,', '0 AS degraded,')
                 .replace('m.consecutive_5xx,', '0 AS consecutive_5xx,')
                 .replace('m.dynamic_max_tokens,', '0 AS dynamic_max_tokens,');
    } else {
      query += `, m.is_paid`;
      query += `
        FROM models m
        LEFT JOIN catalog c ON m.id = c.id
      `;
    }

    const conditions = [];
    const params = [];

    // Provider filter
    if (filters.provider) {
      conditions.push("m.provider = ?");
      params.push(filters.provider);
    }

    // Status filter
    if (filters.status) {
      switch (filters.status) {
        case "active":
          conditions.push("(m.cooldown_until <= ? OR m.cooldown_until IS NULL OR m.cooldown_until = 0) AND m.permanent = 0 AND m.degraded = 0");
          params.push(now);
          break;
        case "cooldown":
          conditions.push("m.cooldown_until > ?");
          params.push(now);
          break;
        case "degraded":
          conditions.push("m.degraded = 1");
          break;
        case "banned":
          conditions.push("m.permanent = 1");
          break;
      }
    }

    // minN filter
    if (filters.minN !== undefined && filters.minN !== null) {
      conditions.push("m.N >= ?");
      params.push(filters.minN);
    }

    // minAvg filter
    if (filters.minAvg !== undefined && filters.minAvg !== null) {
      conditions.push("(m.sum_reward / NULLIF(m.N, 0)) >= ?");
      params.push(filters.minAvg);
    }

    // search filter (substring on id)
    if (filters.search) {
      conditions.push("m.id LIKE ?");
      params.push(`%${filters.search}%`);
    }

    // Exclude paid models if configured
    if (this.excludePaid) {
      conditions.push("m.is_paid = 0");
    }

    // Only free models if configured
    if (this.onlyFree) {
      conditions.push("(c.is_free = 1 OR c.is_free IS NULL)");
    }

    // Exclude thinking models if configured
    if (this.excludeThinking) {
      conditions.push("m.id NOT REGEXP ?");
      params.push("thinking|reasoning|[-_]r1[-_]|[-_]r1$|^r1[-_]|o1[-_]|o3[-_]|o4[-_]|qwq");
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    // Add ordering
    query += " ORDER BY m.N DESC, m.sum_reward DESC";

    // Add limit
    const limit = filters.limit !== undefined && filters.limit !== null ? parseInt(filters.limit) : 500;
    query += " LIMIT ?";
    params.push(limit);

    const stmt = this.db.prepare(query);
    const models = stmt.all(...params);

    // Calculate rank and add computed fields
    return models.map((model, index) => {
      // Calculate rank position among models with N >= 3 AND permanent = 0 AND degraded = 0
      let rank = null;
      if (model.N >= 3 && model.permanent === 0 && model.degraded === 0) {
        // We'll calculate this after getting all qualifying models
        rank = 0; // placeholder
      }

      // Calculate cooldownRemaining
      const cooldownRemaining = model.cooldown_until > now ? model.cooldown_until - now : 0;

      // Determine status
      let status = "unknown";
      if (model.permanent === 1) {
        status = "banned";
      } else if (model.degraded === 1) {
        status = "degraded";
      } else if (model.cooldown_until > now) {
        status = "cooldown";
      } else {
        status = "active";
      }

      return {
        id: model.id,
        provider: model.provider,
        N: model.N,
        sum_reward: model.sum_reward,
        avg: model.N > 0 ? model.sum_reward / model.N : 0,
        fails: model.fails,
        cooldown_until: model.cooldown_until,
        cooldownRemaining,
        permanent: model.permanent === 1,
        degraded: model.degraded === 1,
        is_paid: model.is_paid === 1,
        is_free: model.is_free === 1,
        supports_tools: model.supports_tools === 1,
        dynamic_max_tokens: model.dynamic_max_tokens,
        consecutive_5xx: model.consecutive_5xx,
        rank: rank // Will be updated below
      };
    }).map((model, index) => {
      // Second pass to calculate rank correctly
      if (model.N >= 3 && model.permanent === 0 && model.degraded === 0) {
        // Count how many models have higher avg
        const betterModels = models.filter(m =>
          m.N >= 3 &&
          m.permanent === 0 &&
          m.degraded === 0 &&
          m.N > 0 &&
          (m.sum_reward / m.N) > (model.sum_reward / model.N)
        );
        model.rank = betterModels.length + 1;
      }
      return model;
    });
  }

  getModelsSummary(source = "prod") {
    const now = Date.now();

    // Base query for counting models
    let baseQuery = `
      FROM models m
      LEFT JOIN catalog c ON m.id = c.id
    `;

    let activeCondition = "(m.cooldown_until <= ? OR m.cooldown_until IS NULL OR m.cooldown_until = 0) AND m.permanent = 0 AND m.degraded = 0";
    let cooldownCondition = "m.cooldown_until > ?";
    let degradedCondition = "m.degraded = 1";
    let bannedCondition = "m.permanent = 1";

    if (source === "train") {
      baseQuery = `
        FROM models_train m
        LEFT JOIN catalog c ON m.id = c.id
      `;
      activeCondition = "1 = 1";
      cooldownCondition = "0 = 1";
      degradedCondition = "0 = 1";
      bannedCondition = "0 = 1";
    }

    // Build WHERE conditions
    const conditions = [];
    const params = [];

    // Exclude paid models if configured
    if (this.excludePaid) {
      conditions.push("m.is_paid = 0");
    }

    // Only free models if configured
    if (this.onlyFree) {
      conditions.push("(c.is_free = 1 OR c.is_free IS NULL)");
    }

    // Exclude thinking models if configured
    if (this.excludeThinking) {
      conditions.push("m.id NOT REGEXP ?");
      params.push("thinking|reasoning|[-_]r1[-_]|[-_]r1$|^r1[-_]|o1[-_]|o3[-_]|o4[-_]|qwq");
    }

    const whereClause = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";

    // Get total count
    const totalStmt = this.db.prepare(`SELECT COUNT(*) AS count ${baseQuery}${whereClause}`);
    const totalResult = totalStmt.all(...params);
    const total = totalResult[0].count;

    // Get active count
    const activeStmt = this.db.prepare(`
      SELECT COUNT(*) AS count ${baseQuery}
      WHERE ${activeCondition}${whereClause ? " AND " + whereClause.slice(6) : ""}
    `);
    const activeParams = source === "train" ? [...params] : [now, ...params];
    const activeResult = activeStmt.all(activeParams);
    const active = activeResult[0].count;

    // Get cooldown count
    const cooldownStmt = this.db.prepare(`
      SELECT COUNT(*) AS count ${baseQuery}
      WHERE ${cooldownCondition}${whereClause ? " AND " + whereClause.slice(6) : ""}
    `);
    const cooldownParams = source === "train" ? [...params] : [now, ...params];
    const cooldownResult = cooldownStmt.all(cooldownParams);
    const cooldown = cooldownResult[0].count;

    // Get degraded count
    const degradedStmt = this.db.prepare(`
      SELECT COUNT(*) AS count ${baseQuery}
      WHERE ${degradedCondition}${whereClause ? " AND " + whereClause.slice(6) : ""}
    `);
    const degradedResult = degradedStmt.all(...params);
    const degraded = degradedResult[0].count;

    // Get banned count
    const bannedStmt = this.db.prepare(`
      SELECT COUNT(*) AS count ${baseQuery}
      WHERE ${bannedCondition}${whereClause ? " AND " + whereClause.slice(6) : ""}
    `);
    const bannedResult = bannedStmt.all(...params);
    const banned = bannedResult[0].count;

    // Get counts by provider
    const providerStmt = this.db.prepare(`
      SELECT
        m.provider,
        COUNT(*) AS count
      ${baseQuery}
      GROUP BY m.provider
    `);
    const providerResult = providerStmt.all(...params);
    const byProvider = {};
    providerResult.forEach(row => {
      byProvider[row.provider] = row.count;
    });

    return {
      total,
      active,
      cooldown,
      degraded,
      banned,
      byProvider
    };
  }

  getProviders() {
    const now = Date.now();

    const query = `
      SELECT
        ph.provider,
        ph.fails,
        ph.cooldown_until,
        ph.permanent,
        ph.needs_attention,
        ph.attention_reason,
        COUNT(m.id) AS modelCount
      FROM provider_history ph
      LEFT JOIN models m ON m.provider = ph.provider
      GROUP BY ph.provider
    `;

    const stmt = this.db.prepare(query);
    const providers = stmt.all();

    return providers.map(provider => ({
      provider: provider.provider,
      fails: provider.fails,
      cooldown_until: provider.cooldown_until,
      cooldownRemaining: provider.cooldown_until > now ? provider.cooldown_until - now : 0,
      permanent: provider.permanent === 1,
      needs_attention: provider.needs_attention === 1,
      attention_reason: provider.attention_reason,
      modelCount: provider.modelCount
    }));
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}
