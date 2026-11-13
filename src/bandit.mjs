import Database from "better-sqlite3";
import { profileMultiplier } from './modes-registry.mjs';
import { sanitizeBaseUrl, buildEndpointUrl } from './health-check.mjs';
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ProviderQuota from './provider-quota.mjs';
import { logPunishment, EVENT_TYPES } from './events.mjs';


export class DiscountedUCB1Bandit {
  _sanitizeModelId(modelId) {
    if (typeof modelId !== 'string') return modelId;
    if (modelId.includes('/')) {
      const parts = modelId.split('/');
      if (parts.length >= 3 && parts[0] === parts[1]) {
        const sanitized = [parts[0], ...parts.slice(2)].join('/');
        // Validate the sanitized model exists in the catalog
        const exists = this.db.prepare("SELECT 1 FROM catalog WHERE id = ?").get(sanitized);
        if (exists) {
          return sanitized;
        }
        // If sanitized model doesn't exist in catalog, return the original modelId
        // so it can be tracked and banned, rather than rejecting it silently
        return modelId;
      }
    }
    return modelId;
  }

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
    // Unify pricing filter into a single enum
    this.pricingFilter = String(process.env.PRICING_FILTER || "none").toLowerCase();
    const validFilters = ["none", "free-only", "paid-only", "exclude-paid"];
    if (!validFilters.includes(this.pricingFilter)) {
      console.warn(`[BANDIT] Invalid PRICING_FILTER value '${this.pricingFilter}', defaulting to 'none'`);
      this.pricingFilter = "none";
    }
    this.exploitOnly = String(process.env.EXPLOIT_ONLY || "false").toLowerCase() === "true";
    this.excludeThinking = String(process.env.EXCLUDE_THINKING || "false").toLowerCase() === "true";
    this._initDB();
    this._migrateDB();
    this.totalObservations = this._getMeta("totalObservations");
    this._lastReward = new Map();
    this._rankCache = { at: 0, map: new Map() }; // cache classifica (30s TTL)
    this.totalRequests = this._getMeta("totalRequests");
    this.quota = new ProviderQuota(this.db);
    this.pruneModels();
  }

  pruneModels() {
    try {
      const thirtyDaysAgo = Date.now() / 1000 - 30 * 24 * 60 * 60;
      // Get models not in catalog and used > 30 days ago
      const stmt = this.db.prepare(`
        DELETE FROM models
        WHERE id NOT IN (SELECT id FROM catalog)
        AND id IN (
          SELECT model FROM request_logs
          GROUP BY model
          HAVING MAX(started_at) < ?
        )
      `);
      const result = stmt.run(thirtyDaysAgo);
      if (result.changes > 0) {
        console.log(`[BANDIT] Pruned ${result.changes} inactive models.`);
      }
    } catch (e) {
      console.error(`[BANDIT] Error pruning models: ${e.message}`);
    }
  }

  getBanditConfig() {
    try {
      const modulePath = fileURLToPath(import.meta.url);
      const configPath = path.join(path.dirname(modulePath), "..", "config", "bandit.json");
      const configContent = fs.readFileSync(configPath, "utf8");
      return JSON.parse(configContent);
    } catch (err) {
      console.error("[BANDIT] Error reading bandit config:", err.message);
      return { fallbackModels: [], errorConfig: { degradationThreshold: 3, rehabilitationPeriodMs: 172800000, classification: { transientErrors: [], permanentErrors: [] } } };
    }
  }

  getFallbackModels() {
    return this.getBanditConfig().fallbackModels || [];
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
          total_failures INTEGER DEFAULT 0,
          cooldown_until REAL DEFAULT 0,
          permanent INTEGER DEFAULT 0,
          last_used_index INTEGER DEFAULT 0,
          consecutive_5xx INTEGER DEFAULT 0,
          consecutive_critical_failures INTEGER DEFAULT 0,
          degraded INTEGER DEFAULT 0,
          degraded_since REAL DEFAULT 0,
          banned_since REAL DEFAULT 0,
          is_paid INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS models_train (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          N REAL DEFAULT 0,
          sum_reward REAL DEFAULT 0,
          last_used_index INTEGER DEFAULT 0,
          isTraining INTEGER DEFAULT 0,
          executionTime INTEGER DEFAULT 0,
          calledModels INTEGER DEFAULT 0,
          okStatus INTEGER DEFAULT 0,
          errorStatus INTEGER DEFAULT 0,
          statusMessage TEXT DEFAULT 'Idle',
          updated_at REAL DEFAULT 0
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
          is_paid INTEGER DEFAULT 0,
          supports_tools INTEGER DEFAULT 0,
          supports_image_generation INTEGER DEFAULT 0,
          supports_vision INTEGER DEFAULT 0,
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

      const trainColumns = this.db.pragma("table_info(models_train)");
      const hasIsTraining = trainColumns.some(col => col.name === "isTraining");
      const hasExecutionTime = trainColumns.some(col => col.name === "executionTime");
      const hasCalledModels = trainColumns.some(col => col.name === "calledModels");
      const hasOkStatus = trainColumns.some(col => col.name === "okStatus");
      const hasErrorStatus = trainColumns.some(col => col.name === "errorStatus");
      const hasStatusMessage = trainColumns.some(col => col.name === "statusMessage");
      const hasBannedSince = modelColumns.some(col => col.name === "banned_since");

      // Add total_failures column for progressive escalation
      const hasTotalFailures = modelColumns.some(col => col.name === "total_failures");

      if (!hasTotalFailures) {
        console.log("[BANDIT] Migrazione: aggiungo total_failures a models");
        try {
          this.db.exec(`ALTER TABLE models ADD COLUMN total_failures INTEGER DEFAULT 0`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna total_failures:", err.message);
          throw err;
        }
      }

      if (!hasBannedSince) {
        console.log("[BANDIT] Migrazione: aggiungo banned_since a models");
        try {
          this.db.exec(`ALTER TABLE models ADD COLUMN banned_since REAL DEFAULT 0`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna banned_since:", err.message);
          throw err;
        }
      }

      if (!hasIsTraining) {
        console.log("[BANDIT] Migrazione: aggiungo isTraining a models_train");
        try {
          this.db.exec(`ALTER TABLE models_train ADD COLUMN isTraining INTEGER DEFAULT 0`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna isTraining:", err.message);
          throw err;
        }
      }

      if (!hasExecutionTime) {
        console.log("[BANDIT] Migrazione: aggiungo executionTime a models_train");
        try {
          this.db.exec(`ALTER TABLE models_train ADD COLUMN executionTime INTEGER DEFAULT 0`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna executionTime:", err.message);
          throw err;
        }
      }

      if (!hasCalledModels) {
        console.log("[BANDIT] Migrazione: aggiungo calledModels a models_train");
        try {
          this.db.exec(`ALTER TABLE models_train ADD COLUMN calledModels INTEGER DEFAULT 0`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna calledModels:", err.message);
          throw err;
        }
      }

      if (!hasOkStatus) {
        console.log("[BANDIT] Migrazione: aggiungo okStatus a models_train");
        try {
          this.db.exec(`ALTER TABLE models_train ADD COLUMN okStatus INTEGER DEFAULT 0`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna okStatus:", err.message);
          throw err;
        }
      }

      if (!hasErrorStatus) {
        console.log("[BANDIT] Migrazione: aggiungo errorStatus a models_train");
        try {
          this.db.exec(`ALTER TABLE models_train ADD COLUMN errorStatus INTEGER DEFAULT 0`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna errorStatus:", err.message);
          throw err;
        }
      }

      if (!hasStatusMessage) {
        console.log("[BANDIT] Migrazione: aggiungo statusMessage a models_train");
        try {
          this.db.exec(`ALTER TABLE models_train ADD COLUMN statusMessage TEXT DEFAULT 'Idle'`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna statusMessage:", err.message);
          throw err;
        }
      }

      const hasUpdatedAt = trainColumns.some(col => col.name === "updated_at");
      if (!hasUpdatedAt) {
        console.log("[BANDIT] Migrazione: aggiungo updated_at a models_train");
        try {
          this.db.exec(`ALTER TABLE models_train ADD COLUMN updated_at REAL DEFAULT 0`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna updated_at:", err.message);
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

      const hasSupportsVision = catalogColumns.some(col => col.name === "supports_vision");
      if (!hasSupportsVision) {
        console.log("[BANDIT] Migrazione: aggiungo supports_vision a catalog");
        try {
          this.db.exec(`ALTER TABLE catalog ADD COLUMN supports_vision INTEGER DEFAULT 0`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna supports_vision:", err.message);
          throw err;
        }
      }

      const providerCols = this.db.pragma("table_info(provider_history)");
      const hasConsecutiveFailures = providerCols.some(col => col.name === "consecutive_failures");

      if (!hasConsecutiveFailures) {
        console.log("[BANDIT] Migrazione: aggiungo consecutive_failures a provider_history");
        try {
          this.db.exec(`ALTER TABLE provider_history ADD COLUMN consecutive_failures INTEGER DEFAULT 0`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna consecutive_failures:", err.message);
          throw err;
        }
      }

      const hasCircuitBreakerUntil = providerCols.some(col => col.name === "circuit_breaker_until");

      if (!hasCircuitBreakerUntil) {
        console.log("[BANDIT] Migrazione: aggiungo circuit_breaker_until a provider_history");
        try {
          this.db.exec(`ALTER TABLE provider_history ADD COLUMN circuit_breaker_until REAL DEFAULT 0`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna circuit_breaker_until:", err.message);
          throw err;
        }
      }

      const hasLastSuccessTime = providerCols.some(col => col.name === "last_success_time");

      if (!hasLastSuccessTime) {
        console.log("[BANDIT] Migrazione: aggiungo last_success_time a provider_history");
        try {
          this.db.exec(`ALTER TABLE provider_history ADD COLUMN last_success_time REAL DEFAULT 0`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna last_success_time:", err.message);
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

      const hasCatalogIsPaid = catalogColumns.some(col => col.name === "is_paid");
      if (!hasCatalogIsPaid) {
        console.log("[BANDIT] Migrazione: aggiungo is_paid a catalog");
        try {
          this.db.exec(`ALTER TABLE catalog ADD COLUMN is_paid INTEGER DEFAULT 0`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna is_paid a catalog:", err.message);
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

      // Add consecutive_critical_failures column for 3-strike aggressive punishment
      const hasConsecutiveCriticalFailures = modelColumns.some(col => col.name === "consecutive_critical_failures");
      if (!hasConsecutiveCriticalFailures) {
        console.log("[BANDIT] Migrazione: aggiungo consecutive_critical_failures a models");
        try {
          this.db.exec(`ALTER TABLE models ADD COLUMN consecutive_critical_failures INTEGER DEFAULT 0`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna consecutive_critical_failures:", err.message);
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

      // Migrazione: total_failures e punishment_log per provider_history
      const hasTotalFailuresProv = providerCols.some(col => col.name === "total_failures");
      if (!hasTotalFailuresProv) {
        console.log("[BANDIT] Migrazione: aggiungo total_failures a provider_history");
        try {
          this.db.exec(`ALTER TABLE provider_history ADD COLUMN total_failures INTEGER DEFAULT 0`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna total_failures:", err.message);
        }
      }

      const hasPunishmentLog = providerCols.some(col => col.name === "punishment_log");
      if (!hasPunishmentLog) {
        console.log("[BANDIT] Migrazione: aggiungo punishment_log a provider_history");
        try {
          this.db.exec(`ALTER TABLE provider_history ADD COLUMN punishment_log TEXT DEFAULT '[]'`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna punishment_log:", err.message);
        }
      }

      const hasLastPunishment = providerCols.some(col => col.name === "last_punishment");
      if (!hasLastPunishment) {
        console.log("[BANDIT] Migrazione: aggiungo last_punishment a provider_history");
        try {
          this.db.exec(`ALTER TABLE provider_history ADD COLUMN last_punishment TEXT`);
        } catch (err) {
          console.error("[BANDIT] Errore aggiunta colonna last_punishment:", err.message);
        }
      }

      console.log("[BANDIT] Migrazione database completata");

      // Create punishment_events table for persisting punishment events
      const punishmentEventsTable = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='punishment_events'").get();
      if (!punishmentEventsTable) {
        console.log("[BANDIT] Creazione tabella punishment_events");
        try {
          this.db.exec(`CREATE TABLE punishment_events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              event_type TEXT NOT NULL,
              provider TEXT NOT NULL,
              model_id TEXT,
              reason TEXT,
              cooldown_ms REAL DEFAULT 0,
              failures INTEGER DEFAULT 0,
              consecutive INTEGER DEFAULT 0,
              created_at REAL DEFAULT (strftime('%s', 'now')),
              source TEXT DEFAULT 'prod'
            )`);
          this.db.exec(`CREATE INDEX IF NOT EXISTS idx_punishment_events_provider ON punishment_events(provider)`);
          this.db.exec(`CREATE INDEX IF NOT EXISTS idx_punishment_events_model ON punishment_events(model_id)`);
          this.db.exec(`CREATE INDEX IF NOT EXISTS idx_punishment_events_created ON punishment_events(created_at)`);
        } catch (err) {
          console.error("[BANDIT] Errore creazione tabella punishment_events:", err.message);
        }
      }
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
    const originalModelId = modelId;
    modelId = this._sanitizeModelId(modelId);
    console.log(`[DEBUG] _registerModelUse: original=${originalModelId}, sanitized=${modelId}`);
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
    // Insert into request_logs for backward compatibility with existing callers/tests.
    // Production code uses _incrMeta() + recordRequestStarted() to exclude selection time
    // from latency, but recordRequest() must still log for direct callers.
    this.db.prepare("INSERT INTO request_logs (started_at, model, provider) VALUES (?, ?, ?)").run(Date.now(), model, provider);
  }

  recordRequestStarted(model = null, provider = null) {
    // Insert into request_logs with started_at set to current time
    // This should be called after model selection to exclude selection time from latency
    this.db.prepare("INSERT INTO request_logs (started_at, model, provider) VALUES (?, ?, ?)").run(Date.now(), model, provider);
  }

  recordRequestError(statusCode, errorMessage = null, model = null, provider = null) {
    this.db.prepare(
      "UPDATE request_logs SET ended_at = ?, status_code = ?, error_message = ?, model = COALESCE(?, model), provider = COALESCE(?, provider) WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1"
    ).run(Date.now(), statusCode, errorMessage, model, provider);
  }

  recordPunishmentEvent(eventType, provider, modelId, reason, cooldownMs, failures, consecutive, source = 'prod') {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO punishment_events (event_type, provider, model_id, reason, cooldown_ms, failures, consecutive, created_at, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(eventType, provider, modelId || null, reason || null, cooldownMs || 0, failures || 0, consecutive || 0, Date.now(), source);
    } catch (err) {
      console.error("[BANDIT] Errore registrazione evento punizione:", err.message);
    }
  }

  getRecentPunishmentEvents(limit = 20) {
    try {
      const stmt = this.db.prepare(`
        SELECT event_type as type, provider, model_id as modelId, reason, cooldown_ms as cooldownMs,
               failures, consecutive, created_at as timestamp
        FROM punishment_events
        ORDER BY created_at DESC
        LIMIT ?
      `);
      return stmt.all(limit);
    } catch (err) {
      console.error("[BANDIT] Errore recupero eventi punizione:", err.message);
      return [];
    }
  }

  async fetchAndSyncModels() {
    try {
      const apiKey = process.env.OMNIROUTE_API_KEY || "";
      const baseUrl = sanitizeBaseUrl(process.env.OMNIROUTE_BASE_URL, "https://router.omniroute.ai/v1");
      const modelsUrl = buildEndpointUrl(baseUrl, "/models");

      const headers = {};
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      let res;
      try {
        res = await fetch(modelsUrl, { headers, signal: controller.signal });
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        throw new Error(`Connessione fallita o timeout (${fetchErr.message})`);
      }
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Impossibile recuperare i modelli da OmniRoute`);
      }

      const data = await res.json();
      const modelList = data.data || data.models || data;

      if (!Array.isArray(modelList)) {
        throw new Error("Response malformato: data.data non è array");
      }

      const insertStmt = this.db.prepare(
        `INSERT INTO catalog (id, provider, max_input_tokens, is_free, is_paid, supports_tools, supports_vision, supports_image_generation, capability, supports_chat, supports_audio_generation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           provider = excluded.provider,
           max_input_tokens = excluded.max_input_tokens,
           is_free = excluded.is_free,
           is_paid = excluded.is_paid,
           supports_tools = excluded.supports_tools,
           supports_vision = excluded.supports_vision,
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
          let modelId = typeof m === "string" ? m : (m.id || m.name);
          modelId = this._sanitizeModelId(modelId);
          if (!modelId) continue;
          raw++;

          if (modelId.startsWith("auto/") || modelId.startsWith("gh/")) {
            skipped++;
            continue;
          }

          const provider = this._getProvider(modelId);
                    const maxInput = Number(m?.max_input_tokens || m?.context_length || 0) || 0;
                    const isFree = isFreeModel(modelId) ? 1 : 0;
                    const isPaid = isFree ? 0 : 1;
                    const isFim = /fim|fill.?in.?the.?middle/i.test(modelId);
          let supportsTools = (m && typeof m === "object" && m.capabilities && m.capabilities.tool_calling === true) ? 1 : 0;
          if (!supportsTools && !isFim) {
            const toolPatterns = [/gpt-4/i, /gpt-3\.5/i, /o1/i, /o3/i, /o4/i, /claude-3/i, /claude-4/i, /llama-3/i, /llama-4/i, /mistral/i, /mixtral/i, /codestral/i, /qwen2/i, /qwen3/i, /deepseek/i, /gemini/i, /command-r/i, /glm-4/i, /chat/i];
            const excludeToolPatterns = /embedding|rerank|moderation|zero|base|completion$|stt|tts/i;
            if (!excludeToolPatterns.test(modelId)) {
              for (const p of toolPatterns) {
                if (p.test(modelId)) {
                  supportsTools = 1;
                  break;
                }
              }
            }
          }
          const supportsVision = (m && typeof m === "object" && m.capabilities && m.capabilities.vision === true) ? 1 : 0;

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

          // Vision detection fallback by model name patterns when capabilities API doesn't provide it
          let finalSupportsVision = supportsVision;
          if (!finalSupportsVision && supportsChat) {
            const visionPatterns = [
              /vision/i, /-vl\b/i, /-vl-/i, /gpt-4o/i, /claude-3/i, /claude-4/i, /gemini-1.5/i,
              /gemini-2.0/i, /gemini-2.5/i, /qwen.*vl/i, /qwen3.*vl/i, /llava/i, /pixtral/i,
              /moondream/i, /fuyu/i, /cogvlm/i, /internvl/i, /minicpm-v/i, /ovis/i,
              /capybara/i, /openflamingo/i, /kosmos/i
            ];
            for (const pattern of visionPatterns) {
              if (pattern.test(modelId)) {
                finalSupportsVision = 1;
                break;
              }
            }
          }

          insertStmt.run(modelId, provider, maxInput, isFree, isPaid, supportsTools, finalSupportsVision, supportsImageGeneration, capability, supportsChat, supportsAudioGeneration);
          inserted++;
        }
        return { inserted, skipped, raw };
      });
  
        const { inserted, skipped, raw } = syncCatalog(modelList);
        
        // Ensure all catalog models have corresponding entries in models table
        // This ensures session affinity remains enabled (models >= catalog)
        this.db.prepare(`
          INSERT OR IGNORE INTO models (id, provider, last_used_index)
          SELECT c.id, c.provider, 1
          FROM catalog c
          WHERE NOT EXISTS (SELECT 1 FROM models WHERE models.id = c.id)
        `).run();

        // Ensure all catalog models have corresponding entries in models_train table
        this.db.prepare(`
          INSERT OR IGNORE INTO models_train (id, provider, last_used_index)
          SELECT c.id, c.provider, 1
          FROM catalog c
          WHERE NOT EXISTS (SELECT 1 FROM models_train WHERE models_train.id = c.id)
        `).run();
        const modelsCount = this.db.prepare("SELECT COUNT(*) as count FROM models").get().count;
        console.log(`[BANDIT] Models table synchronized: ${modelsCount} models (catalog: ${inserted})`);
        
        this._rankCache = { at: 0, map: new Map() };
      this._setMeta("catalogRawCount", raw);
      this._setMeta("catalogTotal", inserted);
      this._setMeta("lastSyncTimestamp", Date.now());
      console.log(`[BANDIT] Catalog sincronizzato: ${inserted} modelli totali (inclusi chat e non-chat, esclusi ${skipped} ignorati su ${raw} totali)`);
    } catch (err) {
      console.warn("[BANDIT] Attenzione: Impossibile sincronizzare i modelli da remoto:", err.message);
      const cachedCount = this.db.prepare("SELECT COUNT(*) as count FROM catalog").get().count;
      if (cachedCount > 0) {
        console.log(`[BANDIT] Utilizzo della cache locale: ${cachedCount} modelli trovati nel catalogo SQLite.`);
      } else {
        console.warn("[BANDIT] Attenzione: Nessun modello in cache nel database SQLite.");
      }
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
    modelId = this._sanitizeModelId(modelId);
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

  _getModelCooldownMs(totalFailures) {
    // Exponential backoff: 30s → 5min → 30min → 2hr → permanent
    // totalFailures is the cumulative failure count across restarts
    if (totalFailures >= 10) return null; // 10+ fails = permanent ban
    const cooldowns = [
      0,                    // 0 failures - no cooldown
      30 * 1000,            // 1st failure → 30 seconds
      2 * 60 * 1000,        // 2nd failure → 2 minutes
      5 * 60 * 1000,        // 3rd failure → 5 minutes
      15 * 60 * 1000,       // 4th failure → 15 minutes
      30 * 60 * 1000,       // 5th failure → 30 minutes
      1 * 60 * 60 * 1000,   // 6th failure → 1 hour
      2 * 60 * 60 * 1000,   // 7th failure → 2 hours
      6 * 60 * 60 * 1000,   // 8th failure → 6 hours
      12 * 60 * 60 * 1000   // 9th failure → 12 hours
    ];
    return cooldowns[Math.min(totalFailures, 9)];
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
    if (fails >= 4) return null; // 4+ fails = permanent (handled elsewhere)
    const cooldowns = [
      0,
      4 * 3600000,   // 1° fail → 4h (was 2h)
      16 * 3600000,  // 2° fail → 16h (was 8h)
      48 * 3600000   // 3° fail → 48h (was 24h)
    ];
    return cooldowns[Math.min(fails, 3)];
  }

  recordFeedback(modelId, success, reward = 1.0, errorDetails = null, opts = {}) {
    const sanitizedModelId = this._sanitizeModelId(modelId);
    console.log(`[DEBUG] recordFeedback: modelId=${modelId}, sanitized=${sanitizedModelId}`);
    console.log(`[BANDIT-RECORD-FEEDBACK] modelId=${modelId} success=${success} reward=${reward} source=${opts.source}`);
    try {
      console.time(`recordFeedback-${modelId}`);
      const tx = this.db.transaction(() => {
        const now = Date.now();
        const source = opts.source === 'training' ? 'training' : 'prod';

        // Ensure model exists in models table (for catalog-only models or any model receiving feedback)
        const cat = this.db.prepare("SELECT provider FROM catalog WHERE id = ?").get(sanitizedModelId);
        const existingModel = this.db.prepare("SELECT provider FROM models WHERE id = ?").get(sanitizedModelId);
        const provider = cat?.provider || existingModel?.provider || opts.provider || 'unknown';
        if (provider) {
          this.db.prepare(
            `INSERT OR IGNORE INTO models (id, provider, N, sum_reward, fails, cooldown_until, last_used_index, permanent, degraded)
             VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0)`
          ).run(sanitizedModelId, provider);
        }

        if (source === 'training' || source === 'prod') {
          if (!success && errorDetails && typeof errorDetails === "object") {
            const cat = this.db.prepare("SELECT provider FROM catalog WHERE id = ?").get(sanitizedModelId);
            const existingModel = this.db.prepare("SELECT provider FROM models WHERE id = ?").get(sanitizedModelId);
            const provider = cat?.provider || existingModel?.provider || opts.provider || 'unknown';
            if (provider) {
              console.log(`[BANDIT] Processing error for model: ${modelId}, provider: ${provider}`);
              const c = this._classifyError(errorDetails, provider);
              if (!c) {
                console.error(`[BANDIT-ERROR] Failed to classify error for model=${modelId}, provider=${provider}`);
                return;
              }
              console.log(`[BANDIT] Error classified: ${JSON.stringify(c)}`);
              switch (c.action) {
              case "ban-provider":
                              if (source === 'training' || String(process.env.DEBUG_BANDIT || "").toLowerCase() === "true") {
                                console.log(`[BANDIT-TRAIN] ${modelId}: ban-provider (${c.reason})`);
                              }
                              this._banProvider(provider);
                              console.log(`[BANDIT-CONSEQUENCE] ban-provider | model=${modelId} provider=${provider} reason=${c.reason} scope=provider`);
                              logPunishment({ bandit: this, type: EVENT_TYPES.BAN_PROVIDER, provider, modelId: sanitizedModelId, reason: c.reason, cooldownMs: 0, failures: 0 });
                              break;
                            case "ban-model":
                              if (source === 'training' || String(process.env.DEBUG_BANDIT || "").toLowerCase() === "true") {
                                console.log(`[BANDIT-TRAIN] ${modelId}: ban-model (${c.reason})`);
                              }
                              this.db.prepare(
                                `INSERT INTO models (id, provider, permanent, banned_since, N, sum_reward, fails, cooldown_until, last_used_index)
                                 VALUES (?, ?, 1, ?, 0, 0, 0, 0, 0)
                                 ON CONFLICT(id) DO UPDATE SET permanent = 1, banned_since = ?`
                              ).run(sanitizedModelId, provider, Date.now(), Date.now());
                              // Sync provider_history: mark provider as needing attention when a model is permanently banned
                              this.db.prepare(
                                `UPDATE provider_history SET needs_attention = 1, attention_reason = ?, attention_message = ? WHERE provider = ?`
                              ).run(c.reason, `Model banned: ${sanitizedModelId} (${c.reason})`, provider);
                              console.log(`[BANDIT-CONSEQUENCE] ban-model | model=${modelId} provider=${provider} reason=${c.reason} scope=model`);
                              logPunishment({ bandit: this, type: EVENT_TYPES.BAN_MODEL, provider, modelId: sanitizedModelId, reason: c.reason, cooldownMs: 0, failures: 0 });
                              break;
              case "cooldown-provider":
                if (source === 'training' || String(process.env.DEBUG_BANDIT || "").toLowerCase() === "true") {
                  console.log(`[BANDIT-TRAIN] ${modelId}: cooldown-provider (${c.reason}) per ${(c.cooldownMs/1000)|0}s`);
                }
                if (c.reason === "no-credit" || /402|payment|credit|funds/i.test(String(errorDetails?.status || "") + " " + String(errorDetails?.message || ""))) {
                  this.db.prepare(`UPDATE models SET is_paid = 1 WHERE id = ?`).run(sanitizedModelId);
                }
                this._forceProviderCooldown(provider, c.cooldownMs, c.reason);
                console.log(`[BANDIT-CONSEQUENCE] cooldown-provider | model=${modelId} provider=${provider} reason=${c.reason} cooldownMs=${c.cooldownMs} scope=provider`);
                                logPunishment({ bandit: this, type: EVENT_TYPES.COOLDOWN_PROVIDER, provider, modelId: sanitizedModelId, reason: c.reason, cooldownMs: c.cooldownMs || 0, failures: 0 });
                                break;
                              case "cooldown-paid-only":
                                this._cooldownPaidOnly(provider, c.cooldownMs);
                                console.log(`[BANDIT-CONSEQUENCE] cooldown-paid-only | model=${modelId} provider=${provider} cooldownMs=${c.cooldownMs} scope=provider`);
                                logPunishment({ bandit: this, type: EVENT_TYPES.COOLDOWN_PROVIDER, provider, modelId: sanitizedModelId, reason: c.reason || 'cooldown-paid-only', cooldownMs: c.cooldownMs || 0, failures: 0 });
                                break;
                              case "flag-provider":
                                if (source === 'training' || String(process.env.DEBUG_BANDIT || "").toLowerCase() === "true") {
                                  console.log(`[BANDIT-TRAIN] ${modelId}: flag-provider (${c.reason})`);
                                }
                                this._flagProviderAttention(provider, c.reason, errorDetails.message || errorDetails.error || "");
                                console.log(`[BANDIT-CONSEQUENCE] flag-provider | model=${modelId} provider=${provider} reason=${c.reason} scope=provider`);
                                logPunishment({ bandit: this, type: EVENT_TYPES.FLAG_PROVIDER, provider, modelId: sanitizedModelId, reason: c.reason, cooldownMs: 0, failures: 0 });
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
                                    ).run(sanitizedModelId, provider, targetLimit);
                                  }
                                }
                                if (isTransient) {
                                  this.db.prepare(`UPDATE models SET consecutive_5xx = consecutive_5xx + 1 WHERE id = ?`).run(sanitizedModelId);
                                  const modelRow = this.db.prepare(`SELECT consecutive_5xx FROM models WHERE id = ?`).get(sanitizedModelId);
                                  if (modelRow && modelRow.consecutive_5xx >= 3) {
                                    this.db.prepare(`UPDATE models SET degraded = 1, degraded_since = ? WHERE id = ?`).run(Date.now(), sanitizedModelId);
                                    console.log(`[BANDIT-CONSEQUENCE] degraded | model=${modelId} provider=${provider} reason=consecutive_5xx count=${modelRow.consecutive_5xx} scope=model`);
                                    logPunishment({ bandit: this, type: EVENT_TYPES.DEGRADED_MODEL, provider, modelId: sanitizedModelId, reason: 'consecutive_5xx', cooldownMs: 0, failures: 0 });
                                  }
                  // Also set degraded_since if degraded via config-driven permanent error (category=PERMANENT and scope=model)
                  if (c.category === "PERMANENT" && c.scope === "model") {
                    this.db.prepare(`UPDATE models SET degraded = 1, degraded_since = ? WHERE id = ? AND degraded = 0`).run(Date.now(), sanitizedModelId);
                  }
                }
                
                // Determine cooldown duration: use config-specified, or default escalating if transient
                let cooldownMs = c.cooldownMs;
                if (!cooldownMs || cooldownMs <= 0) {
                  if (isTransient) {
                    const model = this.db.prepare("SELECT fails FROM models WHERE id = ?").get(sanitizedModelId);
                    const failCount = model ? model.fails : 0;
                    cooldownMs = this._getModelCooldownMs(failCount + 1);
                  }
                }

                // Apply cooldown to model if applicable
                if (cooldownMs && cooldownMs > 0) {
                  this.db.prepare(`UPDATE models SET cooldown_until = ? WHERE id = ?`).run(Date.now() + cooldownMs, sanitizedModelId);
                  // Sync provider_history: mark provider as having a model on cooldown
                  this.db.prepare(
                    `UPDATE provider_history SET cooldown_until = ?, needs_attention = 1, attention_reason = ?, attention_message = ? WHERE provider = ?`
                  ).run(Date.now() + cooldownMs, c.reason, `Model cooldown: ${sanitizedModelId} (${c.reason})`, provider);
                  console.log(`[BANDIT-CONSEQUENCE] cooldown-model | model=${modelId} provider=${provider} reason=${c.reason} cooldownMs=${cooldownMs} scope=model`);
                  logPunishment({ bandit: this, type: EVENT_TYPES.COOLDOWN_MODEL, provider, modelId: sanitizedModelId, reason: c.reason, cooldownMs, failures: 0 });
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
      // On success: reset all consecutive failure counters and cooldown, but keep total_failures for escalation tracking
      // NOTE: For training source, we skip UCB1 updates (sum_reward, N, last_used_index) to avoid pollution
      // Training feedback should only update operational metrics (fails, cooldown, etc.), not bandit scores
      if (source !== 'training') {
        // Production feedback: update UCB1 metrics
        this.db.prepare(
          `UPDATE models SET sum_reward = sum_reward + ?, N = N + 1, fails = 0, last_used_index = last_used_index + 1, consecutive_5xx = 0, consecutive_critical_failures = 0, cooldown_until = 0
           WHERE id = ?`
        ).run(reward, sanitizedModelId);
        console.log(`[BANDIT-5STRIKE] RESET | model=${modelId} | UCB1 updated sum_reward+=${reward} N++ | reason=success`);
      } else {
        // Training feedback: only update operational metrics, NOT UCB1 scores
        this.db.prepare(
          `UPDATE models SET fails = 0, consecutive_5xx = 0, consecutive_critical_failures = 0, cooldown_until = 0
           WHERE id = ?`
        ).run(sanitizedModelId);
        console.log(`[BANDIT-5STRIKE] RESET | model=${modelId} | operational metrics reset only (no UCB1 pollution) | reason=training-success`);
      }
      this.db.prepare(
        "UPDATE request_logs SET ended_at = ?, status_code = ?, error_message = ?, model = ?, provider = ? WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1"
      ).run(Date.now(), 200, null, sanitizedModelId, provider);
      if (source !== 'training') {
        this._lastReward.set(modelId, reward);
      }
      // Reset consecutive provider failures on success
      if (provider && provider !== 'unknown') {
        this.db.prepare(
          `UPDATE provider_history SET consecutive_failures = 0, circuit_breaker_until = 0, last_success_time = ?, cooldown_until = 0 WHERE provider = ?`
        ).run(Date.now(), provider);
      }
      // Belt-and-suspenders: clear model cooldown on success
      this.db.prepare(`UPDATE models SET cooldown_until = 0 WHERE id = ?`).run(sanitizedModelId);
      if (source === 'training') {
        this._recordTrainingFeedback(sanitizedModelId, true, reward);
        console.log(`[BANDIT-TRAIN] Recorded training feedback for model=${modelId} success=true reward=${reward} source=training`);
      }
      } else {
        // On failure: increment both fails (consecutive) and total_failures (cumulative for escalation)
        this.db.prepare(
          `UPDATE models SET fails = fails + 1, total_failures = total_failures + 1, last_used_index = last_used_index + 1
           WHERE id = ?`
        ).run(sanitizedModelId);
        
        // Get updated total_failures for cooldown calculation
        const modelRow = this.db.prepare("SELECT total_failures, consecutive_critical_failures FROM models WHERE id = ?").get(sanitizedModelId);
        const totalFailures = modelRow ? modelRow.total_failures : 1;
        const currentConsecutiveCritical = modelRow ? modelRow.consecutive_critical_failures : 0;
        
        // Determine if this is a critical failure (403, 429, timeout, safeWrite errors, etc.)
        const statusCode = errorDetails?.status || 500;
        const errorMessage = errorDetails?.message || errorDetails?.error || String(errorDetails) || "Unknown error";
        const isCriticalFailure = this._isCriticalFailure(statusCode, errorMessage, errorDetails);
        
        // Track consecutive critical failures for 5-strike rule
        if (isCriticalFailure) {
          const newConsecutiveCritical = currentConsecutiveCritical + 1;
          console.log(`[BANDIT-5STRIKE] INCREMENT | model=${modelId} | consecutive_critical_failures: ${currentConsecutiveCritical} -> ${newConsecutiveCritical} | status=${statusCode} | reason=${errorDetails?.reason || 'unknown'}`);
          
          // Check for 5-strike rule: permanent ban after 5 consecutive critical failures
          if (newConsecutiveCritical >= 5) {
            // Check if this is a paid model - if so, punish the entire paid sub-group for that provider
            const modelRow = this.db.prepare("SELECT is_paid FROM models WHERE id = ?").get(sanitizedModelId);
            const isPaidModel = modelRow && modelRow.is_paid === 1;
            
            if (isPaidModel) {
              // PUNISH ENTIRE PAID SUB-GROUP: Ban all paid models from this provider
              // Cascade guard: Only ban if this is not a cascade reaction (simple check for now)
              this.db.prepare(
                `UPDATE models SET permanent = 1, banned_since = ?, cooldown_until = 0, consecutive_critical_failures = ?
                 WHERE provider = ? AND is_paid = 1 AND permanent = 0`
              ).run(Date.now(), newConsecutiveCritical, provider);
              // Sync provider_history: mark provider as permanently banned when paid group is banned
              this.db.prepare(
                `UPDATE provider_history SET permanent = 1, needs_attention = 1, attention_reason = ?, attention_message = ? WHERE provider = ?`
              ).run('paid-group-ban', `5-strike paid-group ban on provider=${provider}`, provider);
              console.log(`[BANDIT-5STRIKE] PAID-GROUP-BAN | provider=${provider} | 5 consecutive critical failures on paid model=${modelId} | permanent ban applied to ALL paid models in provider | total_critical=${newConsecutiveCritical} | STATUS_CODE=${statusCode}`);
              logPunishment({ bandit: this, type: EVENT_TYPES.BAN_PAID_GROUP, provider, modelId, reason: '5-strike-rule', cooldownMs: 0, failures: newConsecutiveCritical, consecutive: newConsecutiveCritical });
            } else {
              // Non-paid model: just ban the individual model
              // Use INSERT OR REPLACE for new models, UPDATE preserves metrics for existing models
              const existing = this.db.prepare("SELECT id FROM models WHERE id = ?").get(sanitizedModelId);
              if (!existing) {
                // New model: insert with default metrics (N=0, sum_reward=0, fails=0, etc.)
                this.db.prepare(
                  `INSERT INTO models (id, provider, permanent, banned_since, N, sum_reward, fails, cooldown_until, last_used_index, consecutive_critical_failures, total_failures, consecutive_5xx, degraded, is_paid)
                   VALUES (?, ?, 1, ?, 0, 0, 0, 0, 0, ?, 0, 0, 0, 0)`
                ).run(sanitizedModelId, provider, Date.now(), newConsecutiveCritical);
              } else {
                // Existing model: only update ban-related columns, preserve all metrics
                this.db.prepare(
                  `UPDATE models SET permanent = 1, banned_since = ?, consecutive_critical_failures = ?, cooldown_until = 0 WHERE id = ?`
                ).run(Date.now(), newConsecutiveCritical, sanitizedModelId);
              }
              // Sync provider_history: mark provider as needing attention when individual model is permanently banned
              this.db.prepare(
                `UPDATE provider_history SET needs_attention = 1, attention_reason = ?, attention_message = ? WHERE provider = ?`
              ).run('5-strike-permanent-ban', `Model permanently banned: ${sanitizedModelId} (5-strike-rule)`, provider);
              console.log(`[BANDIT-5STRIKE] PERMANENT-BAN | model=${modelId} provider=${provider} | 5 consecutive critical failures detected | total_critical=${newConsecutiveCritical} | reason=5-strike-rule | STATUS_CODE=${statusCode}`);
              logPunishment({ bandit: this, type: EVENT_TYPES.BAN_MODEL, provider, modelId: sanitizedModelId, reason: '5-strike-rule', cooldownMs: 0, failures: newConsecutiveCritical, consecutive: newConsecutiveCritical });
            }
          } else {
            // Just increment the counter, don't ban yet
            this.db.prepare(`UPDATE models SET consecutive_critical_failures = ? WHERE id = ?`).run(newConsecutiveCritical, sanitizedModelId);
            console.log(`[BANDIT-5STRIKE] COUNT | model=${modelId} | consecutive_critical_failures=${newConsecutiveCritical}/5 | STATUS_CODE=${statusCode} | not yet permanent ban`);
          }
        } else {
          // Non-critical failure: reset consecutive_critical_failures counter
          if (currentConsecutiveCritical > 0) {
            console.log(`[BANDIT-3STRIKE] RESET | model=${modelId} | consecutive_critical_failures reset to 0 | reason=non-critical-failure | status=${statusCode}`);
          }
          this.db.prepare(`UPDATE models SET consecutive_critical_failures = 0 WHERE id = ?`).run(sanitizedModelId);
        }
        
        // Apply escalating cooldown based on total_failures
        const cooldownMs = this._getModelCooldownMs(totalFailures);
        if (cooldownMs && cooldownMs > 0) {
          this.db.prepare(`UPDATE models SET cooldown_until = ? WHERE id = ?`).run(Date.now() + cooldownMs, sanitizedModelId);
          console.log(`[BANDIT-CONSEQUENCE] cooldown-model | model=${modelId} provider=${provider} reason=escalation totalFailures=${totalFailures} cooldownMs=${cooldownMs} scope=model`);
        } else if (cooldownMs === null) {
          // Permanent ban at 5+ total failures (if not already banned by 3-strike rule)
          const currentModel = this.db.prepare("SELECT permanent FROM models WHERE id = ?").get(sanitizedModelId);
          if (!currentModel || currentModel.permanent !== 1) {
            this.db.prepare(
              `UPDATE models SET permanent = 1, banned_since = ? WHERE id = ?`
            ).run(Date.now(), sanitizedModelId);
            // Sync provider_history: mark provider as permanently banned when model escalates to permanent ban
            this.db.prepare(
              `UPDATE provider_history SET permanent = 1, needs_attention = 1, attention_reason = ?, attention_message = ? WHERE provider = ?`
            ).run('escalation-permanent-ban', `Model escalated to permanent ban: ${sanitizedModelId} (totalFailures=${totalFailures})`, provider);
            console.log(`[BANDIT-CONSEQUENCE] permanent-ban | model=${modelId} provider=${provider} reason=escalation totalFailures=${totalFailures} scope=model`);
          logPunishment({ bandit: this, type: EVENT_TYPES.BAN_MODEL, provider, modelId: sanitizedModelId, reason: 'escalation', cooldownMs: 0, failures: totalFailures });
          }
        }
        
        this.db.prepare(
          "UPDATE request_logs SET ended_at = ?, status_code = ?, error_message = ?, model = ?, provider = ? WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1"
        ).run(Date.now(), statusCode, errorMessage, sanitizedModelId, provider);
        if (source === 'training') {
          this._recordTrainingFeedback(sanitizedModelId, false, reward);
          console.log(`[BANDIT-TRAIN] Recorded training feedback for model=${modelId} success=false reward=${reward} source=training`);
        }
      }
      const result = { success, reward, errorDetails };
      return result;
      });
      const result = tx();
      console.timeEnd(`recordFeedback-${modelId}`);
      return result;
    } catch (err) {
      console.error(`[BANDIT-RECORD-FEEDBACK] ERROR for model=${modelId}:`, err?.message || err);
      console.error(`[BANDIT-RECORD-FEEDBACK] Stack:`, err?.stack || String(err));
      // Never let DB errors crash the server - just log and continue
      return { success, reward, errorDetails, dbError: err?.message };
    }
  }

  _classifyError(errorDetails, provider) {
    const status = errorDetails.status || 0;
    const message = errorDetails.message || "";
    console.log(`[BANDIT-CLASSIFY] status=${status} message=${message.substring(0, 120)} provider=${provider || "unknown"}`);
    const reason = errorDetails.reason || "unknown";
    const is429 = status === 429;
    const resolvedProvider = provider || errorDetails.provider || (errorDetails.modelId ? errorDetails.modelId.split('/')[0] : '');
    
    // DIAGNOSTIC: log full error details for debugging
    console.log(`[BANDIT-CLASSIFY-DIAG] errorDetails=${JSON.stringify(errorDetails).substring(0, 500)}`);

    // Load config-driven error classification
    const config = this.getBanditConfig();
    const errorConfig = config.errorConfig || { degradationThreshold: 3, rehabilitationPeriodMs: 3600000, classification: { transientErrors: [], permanentErrors: [] } };
    const transientPatterns = errorConfig.classification?.transientErrors || [];
    const permanentPatterns = errorConfig.classification?.permanentErrors || [];

    // First, check config-driven transient error patterns
    for (const pattern of transientPatterns) {
      const regex = new RegExp(pattern.pattern, 'i');
      if (regex.test(message) || (pattern.status && pattern.status === status)) {
        console.log(`[BANDIT-CLASSIFY] Matched transient pattern: ${pattern.pattern} -> ${pattern.action}`);
        // Parse "reset after Xs/m/h" from message if present (for ITPM/TPM limits)
        let cooldownMs = pattern.duration || 30000;
        const resetMatch = message.match(/reset after (\d+)(s|m|h)/i);
        if (resetMatch) {
          const v = parseInt(resetMatch[1], 10);
          const u = resetMatch[2].toLowerCase();
          if (u === 's') cooldownMs = v * 1000;
          else if (u === 'm') cooldownMs = v * 60 * 1000;
          else if (u === 'h') cooldownMs = v * 3600 * 1000;
        }
        return {
          action: pattern.action || "cooldown-model",
          scope: pattern.scope || "model",
          reason: pattern.reason || "transient-error",
          cooldownMs,
          category: "TRANSIENT"
        };
      }
    }

    // Then, check config-driven permanent error patterns
    for (const pattern of permanentPatterns) {
      const regex = new RegExp(pattern.pattern, 'i');
      if (regex.test(message) || (pattern.status && pattern.status === status)) {
        console.log(`[BANDIT-CLASSIFY] Matched permanent pattern: ${pattern.pattern} -> ${pattern.action}`);
        return {
          action: pattern.action || "ban-model",
          scope: pattern.scope || "model",
          reason: pattern.reason || "permanent-error",
          category: "PERMANENT"
        };
      }
    }

    // Hardcoded fallback classifications (kept for backward compatibility)
    // Tool-calling requirement failure -> ban-model
    if (/no-tool-call-but-required/i.test(message)) {
      return { action: "ban-model", scope: "model", reason: "no-tool-call-but-required", category: "PERMANENT" };
    }

    // Status 502 misconfiguration / gateway errors -> cooldown-provider if provider-level, else flag-provider
    if (status === 502 && /No auth provided|Please log in|Playwright is not available|missing url or token|browserType\.launch|Executable doesn't exist|ENOENT/i.test(message)) {
      if (resolvedProvider === 'cfp' || resolvedProvider === 'zc') {
        return { action: "cooldown-provider", scope: "provider", reason: "provider-misconfigured", cooldownMs: 30 * 60 * 1000, category: "TRANSIENT" };
      }
      if (resolvedProvider) {
        return { action: "cooldown-provider", scope: "provider", reason: "provider-misconfigured", cooldownMs: 30 * 60 * 1000, category: "TRANSIENT" };
      }
      return { action: "flag-provider", reason: "provider-misconfigured", category: "TRANSIENT" };
    }

    // Sandbox, Missing Binary, and Environment Configuration Errors (including Playwright / Cloudflare Playground)
    if (/ENOENT|spawn\s+.*ENOENT|command not found|CLI not found|Executable doesn't exist|browserType\.launch|must be an absolute path|bridge sandbox|transport is not configured|Playwright is not available|Playwright.*Chromium|Cloudflare Playground needs Playwright/i.test(message)) {
      const isProviderLevel = resolvedProvider === 'zc' || resolvedProvider === 'cfp' || !!resolvedProvider || /CLI not found|command not found|bridge sandbox|transport is not configured|spawn\s+/i.test(message);
      if (isProviderLevel) {
        if (resolvedProvider === 'cfp') {
          return { action: "cooldown-provider", scope: "provider", reason: "provider-misconfigured", cooldownMs: 30 * 60 * 1000, category: "TRANSIENT" };
        }
        return { action: "cooldown-provider", scope: "provider", reason: "provider-misconfigured", cooldownMs: 30 * 60 * 1000, category: "TRANSIENT" };
      } else {
        return { action: "ban-model", scope: "model", reason: "environment-error", category: "PERMANENT" };
      }
    }

    // Image generation mismatch / chat incompatibility on 400 -> ban-model
    if (status === 400 && /image generation model|cannot be used for chat|not a chat model|image-only|incompatible/i.test(message)) {
      return { action: "ban-model", scope: "model", reason: "model-incompatible", category: "PERMANENT" };
    }

    // 400 unsupported_image_block / devin_agentic_error -> model-incompatible
    if (status === 400 && (/unsupported_image_block/i.test(message) || /devin_agentic_error/i.test(message) || (errorDetails.code && /unsupported_image_block/i.test(errorDetails.code)))) {
      return { action: "ban-model", scope: "model", reason: "model-incompatible", category: "PERMANENT" };
    }

    // 400 model non utilizzabile
    if (status === 400 && /not supported/i.test(message)) {
      if (/image.?block|vision|visual.?input|picture.?format|base64.?image|image.?unsupported/i.test(message)) {
        return { action: "ban-model", scope: "model", reason: "model-incompatible", category: "PERMANENT" };
      }
      if (/not supported|unknown provider for model|model_not_found/i.test(message)) {
        return { action: "ban-model", scope: "model", reason: "model-not-supported", category: "PERMANENT" };
      }
    }

    // Catalog mismatch / unknown model / 404 / 400 model not found
    if ((/catalog mismatch|unknown model|model_not_found|does not exist|not found|no longer available|not available|invalid model|not available in active live catalog/i.test(message) || status === 404) || (status === 400 && !/unsupported_image_block|devin_agentic_error|image.?block/i.test(message + " " + (errorDetails.code || "")))) {
      return { action: "ban-model", scope: "model", reason: "model-not-found", category: "PERMANENT" };
    }
    // Upstream bug (Assignment to constant) -> ban-model
    if (/Assignment to constant variable/i.test(message)) {
      return { action: "ban-model", scope: "model", reason: "upstream-bug", category: "PERMANENT" };
    }
    // 410 model shutdown (end of life) -> ban-model
    if (status === 410 && /model_shutdown|model is gone|end of life|no longer available|model_shutdown/i.test(message + " " + (errorDetails.code || ""))) {
      return { action: "ban-model", scope: "model", reason: "model-shutdown", category: "PERMANENT" };
    }
    // NEW: OpenCode's free tier can only be used from within OpenCode -> ban-model with permission-denied
    if (/OpenCode's free tier can only be used from within OpenCode/i.test(message)) {
      return { action: "ban-model", scope: "model", reason: "permission-denied", category: "PERMANENT" };
    }
    // NEW: No active credentials for provider (401) -> flag-provider with reason auth-expired and 24h cooldown
    if (status === 401 && /No active credentials|authentication expired/i.test(message)) {
      return { action: "flag-provider", reason: "auth-expired", cooldownMs: 24 * 3600 * 1000, category: "TRANSIENT" };
    }
    // NEW: authentication expired (401) -> flag-provider with reason auth-expired
    if (status === 401 && /authentication expired/i.test(message)) {
      return { action: "flag-provider", reason: "auth-expired", category: "TRANSIENT" };
    }
    // 413 / TPM / ITPM / tokens per minute / Request too large / context length / token limit -> cooldown-model
    if (status === 413 || /413|ITPM|tokens?\s*per\s*minute|TPM|Request too large|Requested \d+.*Limit \d+|Limit \d+.*Requested \d+|context\s*(?:window|length|exceeded)|token\s*limit|payload\s*too\s*large/i.test(message)) {
      const m = message.match(/reset after (\d+)(s|m|h)/i);
      let cooldownMs = status === 413 ? 300000 : 30000;
      if (m) {
        const v = parseInt(m[1], 10);
        const u = m[2].toLowerCase();
        if (u === 's') cooldownMs = v * 1000;
        else if (u === 'm') cooldownMs = v * 60 * 1000;
        else if (u === 'h') cooldownMs = v * 3600 * 1000;
      }
      return { action: "cooldown-model", scope: "model", reason: "tpm-exceeded", cooldownMs, category: "TRANSIENT" };
    }
    // No auth provided -> flag-provider
    if (status === 502 && /No auth provided|Please log in/i.test(message)) {
      return { action: "flag-provider", reason: "provider-misconfigured", category: "TRANSIENT" };
    }
    // Playwright / Cloudflare Playground / 502 / 503 errors -> cooldown-provider
    if ((status === 502 || status === 503) && /Playwright is not available|Playwright.*Chromium|Cloudflare Playground needs Playwright/i.test(message)) {
      return { action: "cooldown-provider", scope: "provider", reason: "provider-misconfigured", cooldownMs: 30 * 60 * 1000, category: "TRANSIENT" };
    }
    // CLI / binario mancante o non configurato -> flag-provider
    if (status === 502 && /is not configured|missing url or token/i.test(message)) {
      return { action: "flag-provider", reason: "provider-misconfigured", category: "TRANSIENT" };
    }
    // 403 banned -> ban-provider
    if (status === 403 && /account disabled|banned/i.test(message)) {
      return { action: "ban-provider", scope: "provider", reason: "provider-banned", category: "PERMANENT" };
    }
    // Non-Resetting Key/Quota Limits
    if (status === 403 || /Key limit exceeded|total limit|hard limit|lifetime limit/i.test(message)) {
      const isNonResetting = /does not reset|never resets|no reset|lifetime|permanent/i.test(message);
      let cooldownMs = this._parseResetAfter(message, errorDetails);
      if (isNonResetting) {
        return { action: "cooldown-provider", scope: "provider", reason: "quota-exhausted", cooldownMs: 2 * 3600 * 1000, category: "TRANSIENT" };
      } else if (!cooldownMs || cooldownMs <= 0) {
        return { action: "cooldown-provider", reason: "key-limit-exceeded", cooldownMs: 2 * 3600 * 1000, category: "TRANSIENT" };
      } else {
        return { action: "cooldown-provider", reason: "key-limit-exceeded", cooldownMs, category: "TRANSIENT" };
      }
    }

    // 429 with model_cooldown code or cooling down -> cooldown-model
    if ((is429 && errorDetails.code === "model_cooldown") || /cooling down|model_cooldown/i.test(message)) {
      let cooldownMs = this._parseResetAfter(message, errorDetails);
      if (!cooldownMs || cooldownMs <= 0) {
        const retryAfter = errorDetails.retryAfter || errorDetails.retry_after || errorDetails.reset_seconds || 0;
        cooldownMs = retryAfter > 0 ? retryAfter * 1000 : 30000;
      }
      return { action: "cooldown-model", scope: "model", reason: "rate-limit", cooldownMs, category: "TRANSIENT" };
    }

    // Check for permanent ban indicators
    if (/account\s+(?:has\s+been\s+)?(?:disabled|suspended|banned|terminated|closed|deactivated)|organization\s+(?:has\s+been\s+)?(?:disabled|suspended|banned|deleted|deactivated)|project\s+(?:has\s+been\s+)?(?:deleted|disabled|suspended)|workspace\s+(?:has\s+been\s+)?(?:disabled|suspended|deleted)|policy\s+violation|\b(account\s+suspended|provider\s+banned|banned|suspended)\b/i.test(message)) {
      return { action: "ban-provider", scope: "provider", reason: "provider-banned", category: "PERMANENT" };
    }

    // 429 quota exhausted / rate limit -> cooldown-model
    if (is429 || /rate\s*limit|too\s+many\s+requests|throttled|quota\s*exceeded|exhausted/i.test(message)) {
      let cooldownMs = this._parseResetAfter(message, errorDetails);
      if (!cooldownMs || cooldownMs <= 0) {
        const retryAfter = errorDetails.retryAfter || errorDetails.retry_after || 0;
        cooldownMs = retryAfter > 0 ? retryAfter * 1000 : 30 * 60 * 1000;
      }

      const modelId = this._sanitizeModelId(errorDetails.modelId) || "";
      const model = this.db.prepare("SELECT fails FROM models WHERE id = ?").get(modelId);
      const repeated429 = model && model.fails >= 2;

      if (repeated429) {
        const cooldownMultiplier = 2;
        return {
          action: "cooldown-model",
          reason: "quota-exhausted",
          cooldownMs: cooldownMs * cooldownMultiplier,
          category: "TRANSIENT"
        };
      } else {
        return {
          action: "cooldown-model",
          reason: "rate-limit",
          cooldownMs: 300000,
          category: "TRANSIENT"
        };
      }
    }

    // RATE_LIMIT_QUEUE_TIMEOUT / 503 queue timeout -> cooldown-model queue-timeout
    if (errorDetails.code === "RATE_LIMIT_QUEUE_TIMEOUT" || /RATE_LIMIT_QUEUE_TIMEOUT|503 queue timeout|queue timeout/i.test(message) || (status === 503 && /queue.*timeout|timeout.*queue/i.test(message))) {
      let cooldownMs = this._parseResetAfter(message, errorDetails);
      if (!cooldownMs || cooldownMs <= 0) {
        cooldownMs = 45000;
      }
      return { action: "cooldown-model", scope: "model", reason: "queue-timeout", cooldownMs, category: "TRANSIENT" };
    }

    // High demand / service unavailable messages -> cooldown-model high-demand
    if (/currently experiencing high demand|service_unavailable|service unavailable|high demand/i.test(message) || errorDetails.code === "service_unavailable") {
      let cooldownMs = this._parseResetAfter(message, errorDetails);
      if (!cooldownMs || cooldownMs <= 0) {
        cooldownMs = 30000;
      }
      return { action: "cooldown-model", scope: "model", reason: "high-demand", cooldownMs, category: "TRANSIENT" };
    }

    // Timeout -> cooldown-model 10m
    if (/fetch timeout|timeout/i.test(message)) {
      return { action: "cooldown-model", scope: "model", reason: "timeout", cooldownMs: 10 * 60 * 1000, category: "TRANSIENT" };
    }

    // 5xx / Stream Errors / Keepalive -> cooldown-model (transient, exponential backoff)
    if (status >= 500 && status < 600 || /keepalive|chunk|stream|connection/i.test(message)) {
      const modelId = this._sanitizeModelId(errorDetails.modelId) || "";
      const model = this.db.prepare("SELECT fails FROM models WHERE id = ?").get(modelId);
      const fails = model ? model.fails : 0;
      // Exponential backoff: base 15s, multiplier 2^fails (capped at 5 mins)
      const cooldownMs = Math.min(15000 * Math.pow(2, fails), 300000);
      return { action: "cooldown-model", scope: "model", reason: "server-error", cooldownMs, category: "TRANSIENT" };
    }

    // 402 insufficient funds / billing error -> flag-provider
    if (status === 402 && (/insufficient|funds|credit|payment/i.test(message) || /billing_error|payment_required|credits exhausted/i.test(message + " " + (errorDetails.code || "")))) {
      return { action: "flag-provider", reason: "quota-exhausted", category: "TRANSIENT" };
    }

    // 418 anti-abuse -> cooldown-provider
    if (status === 418 && /anti-abuse/i.test(message)) {
      return { action: "cooldown-provider", reason: "provider-blocked", cooldownMs: 1 * 3600 * 1000, category: "TRANSIENT" };
    }

    // Default case
    const defaultReason = reason === "unknown" ? "classification-fallback" : reason;
    console.log(`[BANDIT-CLASSIFY-RESULT] action=cooldown-model reason=${defaultReason} cooldownMs=30000`);
    return {
      action: "cooldown-model",
      reason: defaultReason,
      cooldownMs: 30000,
      category: "TRANSIENT"
    };
  }

  /**
   * Determines if an error constitutes a "critical failure" for aggressive 3-strike punishment.
   * Critical failures are severe errors that indicate fundamental issues with the model/provider,
   * not transient network issues.
   *
   * Critical failures include:
   * - 403 Forbidden (especially "banned", "account disabled", "key limit exceeded" with no reset)
   * - 429 Rate Limit (repeated rate limiting indicates abuse/premium usage issues)
   * - Timeout errors (persistent timeouts indicate fundamental availability issues)
   * - safeWrite errors (OpenCode-specific critical errors)
   * - Other severe errors that suggest permanent issues
   *
   * @param {number} statusCode - HTTP status code
   * @param {string} errorMessage - Error message
   * @param {object} errorDetails - Full error details object
   * @returns {boolean} - True if this is a critical failure
   */
  _isCriticalFailure(statusCode, errorMessage, errorDetails = {}) {
    const message = errorMessage || errorDetails?.message || "";
    const status = statusCode || errorDetails?.status || 0;
    
    // 403 Forbidden - key indicators of critical failures
    if (status === 403) {
      // Account disabled, banned, suspended - permanent issues
      if (/account disabled|banned|suspended|terminated|deactivated|policy violation/i.test(message)) {
        return true;
      }
      // Key limit exceeded / hard limit - non-resetting quota issues
      if (/Key limit exceeded|total limit|hard limit|lifetime limit|does not reset|never resets/i.test(message)) {
        return true;
      }
      // Permission denied for specific features
      if (/OpenCode's free tier can only be used from within OpenCode/i.test(message)) {
        return true;
      }
    }
    
    // 429 Rate Limit - repeated rate limiting is critical
    if (status === 429) {
      // model_cooldown code indicates repeated rate limiting on specific model
      if (errorDetails?.code === "model_cooldown" || /model_cooldown/i.test(message)) {
        return true;
      }
      // cooling down pattern suggests aggressive rate limiting
      if (/cooling down/i.test(message)) {
        return true;
      }
      // If this is a repeated 429 (fails >= 2), it's critical
      const sanitizedId = this._sanitizeModelId(errorDetails?.modelId || "");
      if (sanitizedId) {
        const model = this.db.prepare("SELECT fails FROM models WHERE id = ?").get(sanitizedId);
        if (model && model.fails >= 2) {
          return true;
        }
      }
    }
    
    // safeWrite errors (OpenCode-specific)
    if (/safeWrite|cannot access safeWrite|safeWrite before initialization|safeWrite is not initialized/i.test(message)) {
      return true;
    }
    
    // SSE errors (stream errors indicate persistent issues with the model provider)
    if (/SSE contains error|SSE chunk error|stream error/i.test(message)) {
      return true;
    }
    
    // Environment errors that are model-specific (not provider-level)
    if (/ENOENT|spawn\s+.*ENOENT|command not found|CLI not found|bridge sandbox|transport is not configured|Executable doesn't exist/i.test(message)) {
      // These are provider-level in most cases, but if they appear model-specific, count as critical
      const resolvedProvider = errorDetails?.provider || (errorDetails?.modelId?.split('/')[0] || '');
      if (resolvedProvider && !['zc', 'cfp', 'openai', 'anthropic', 'google'].includes(resolvedProvider.toLowerCase())) {
        return true;
      }
    }
    
    // 402 Payment/Funding issues - non-resetting
    if (status === 402) {
      if (/insufficient|funds|credit|payment|billing_error|credits exhausted/i.test(message)) {
        return true;
      }
    }
    
    return false;
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

  _resetProviderCooldown(provider) {
    this.db.prepare(
      `UPDATE provider_history SET cooldown_until = 0, circuit_breaker_until = 0, consecutive_failures = 0, needs_attention = 0, attention_reason = '', attention_message = '' WHERE provider = ?`
    ).run(provider);
  }

  _updateConsecutiveProviderFailures(provider, count) {
    const now = Date.now();
    this.db.prepare(
      `UPDATE provider_history SET consecutive_failures = ?, circuit_breaker_until = ? WHERE provider = ?`
    ).run(count, now + count * 60000, provider);
  }

  _resetConsecutiveProviderFailures(provider) {
    this.db.prepare(
      `UPDATE provider_history SET consecutive_failures = 0, circuit_breaker_until = 0 WHERE provider = ?`
    ).run(provider);
  }

  // Circuit breaker: open after N consecutive failures, half-open after cooldown
  getCircuitBreakerStatus(provider) {
    const now = Date.now();
    const prov = this.db.prepare(
      `SELECT consecutive_failures, circuit_breaker_until, last_success_time, cooldown_until, permanent, needs_attention FROM provider_history WHERE provider = ?`
    ).get(provider);
    if (!prov) {
      return { open: false, state: "closed", consecutiveFailures: 0, circuitBreakerUntil: 0, cooldownUntil: 0, lastSuccessTime: 0 };
    }
    const circuitOpen = prov.circuit_breaker_until && prov.circuit_breaker_until > now;
    const halfOpen = !circuitOpen && prov.circuit_breaker_until && prov.circuit_breaker_until <= now;
    const state = circuitOpen ? "open" : (halfOpen ? "half_open" : "closed");
    return {
      open: circuitOpen,
      state,
      consecutiveFailures: prov.consecutive_failures || 0,
      circuitBreakerUntil: prov.circuit_breaker_until || 0,
      cooldownUntil: prov.cooldown_until || 0,
      lastSuccessTime: prov.last_success_time || 0,
      permanent: prov.permanent === 1,
      needsAttention: prov.needs_attention === 1
    };
  }

  _recordProviderFailureForCircuitBreaker(provider, isHardError = false) {
    const now = Date.now();
    const prov = this.db.prepare(
      `SELECT consecutive_failures, circuit_breaker_until, last_success_time FROM provider_history WHERE provider = ?`
    ).get(provider);
    const prevFailures = prov?.consecutive_failures || 0;
    const prevCircuitUntil = prov?.circuit_breaker_until || 0;
    const lastSuccess = prov?.last_success_time || 0;
    const isCircuitOpen = prevCircuitUntil > now;
    const shouldReset = lastSuccess > 0 && (now - lastSuccess) > 30 * 60 * 1000;

    // Only increment consecutive_failures for hard errors (auth/403/404/permanent),
    // not transient errors (timeouts, 429s)
    let newFailures = isHardError ? prevFailures + 1 : prevFailures;
    let circuitOpen = isCircuitOpen;
    let circuitBreakerUntil = prevCircuitUntil;

    if (!isCircuitOpen && !shouldReset && isHardError) {
      const threshold = Number(process.env.CIRCUIT_BREAKER_THRESHOLD || "3");
      if (newFailures >= threshold) {
        circuitOpen = true;
        circuitBreakerUntil = now + 5 * 60 * 1000;
        console.log(`[BANDIT] Circuit breaker OPENED for provider ${provider} after ${newFailures} consecutive failures`);
      }
    }

    this.db.prepare(
      `UPDATE provider_history SET consecutive_failures = ?, circuit_breaker_until = ?, last_success_time = ? WHERE provider = ?`
    ).run(newFailures, circuitBreakerUntil, now, provider);

    return { open: circuitOpen, consecutiveFailures: newFailures, circuitBreakerUntil };
  }

  _recordProviderSuccessForCircuitBreaker(provider) {
    const now = Date.now();
    this.db.prepare(
      `UPDATE provider_history SET consecutive_failures = 0, circuit_breaker_until = 0, last_success_time = ? WHERE provider = ?`
    ).run(now, provider);
  }

  _triggerFallback(modelId) {
    const fallbackModels = this.getFallbackModels();
    if (fallbackModels.length > 0) {
      console.log(`[BANDIT] Triggering fallback for model ${modelId}`);
      return fallbackModels[0];
    }
    return null;
  }

  scoreFallbackModel(modelId, estimatedTokens = 0, requireTools = false, profile = null) {
    // Scores fallback models using UCB1-style scoring with provider health and catalog data
    // Returns { modelId, score, reasons, available }
    const DEBUG = String(process.env.DEBUG || "false").toLowerCase() === "true";
    
    // Get model from catalog
    const catalogModel = this.db.prepare(
      `SELECT c.id, c.provider, c.max_input_tokens, c.supports_tools, c.supports_image_generation, c.capability, c.supports_chat, c.supports_audio_generation, c.is_free, ph.fails, ph.cooldown_until, ph.permanent, ph.needs_attention, ph.attention_reason, ph.attention_message
       FROM catalog c
       LEFT JOIN provider_history ph ON c.provider = ph.provider
       WHERE c.id = ?`
    ).get(modelId);
    
    if (!catalogModel) {
      if (DEBUG) console.log(`[BANDIT][FALLBACK] Model ${modelId} not found in catalog`);
      return { modelId, score: -Infinity, reasons: ['not_in_catalog'], available: false };
    }
    
    // Check token limit
    if (estimatedTokens > catalogModel.max_input_tokens) {
      if (DEBUG) console.log(`[BANDIT][FALLBACK] Model ${modelId} token limit exceeded: ${estimatedTokens} > ${catalogModel.max_input_tokens}`);
      return { modelId, score: -Infinity, reasons: ['token_limit_exceeded'], available: false };
    }
    
    // Check tool requirement
    if (requireTools && !catalogModel.supports_tools) {
      if (DEBUG) console.log(`[BANDIT][FALLBACK] Model ${modelId} doesn't support tools`);
      return { modelId, score: -Infinity, reasons: ['tools_not_supported'], available: false };
    }
    
    // Check provider status
    const reasons = [];
    let score = 0;
    
    // Base score from catalog data
    score += catalogModel.is_free ? 10 : 0; // Free models get bonus
    
    // Provider health factors
    if (catalogModel.permanent === 1) {
      reasons.push('provider_permanently_banned');
      score -= 1000;
    }
    
    if (catalogModel.cooldown_until > Date.now()) {
      const cooldownRemaining = Math.ceil((catalogModel.cooldown_until - Date.now()) / 1000 / 60);
      reasons.push(`provider_cooldown_${cooldownRemaining}min`);
      score -= 500;
    }
    
    if (catalogModel.needs_attention === 1) {
      reasons.push('provider_needs_attention');
      score -= 200;
    }
    
    // Calculate UCB1-style score for fallback
    const N = 0; // Fallback models have no history
    const sum_reward = 0;
    const avgReward = N > 0 ? sum_reward / N : 1.0;
    const totalObservations = 1; // Single observation for fallback
    
    // Quality-to-Speed ratio calculation
    const avgLatency = 250; // Default fallback latency
    const baselineLatency = 500;
    const latencyFactor = baselineLatency / Math.max(avgLatency, 100);
    const qualitySpeedScore = avgReward * latencyFactor;
    
    // UCB1 exploration bonus for untested models
    const explorationBonus = 0.5 * Math.sqrt(Math.log(totalObservations + 1) / 1);
    const ucbScore = 2.0 * qualitySpeedScore + 0.8 * explorationBonus;
    
    // Apply soft bias multiplier from profile if specified
    const mult = profileMultiplier(profile, modelId);
    const finalScore = (ucbScore * mult) + (Math.random() * 0.0001);
    
    score += finalScore;
    
    // Add provider-specific factors
    if (catalogModel.fails > 0) {
      reasons.push(`provider_has_${catalogModel.fails}_failures`);
      score -= catalogModel.fails * 50;
    }
    
    if (DEBUG) {
      console.log(`[BANDIT][FALLBACK] Model ${modelId} score: ${score.toFixed(4)}, reasons: ${reasons.join(', ')}`);
    }
    
    return {
      modelId,
      score,
      reasons,
      available: true,
      provider: catalogModel.provider,
      max_input_tokens: catalogModel.max_input_tokens,
      supports_tools: catalogModel.supports_tools,
      is_free: catalogModel.is_free
    };
  }

  selectBestFallbackModel(estimatedTokens = 0, requireTools = false, profile = null, excludeSet = new Set()) {
    // Selects the best fallback model based on scoring
    // Returns modelId or null
    const DEBUG = String(process.env.DEBUG || "false").toLowerCase() === "true";
    
    const fallbackModels = this.getFallbackModels();
    if (fallbackModels.length === 0) {
      if (DEBUG) console.log(`[BANDIT][FALLBACK] No fallback models configured`);
      return null;
    }
    
    const scoredModels = [];
    
    for (const modelId of fallbackModels) {
      if (excludeSet.has(modelId)) {
        if (DEBUG) console.log(`[BANDIT][FALLBACK] Skipping excluded model: ${modelId}`);
        continue;
      }
      
      const scoreResult = this.scoreFallbackModel(modelId, estimatedTokens, requireTools, profile);
      if (scoreResult.available) {
        scoredModels.push(scoreResult);
      }
    }
    
    if (scoredModels.length === 0) {
      if (DEBUG) console.log(`[BANDIT][FALLBACK] No available fallback models after scoring`);
      return null;
    }
    
    // Sort by score (descending)
    scoredModels.sort((a, b) => b.score - a.score);
    
    const best = scoredModels[0];
    if (DEBUG) {
      console.log(`[BANDIT][FALLBACK] Selected best fallback model: ${best.modelId} (score: ${best.score.toFixed(4)})`);
      if (best.reasons.length > 0) {
        console.log(`[BANDIT][FALLBACK] Selection reasons: ${best.reasons.join(', ')}`);
      }
    }
    
    return best.modelId;
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
    // Reset all operational and training metrics for the model
    this.db.prepare(`
      UPDATE models SET
        N = 0,
        sum_reward = 0,
        fails = 0,
        total_failures = 0,
        cooldown_until = 0,
        permanent = 0,
        last_used_index = 0,
        consecutive_5xx = 0,
        consecutive_critical_failures = 0,
        degraded = 0,
        degraded_since = 0,
        banned_since = 0
      WHERE id = ?
    `).run(modelId);
    
    // Reset corresponding training daemon entry if exists
    this.db.prepare(`
      UPDATE models_train SET
        N = 0,
        sum_reward = 0,
        last_used_index = 0,
        isTraining = 0,
        executionTime = 0,
        calledModels = 0,
        okStatus = 0,
        errorStatus = 0,
        statusMessage = 'Reset',
        updated_at = 0
      WHERE id = ?
    `).run(modelId);
  }

  resetProvider(provider) {
    // Reset all provider history metrics
    this.db.prepare(`
      UPDATE provider_history SET
        fails = 0,
        cooldown_until = 0,
        permanent = 0,
        needs_attention = 0,
        pointer = 0,
        consecutive_failures = 0,
        circuit_breaker_until = 0,
        last_success_time = 0,
        attention_reason = '',
        attention_message = '',
        total_failures = 0
      WHERE provider = ?
    `).run(provider);
  }

  resetProviderCooldown(provider) {
    this.db.prepare(
      `UPDATE provider_history SET cooldown_until = 0 WHERE provider = ?`
    ).run(provider);
  }

  resetProviderHistoryAll() {
    // Reset all provider history to clear cooldowns, bans, attention flags
    this.db.prepare(`
      UPDATE provider_history SET
        fails = 0,
        cooldown_until = 0,
        permanent = 0,
        needs_attention = 0,
        pointer = 0,
        consecutive_failures = 0,
        circuit_breaker_until = 0,
        last_success_time = 0,
        attention_reason = '',
        attention_message = '',
        total_failures = 0
    `).run();
  }

  resetPunishmentEvents() {
    // Clear all punishment events history
    this.db.prepare("DELETE FROM punishment_events").run();
  }

  resetGlobalCounters() {
    this.db.prepare("UPDATE meta SET value = 0 WHERE key = 'totalRequests'").run();
    this.db.prepare("UPDATE meta SET value = 0 WHERE key = 'totalObservations'").run();
    // Clear request_logs history so metrics reflect only current session
    this.db.prepare("DELETE FROM request_logs").run();
    // NOTE: Does NOT reset models or provider_history - use /v1/reset/model and /v1/reset/provider for that
  }

  blockModel(modelId) {
    this.db.prepare(
      `UPDATE models SET permanent = 1, banned_since = ? WHERE id = ?`
    ).run(Date.now(), modelId);
  }

  unblockModel(modelId) {
    this.db.prepare(
      `UPDATE models SET permanent = 0, banned_since = 0, degraded = 0, degraded_since = 0, consecutive_5xx = 0, cooldown_until = 0 WHERE id = ?`
    ).run(modelId);
  }

  _checkRehabilitation() {
    const config = this.getBanditConfig();
    const period = config.errorConfig?.rehabilitationPeriodMs || 172800000; // 48 hours default
    const now = Date.now();

    // Reset degraded models (after 48h)
    this.db.prepare(
      `UPDATE models SET degraded = 0, degraded_since = 0, consecutive_5xx = 0 WHERE degraded = 1 AND (? - degraded_since) > ?`
    ).run(now, period);

    // NOTE: Permanent bans are NOT auto-rehabilitated
    // They require manual intervention via admin API or database
    // This prevents problematic models from quietly returning to rotation
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
        models = (this.db.prepare(
          `SELECT id, provider, N, sum_reward, fails, degraded, cooldown_until, permanent
           FROM models`
        ).all() || []).map(m => ({ ...m, id: this._sanitizeModelId(m.id) }));
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
      // Return sanitized topModel for summary if using string topModel
      if (stats.topModel && typeof stats.topModel === 'string') {
        summary.topModel = { id: this._sanitizeModelId(stats.topModel) };
      }
      return { models, providers, summary };
    } catch (e) {
      console.error("[BANDIT] Critical error in getMetrics:", e.message);
      return { models: [], providers: [], summary: { activeCount: 0, avgReward: 0, avgLatencySec: 0, freeActive: 0, topModel: null } };
    }
  }

  getAllModels() {
    try {
      return this.db.prepare(
        `SELECT id, provider, N, sum_reward, fails, degraded, cooldown_until, permanent, consecutive_5xx, dynamic_max_tokens
         FROM models`
      ).all() || [];
    } catch (e) {
      console.warn("[BANDIT] getAllModels error:", e.message);
      return [];
    }
  }

  getAllProviders() {
    try {
      return this.db.prepare(
        `SELECT provider, fails, cooldown_until, permanent, needs_attention, consecutive_failures, circuit_breaker_until, quota_resets_at
         FROM provider_history`
      ).all() || [];
    } catch (e) {
      console.warn("[BANDIT] getAllProviders error:", e.message);
      return [];
    }
  }

  getDashboardStats() {
    try {
      const totalRequests = this._getMeta("totalRequests") || 0;
      if (typeof DEBUG !== 'undefined' && DEBUG) console.log(`[DEBUG DashboardStats Validation] totalRequests from meta: ${totalRequests}`);
      // Note: totalObservations (from meta) is used by the bandit algorithm for UCB1 calculations.
      // For dashboard display, we use totalObservationsFromLogs which comes from request_logs table
      // and represents the actual count of completed requests.
      // The meta table totalObservations tracks cumulative successful observations in the bandit.

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
      // Count from catalog instead of requiring model to be in models table
      // Models not yet used won't be in models table, so we need to count from catalog
      let freeActive = { count: 0 };
      try {
        freeActive = this.db.prepare(`
          SELECT COUNT(*) as count
          FROM catalog c
          LEFT JOIN models m ON m.id = c.id
          LEFT JOIN provider_history ph ON c.provider = ph.provider
          WHERE c.is_free = 1
            AND (m.cooldown_until IS NULL OR m.cooldown_until <= ?)
            AND (m.permanent IS NULL OR m.permanent = 0)
            AND (m.degraded IS NULL OR m.degraded = 0)
            AND (ph.cooldown_until IS NULL OR ph.cooldown_until <= ? OR ph.cooldown_until = 0)
            AND (ph.permanent IS NULL OR ph.permanent = 0)
            AND (ph.needs_attention IS NULL OR ph.needs_attention = 0)
        `).get(Date.now(), Date.now()) || { count: 0 };
      } catch (e) {
        console.warn("[BANDIT] getDashboardStats freeActive query error:", e.message);
      }

      let topModel = null;
      let topModelDetails = null;
      try {
        const topRes = this.db.prepare(`
          SELECT id, provider, N, cooldown_until, (sum_reward / NULLIF(N, 0)) as avg, (sum_reward / NULLIF(N, 0)) as score
          FROM models
          WHERE N >= 10
          ORDER BY avg DESC
          LIMIT 1
        `).get();
        if (topRes) {
          const sanitizedId = this._sanitizeModelId(topRes.id);
          topModel = sanitizedId;
          topModelDetails = {
            id: sanitizedId,
            name: sanitizedId,
            provider: topRes.provider,
            N: topRes.N,
            cooldown: topRes.cooldown_until || 0,
            avg: topRes.avg,
            score: topRes.score
          };
        }
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

      let modelsSummary = { total: 0, active: 0, cooldown: 0, banned: 0, degraded: 0, attention: 0 };
            try {
              modelsSummary = this.getModelsSummary("prod") || modelsSummary;
            } catch (e) {
              console.warn("[BANDIT] getDashboardStats getModelsSummary error:", e.message);
            }
            // Ensure totalModels uses modelsSummary.total for consistent counting from catalog
            // This fixes the discrepancy where totalModels counted only initialized models (from models table)
            // while other counts used catalog LEFT JOIN (all catalog entries)
            const totalModels = { count: modelsSummary.total || 0 };

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
      let successRateStats = { modelsWithObservations: 0, modelsAboveThreshold: 0, successfulObservations: 0, totalObservations: 0 };
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
      // Count successful observations from request_logs and total observations
      try {
        const successRes = this.db.prepare(
          `SELECT
            SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END) as successfulObservations,
            COUNT(*) as totalObservations
          FROM request_logs WHERE ended_at IS NOT NULL AND started_at IS NOT NULL`
        ).get();
        if (successRes) {
          successRateStats.successfulObservations = successRes.successfulObservations;
          successRateStats.totalObservations = successRes.totalObservations;
        } else {
          successRateStats.successfulObservations = 0;
          successRateStats.totalObservations = 0;
        }
      } catch (e) {
        console.warn("[BANDIT] getDashboardStats successfulObservations error:", e.message);
      }

      return {
        totalRequests,
        totalObservations: successRateStats.totalObservations || 0,
        avgReward: (stats && stats.avgReward !== null) ? stats.avgReward : 0,
        avgLatencySec: (latency.avgLatency || 0) / 1000,
        freeActive: freeActive.count || 0,
        topModel,
        topModelDetails,
        catalogTotal: catalogCounts.total || 0,
        catalogRawCount: this._getMeta("catalogRawCount") || 0,
        catalogFree: catalogCounts.free || 0,
        catalogProviders,
        totalModels: totalModels.count || 0,
        modelsActive: modelsSummary.active || 0,
        modelsCooldown: modelsSummary.cooldown || 0,
        modelsBanned: modelsSummary.banned || 0,
        modelsDegraded: modelsSummary.degraded || 0,
        modelsAttention: modelsSummary.attention || 0,
        providersActive,
        providersCooldown,
        providersBanned,
        providersAttention,
        totalProviders,
        modelsAboveThreshold: successRateStats.modelsAboveThreshold || 0,
        modelsWithObservations: successRateStats.modelsWithObservations || 0,
        successfulObservations: successRateStats.successfulObservations || 0,
        totalObservationsFromLogs: successRateStats.totalObservations || 0,
        successRate: (successRateStats.totalObservations && successRateStats.totalObservations > 0)
          ? ((successRateStats.successfulObservations || 0) / successRateStats.totalObservations * 100)
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

  isModelAvailable(modelId, estimatedTokens = 0, requireImageGeneration = false, bypassCooldown = false) {
    const now = Date.now();
    const sanitizedModelId = this._sanitizeModelId(modelId);
    // Optimization: Use a single query to fetch model and catalog data
    const model = this.db.prepare(
      `SELECT m.cooldown_until, m.permanent, m.degraded, m.provider,
              c.provider as cat_provider, c.max_input_tokens, c.supports_chat,
              c.supports_image_generation, c.supports_audio_generation, c.capability
       FROM models m
       LEFT JOIN catalog c ON m.id = c.id
       WHERE m.id = ?`
    ).get(sanitizedModelId);

    // Fallback if model not in models table, try just catalog
    const catModel = model || this.db.prepare(
      `SELECT provider, max_input_tokens, supports_chat, supports_image_generation, supports_audio_generation, capability FROM catalog WHERE id = ?`
    ).get(sanitizedModelId);

    console.log(`[DEBUG] isModelAvailable: modelId=${modelId}, sanitized=${sanitizedModelId}, found=${!!model}`);

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

    if (!bypassCooldown && model && model.cooldown_until !== undefined) { // Check if it's from models table
      if (model.permanent === 1 || model.degraded === 1) return false;
      if (model.cooldown_until && model.cooldown_until > now) return false;
    }

    if (provider) {
      const prov = this.db.prepare(
        `SELECT cooldown_until, permanent, needs_attention, quota_resets_at FROM provider_history WHERE provider = ?`
      ).get(provider);

      if (prov) {
        if (prov.permanent === 1) return false;
        if (!bypassCooldown && prov.cooldown_until && prov.cooldown_until > now) return false;
        if (prov.quota_resets_at && prov.quota_resets_at > now) return false;
        if (prov.needs_attention === 1) {
          // Auto-reset if cooldown expired OR cooldown is 0 (already cleared)
          if (prov.cooldown_until === 0 || prov.cooldown_until <= now) {
            this.db.prepare("UPDATE provider_history SET needs_attention = 0, attention_reason = NULL, attention_message = NULL WHERE provider = ?").run(provider);
          } else {
            return false;
          }
        }
      }

      if (!bypassCooldown && !this.quota.canCall(provider)) {
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
    // Improved token estimation using multiple heuristics:
    // 1. Character-based estimation with model-specific ratios
    // 2. Word-based estimation for English text (~1.3 tokens/word)
    // 3. Special handling for code, JSON, and structured content
    // 4. Image token estimation based on detail level
    if (!body || typeof body !== "object") return 0;

    let totalChars = 0;
    let wordCount = 0;
    let codeCharCount = 0;
    let jsonCharCount = 0;
    let imageCount = 0;
    let imageDetail = "auto"; // auto, low, high

    // Conta i messaggi
    const messages = body.messages || [];
    for (const msg of messages) {
      if (typeof msg.content === "string") {
        const content = msg.content;
        totalChars += content.length;
        wordCount += this._countWords(content);
        // Detect code blocks
        if (content.includes("```") || content.includes("`")) {
          codeCharCount += content.length * 0.3; // Estimate 30% is code
        }
      } else if (Array.isArray(msg.content)) {
        // Per i messaggi con contenuti multimodali
        for (const part of msg.content) {
          if (part.text) {
            totalChars += part.text.length;
            wordCount += this._countWords(part.text);
          }
          if (part.type === "image_url") {
            imageCount++;
            if (part.image_url && part.image_url.detail) {
              imageDetail = part.image_url.detail;
            }
          }
        }
      } else if (msg.content) {
        const str = JSON.stringify(msg.content);
        totalChars += str.length;
        jsonCharCount += str.length;
      }
      // Conta eventuali tool_calls nei messaggi assistente
      if (Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          const str = JSON.stringify(tc);
          totalChars += str.length;
          jsonCharCount += str.length;
        }
      }
    }

    // Includi prompt di sistema o system field separati se presenti
    if (body.system) {
      const str = typeof body.system === "string" ? body.system : JSON.stringify(body.system);
      totalChars += str.length;
      wordCount += this._countWords(str);
    }
    if (body.prompt) {
      const str = typeof body.prompt === "string" ? body.prompt : JSON.stringify(body.prompt);
      totalChars += str.length;
      wordCount += this._countWords(str);
    }

    // Includi tools / functions / tool_choice definiti nella richiesta
    if (body.tools && Array.isArray(body.tools)) {
      const str = JSON.stringify(body.tools);
      totalChars += str.length;
      jsonCharCount += str.length;
    }
    if (body.functions && Array.isArray(body.functions)) {
      const str = JSON.stringify(body.functions);
      totalChars += str.length;
      jsonCharCount += str.length;
    }
    if (body.tool_choice) {
      const str = JSON.stringify(body.tool_choice);
      totalChars += str.length;
      jsonCharCount += str.length;
    }

    // Improved estimation using weighted heuristics
    // Base: ~4 chars/token for general text
    // Code: ~3.5 chars/token (more tokens per char due to symbols)
    // JSON: ~2.5 chars/token (very token-dense)
    // Words: ~1.3 tokens/word for English
    
    const generalChars = totalChars - codeCharCount - jsonCharCount;
    let estimatedTokens = 0;
    
    // General text estimation (chars/token ratio varies by content type)
    estimatedTokens += Math.ceil(generalChars / 4);
    // Code estimation (more tokens per char)
    estimatedTokens += Math.ceil(codeCharCount / 3.5);
    // JSON/structured data estimation (very token-dense)
    estimatedTokens += Math.ceil(jsonCharCount / 2.5);
    
    // Cross-check with word-based estimation for English text
    const wordBasedEstimate = Math.ceil(wordCount * 1.3);
    // Use the higher of char-based and word-based for safety
    estimatedTokens = Math.max(estimatedTokens, wordBasedEstimate);
    
    // Image token estimation (OpenAI-style)
    // low detail: 85 tokens, high detail: 170-2550 tokens depending on size
    // We use a conservative estimate
    if (imageCount > 0) {
      let tokensPerImage = 85; // low detail default
      if (imageDetail === "high") tokensPerImage = 765; // high detail estimate
      else if (imageDetail === "auto") tokensPerImage = 255; // auto default
      estimatedTokens += imageCount * tokensPerImage;
    }
    
    // Add overhead for message formatting (role tokens, etc.)
    // ~3-4 tokens per message for role/structure
    estimatedTokens += messages.length * 4;
    
    // Add small buffer for safety (5%)
    estimatedTokens = Math.ceil(estimatedTokens * 1.05);
    
    return estimatedTokens;
  }

  _countWords(text) {
    if (!text || typeof text !== "string") return 0;
    // Count words separated by whitespace
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
  }

  maxCatalogInput() {
    const row = this.db.prepare("SELECT MAX(max_input_tokens) FROM catalog").get();
    return row ? row['MAX(max_input_tokens)'] : 0;
  }

  getProviderCount() {
    return this.db.prepare("SELECT COUNT(DISTINCT provider) FROM catalog").get()['COUNT(DISTINCT provider)'] || 0;
  }

  async selectModel(excluded = new Set(), estimatedTokens = 0, requireTools = false, requireImageGeneration = false, requireVision = false, profile = null, cooledDownThisRequest = new Set()) {
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
      SELECT c.id, c.provider, 0 AS N, 0 AS sum_reward, 0 AS fails, 0 AS degraded, 0 AS cooldown_until, 0 AS permanent, c.max_input_tokens, c.supports_tools, c.supports_image_generation, c.supports_vision, c.capability, c.supports_chat, c.supports_audio_generation, c.is_free, 0 AS is_paid, 0 AS dynamic_max_tokens
      FROM catalog c
    `).all();
    const dbModels = this.db.prepare(`
      SELECT m.id, m.provider, m.N, m.sum_reward, m.fails, m.degraded, m.cooldown_until, m.permanent, m.is_paid, m.dynamic_max_tokens, c.is_free, c.supports_tools, c.supports_image_generation, c.supports_vision, c.capability, c.supports_chat, c.supports_audio_generation, c.max_input_tokens
      FROM models m
      LEFT JOIN catalog c ON m.id = c.id
    `).all();
    if (DEBUG) console.log(`[BANDIT][DEBUG] selectModel: catalog=${catalogModels.length} db=${dbModels.length} excluded=${excludeSet.size} tokens=${estimatedTokens} tools=${requireTools}`);
    // Combine catalog and db models, preferring db models when there's a conflict
    const modelMap = new Map();
    // Skip catalog models with falsy id
    for (const model of catalogModels) {
      if (model && model.id) {
        modelMap.set(model.id, model);
      }
    }
    for (const model of dbModels) {
      // Skip db models with falsy id
      if (!model || !model.id) continue;
      const existing = modelMap.get(model.id) || {};
      modelMap.set(model.id, {
        ...existing,
        ...model,
        is_free: model.is_free !== undefined ? model.is_free : existing.is_free,
        is_paid: model.is_paid !== undefined ? model.is_paid : existing.is_paid,
        max_input_tokens: model.max_input_tokens !== undefined ? model.max_input_tokens : existing.max_input_tokens,
        supports_tools: model.supports_tools !== undefined ? model.supports_tools : existing.supports_tools,
        supports_image_generation: model.supports_image_generation !== undefined ? model.supports_image_generation : existing.supports_image_generation,
        supports_vision: model.supports_vision !== undefined ? model.supports_vision : existing.supports_vision,
        supports_chat: model.supports_chat !== undefined ? model.supports_chat : existing.supports_chat,
        supports_audio_generation: model.supports_audio_generation !== undefined ? model.supports_audio_generation : existing.supports_audio_generation,
        capability: model.capability !== undefined ? model.capability : existing.capability,
      }); // db models overwrite catalog models
    }
    const models = Array.from(modelMap.values());
    const selectionHistory = [];

    // Helper filtering function with multi-tier relaxation options
    const filterModels = (tierName, opts = {}) => {
      const { ignoreCooldown = false, ignoreTokenLimit = false, ignoreTools = false, ignorePolicies = false, ignoreImageGeneration = false, ignoreVision = false, ignoreAttention = false, ignorePermanent = false, ignoreDegraded = false, ignoreQuota = false, ignoreExcluded = false, ignoreNonChat = false, ignoreDynamicMaxTokens = false } = opts;
      return models.filter(model => {
        // Defensive guard: skip models with missing id/provider to avoid null dereference
        if (!model || !model.id) {
          return false;
        }
        let rejectionReason = null;

        // Skip if excluded
        if (resolvedExcluded.has(model.id) && !ignoreExcluded) {
          rejectionReason = 'already_tried';
        } else if (model.permanent === 1 && !ignorePermanent) {
          rejectionReason = 'model_permanent_ban';
        } else if (model.degraded === 1 && !ignoreDegraded) {
          rejectionReason = 'model_degraded';
        } else {
          // Skip if provider is permanently banned
          const prov = this.db.prepare(
            `SELECT cooldown_until, permanent, needs_attention, quota_resets_at FROM provider_history WHERE provider = ?`
          ).get(model.provider);
          if (prov && prov.permanent === 1 && !ignorePermanent) {
            rejectionReason = 'provider_permanent_ban';
          } else if (!ignoreCooldown) {
            // Skip if model is in cooldown
            if (model.cooldown_until && model.cooldown_until > now) {
              rejectionReason = 'model_cooldown';
            }
            // Skip if provider circuit breaker is active
            else if (prov && prov.circuit_breaker_until && prov.circuit_breaker_until > now) {
              rejectionReason = 'provider_circuit_breaker';
            }
            // Skip if provider quota or rate limit is exhausted
            else if (!this.quota.canCall(model.provider) && !ignoreQuota) {
              rejectionReason = 'provider_quota_exhausted';
            } else if (prov) {
              if (prov.cooldown_until > now) {
                rejectionReason = 'provider_cooldown';
              } else if (prov.quota_resets_at && prov.quota_resets_at > now) {
                rejectionReason = 'provider_quota_resets_at';
              } else if (prov.needs_attention === 1 && !ignoreAttention) {
                // Auto-reset if cooldown expired
                if (prov.cooldown_until > 0 && prov.cooldown_until <= now) {
                  this.db.prepare("UPDATE provider_history SET needs_attention = 0, attention_reason = NULL, attention_message = NULL WHERE provider = ?").run(model.provider);
                } else {
                  rejectionReason = 'provider_needs_attention';
                }
              }
            }
          }
  
          // Skip if provider was cooled down during this request (cascade failures)
          if (!rejectionReason && cooledDownThisRequest && cooledDownThisRequest.has(model.provider)) {
            rejectionReason = 'provider_cooled_down_this_request';
          }
  
          if (!rejectionReason && !ignorePolicies) {
            // Skip if thinking model and excludeThinking is true
            if (this.excludeThinking && /thinking|reasoning|[-_]r1[-_]|[-_]r1$|^r1[-_]|o1[-_]|o3[-_]|o4[-_]|qwq/i.test(model.id)) {
              rejectionReason = 'exclude_thinking';
            }
            // Apply pricing filter
            else if (this.pricingFilter === 'free-only' && model.is_free === 0) {
              rejectionReason = 'free_only';
            } else if (this.pricingFilter === 'paid-only' && (model.is_paid === 0 || model.is_paid === false)) {
              rejectionReason = 'paid_only';
            } else if (this.pricingFilter === 'exclude-paid' && (model.is_paid === 1 || model.is_paid === true)) {
              rejectionReason = 'exclude_paid';
            }
          }

          if (!rejectionReason && estimatedTokens > 0) {
            const maxInput = this.getModelMaxInput(model.id) || model.max_input_tokens || 0;
            // Check dynamic_max_tokens - always respect unless explicitly ignored
            const dynamicMax = this.getDynamicMaxTokens(model.id) || 0;
            
            if (!ignoreDynamicMaxTokens && dynamicMax > 0 && estimatedTokens > dynamicMax) {
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

          if (!rejectionReason && requireVision && !ignoreVision && !(model.supports_vision || 0)) {
            // Hard exclude dva provider from vision requests (known unsupported_image_block issue)
            if (model.provider === 'dva') {
              rejectionReason = 'no_vision_support_dva_hard_exclude';
            } else {
              rejectionReason = 'no_vision_support';
            }
          }

          if (!rejectionReason && !requireImageGeneration) {
            const lowerModelId = model.id.toLowerCase();
            // Exclude models that have NO chat capability
            // Models with supports_chat === 0 are purely non-chat (e.g., image-only models)
            // Models with supports_chat === 1 can handle chat even if they also support image generation (e.g., gpt-4o)
            const hasChatCapability = model.supports_chat !== 0;
            // Exclude aihorde models (known to be image-only, no chat support)
            const isAihordeModel = model.provider === 'aihorde' || lowerModelId.startsWith('aihorde/');
            // Exclude models that are known non-chat patterns (pure image generation, TTS, etc.)
            const isKnownNonChatPattern = /(^|[-_/])(dall-e|stable-diffusion|imagen|sdxl|flux|midjourney|image-generation|playground|tts|speech|stt|whisper|voice|audio|embed|embedding|rerank|moderation)([-_/]|$)/i.test(lowerModelId);
            // Exclude models that explicitly support image/audio generation but NOT chat
            const isPurelyNonChat = !hasChatCapability && (model.supports_image_generation === 1 || model.supports_audio_generation === 1);
            const isNonChat = !hasChatCapability || isAihordeModel || isKnownNonChatPattern;
            if (isNonChat && !ignoreNonChat) {
              rejectionReason = 'non_chat_model_excluded';
            }
          }
        }

        if (rejectionReason) {
          if (tierName === 'emergency') {
            console.log(`[BANDIT][EMERGENCY] Model ${model.id} rejected: ${rejectionReason}`);
          }
          // Map rejection reason to countermeasure
          let countermeasure = '';
          if (rejectionReason.includes('cooldown') && !rejectionReason.includes('quota') && !rejectionReason.includes('circuit')) {
            countermeasure = 'cooldown-model';
          } else if (rejectionReason.includes('provider_cooldown') || rejectionReason === 'provider_cooled_down_this_request') {
            countermeasure = 'cooldown-provider';
          } else if (rejectionReason === 'provider_quota_exhausted') {
            countermeasure = 'quota_exhausted';
          } else if (rejectionReason === 'model_permanent_ban' || rejectionReason === 'provider_permanent_ban') {
            countermeasure = 'ban-model';
          } else if (rejectionReason === 'exclude_thinking' || rejectionReason === 'exclude_paid' || rejectionReason === 'only_free' || rejectionReason === 'dynamic_max_tokens_exceeded' || rejectionReason === 'max_input_tokens_exceeded' || rejectionReason === 'no_tools_support' || rejectionReason === 'no_image_generation_support' || rejectionReason === 'no_vision_support' || rejectionReason === 'non_chat_model_excluded' || rejectionReason === 'provider_needs_attention') {
            countermeasure = 'flag-provider';
          } else if (rejectionReason === 'provider_circuit_breaker') {
            countermeasure = 'flag-provider';
          }
          selectionHistory.push({
            id: model.id,
            provider: model.provider,
            status: 'rejected',
            reason: rejectionReason,
            countermeasure: countermeasure,
            tier: tierName,
            N: model.N || 0,
            sum_reward: model.sum_reward || 0,
            avg_reward: (model.N || 0) > 0 ? (model.sum_reward || 0) / (model.N || 0) : 1.0,
            avg_latency: model.avg_latency || 250
          });
          
          // Persist punishment state to models table for dashboard metrics
          // EMERGENCY REJECTION: Never auto-ban models - log only and apply cooldown at most.
          // This prevents cascade bans when the emergency tier rejects models.
          if (countermeasure === 'ban-model') {
            // Downgrade emergency ban-model to cooldown-model to prevent cascade bans
            const sanitizedModelId = this._sanitizeModelId(model.id);
            const provider = model.provider;
            const cooldownMs = 300000; // 5 minute cooldown for emergency rejections
            this.db.prepare(
              `INSERT OR IGNORE INTO models (id, provider, N, sum_reward, fails, cooldown_until, last_used_index, total_failures, permanent)
               VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0)`
            ).run(sanitizedModelId, provider);
            this.db.prepare("UPDATE models SET fails = fails + 1, cooldown_until = ?, permanent = 0 WHERE id = ?").run(Date.now() + cooldownMs, sanitizedModelId);
            console.log(`[BANDIT-CONSEQUENCE] cooldown-model | model=${model.id} provider=${provider} reason=${rejectionReason} scope=emergency-rejection (downgraded from ban-model, no permanent ban) cooldownMs=${cooldownMs}`);
            logPunishment({ bandit: this, type: EVENT_TYPES.COOLDOWN_MODEL, provider: provider, modelId: sanitizedModelId, reason: rejectionReason, cooldownMs: cooldownMs, failures: 1 });
          } else if (countermeasure === 'cooldown-model') {
            // Ensure model exists in models table, then update
            const sanitizedModelId = this._sanitizeModelId(model.id);
            const provider = model.provider;
            this.db.prepare(
              `INSERT OR IGNORE INTO models (id, provider, N, sum_reward, fails, cooldown_until, last_used_index, total_failures)
               VALUES (?, ?, 0, 0, 0, 0, 0, 0)`
            ).run(sanitizedModelId, provider);
            // Get current fail count and increment it
            const currentFailRow = this.db.prepare("SELECT fails, total_failures FROM models WHERE id = ?").get(sanitizedModelId);
            const currentFails = currentFailRow?.fails || 0;
            const newFailCount = currentFails + 1;
            const cooldownMs = this._getModelCooldownMs(newFailCount);
            if (cooldownMs === null || cooldownMs === 0) {
              // Permanent ban case (5+ failures) - escalate to permanent ban
              // Reset consecutive_critical_failures on successful ban escalation
              const newConsecutive = (currentFailRow?.consecutive_critical_failures || 0) + 1;
              this.db.prepare(
                `INSERT INTO models (id, provider, N, sum_reward, fails, total_failures, cooldown_until, permanent, last_used_index, consecutive_critical_failures, banned_since)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                   permanent = excluded.permanent,
                   banned_since = excluded.banned_since,
                   consecutive_critical_failures = excluded.consecutive_critical_failures`
              ).run(sanitizedModelId, provider, 0, 0, 0, 0, 0, 1, 0, newConsecutive, Date.now());
              console.log(`[BANDIT-CONSEQUENCE] ban-model | model=${model.id} provider=${provider} reason=${rejectionReason} scope=emergency-rejection (escalated from cooldown)`);
              logPunishment({ bandit: this, type: EVENT_TYPES.BAN_MODEL, provider: provider, modelId: sanitizedModelId, reason: rejectionReason, cooldownMs: 0, failures: newFailCount });
            } else {
              this.db.prepare("UPDATE models SET fails = fails + 1, cooldown_until = ? WHERE id = ?").run(Date.now() + cooldownMs, sanitizedModelId);
              console.log(`[BANDIT-CONSEQUENCE] cooldown-model | model=${model.id} provider=${provider} reason=${rejectionReason} cooldownMs=${cooldownMs} scope=emergency-rejection failCount=${newFailCount}`);
              logPunishment({ bandit: this, type: EVENT_TYPES.COOLDOWN_MODEL, provider: provider, modelId: sanitizedModelId, reason: rejectionReason, cooldownMs: cooldownMs, failures: newFailCount });
            }
          } else if (countermeasure === 'cooldown-provider') {
            this._forceProviderCooldown(model.provider, this._getModelCooldownMs(1), rejectionReason);
            console.log(`[BANDIT-CONSEQUENCE] cooldown-provider | model=${model.id} provider=${model.provider} reason=${rejectionReason} scope=emergency-rejection`);
            logPunishment({ bandit: this, type: EVENT_TYPES.COOLDOWN_PROVIDER, provider: model.provider, modelId: model.id, reason: rejectionReason, cooldownMs: 0, failures: 1 });
          }
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

    // Tier 4: Emergency Relaxation (Ignore Policies/Tools/Token Limits, RESPECT Cooldowns)
    // With exponential backoff (30s → 5min → 30min → 2hr → permanent), cooldowns are now
    // aggressive enough that we should respect them. This tier relaxes capability/policy/token
    // constraints but respects cooldowns to enforce progressive punishment.
    // Note: We respect dynamic_max_tokens here because they are learned limits from actual 413 errors.
    // We DO respect provider quota exhaustion to prevent selecting exhausted providers.
    if (availableModels.length === 0) {
      console.warn(`[BANDIT] Warning: All models filtered. Applying emergency relaxation (respecting cooldowns).`);
      // Relax policies/tools/token limits, but respect cooldowns and permanent bans
      // We explicitly ignore degraded status too in emergency to prioritize continuity.
      // But we do NOT ignore quota exhaustion - we handle it at the provider level.
      // We respect dynamic_max_tokens - they are learned limits from 413 errors.
      availableModels = filterModels('emergency', {
        ignoreCooldown: false,  // RESPECT cooldowns with new exponential backoff
        ignorePermanent: false,
        ignoreDegraded: true,
        ignoreTokenLimit: true,
        ignoreDynamicMaxTokens: false, // Respect dynamic_max_tokens
        ignoreTools: true,
        ignorePolicies: true,
        ignoreVision: true,
        ignoreAttention: true,
        ignoreQuota: false,
        ignoreExcluded: true,
        ignoreNonChat: true
      });
    }

    // Absolute last resort: if still 0 models (e.g. all excluded), pick from all models ignoring all constraints and exclusion (respecting image generation requirement)
    if (availableModels.length === 0) {
      console.warn(`[BANDIT] Warning: All models excluded or unavailable. Picking from all catalog/db models as absolute last resort.`);
      const isImageGenModel = (model) => {
        if (!model || !model.id) return false;
        const isAihordeModel = model.provider === 'aihorde' || model.id.toLowerCase().startsWith("aihorde/") || model.id.toLowerCase().includes("aihorde");
        return isAihordeModel || (model.supports_image_generation || 0) === 1 ||
          /(^|[-_/])(dall-e|stable-diffusion|imagen|sdxl|flux|midjourney|image-generation|playground|aihorde)([-_/]|$)/i.test(model.id) ||
          /image/i.test(model.id);
      };
      // FIX: Correct operator precedence - must check (supports_image_generation || 0) === 1
      availableModels = requireImageGeneration
          ? models.filter(m => m && (m.supports_image_generation || 0) === 1)
          : models.filter(m => {
            if (!m || !m.id) return false;
            const lowerId = m.id.toLowerCase();
            const isNonChat = m.supports_chat === 0 || m.capability !== 'chat_completion' || m.supports_image_generation === 1 || m.supports_audio_generation === 1 ||
              isImageGenModel(m) ||
              /(^|[-_/])(tts|speech|stt|whisper|voice|audio|embed|embedding|rerank|moderation)([-_/]|$)/i.test(lowerId);
            const dynamicMax = this.getDynamicMaxTokens(m.id) || 0;
            if (dynamicMax > 0 && estimatedTokens > dynamicMax) {
              return false;
            }
            return !isNonChat;
          }); // Don't filter by cooldown in absolute last resort - emergency already tried
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
        // Filter out spurious small values (< 1000 tokens) which are likely
        // error codes, HTTP status codes, or other numbers in the message
        // rather than actual token limits
        if (val >= 1000) return val;
      }
    }
    return null;
  }

  getModelMaxInput(modelId) {
    // Returns the authoritative maximum input tokens from the catalog only.
    // Does NOT consider dynamic_max_tokens which can be temporarily lowered by transient errors.
    let catMax = 0;
    try {
      const catRow = this.db.prepare(
        `SELECT max_input_tokens FROM catalog WHERE id = ?`
      ).get(modelId);
      if (catRow && catRow.max_input_tokens > 0) catMax = catRow.max_input_tokens;
    } catch (_) {}
    return catMax;
  }

  getDynamicMaxTokens(modelId) {
    // Returns the dynamic_max_tokens value from the models table (if >= 1000).
    // This is a soft limit that can be temporarily lowered by transient errors.
    // Should be used as an additional constraint, not as a replacement for catalog max_input_tokens.
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
    return dynMax;
  }

  reviveModel(modelId) {
    this.db.prepare(
      `UPDATE models SET cooldown_until = 0, degraded = 0 WHERE id = ?`
    ).run(modelId);
  }

  resetTrainingStatus() {
    try {
      this.db.prepare(`UPDATE models_train SET executionTime = 0, calledModels = 0, okStatus = 0, errorStatus = 0, statusMessage = 'Reset' WHERE id = 'train-daemon'`).run();
    } catch (e) {
      console.warn("[BANDIT] resetTrainingStatus error:", e.message);
    }
  }

  getModels(source = "prod", filters = {}) {
    const now = Date.now();
    const conditions = [];
    const params = [];
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
        c.supports_vision,
        c.max_input_tokens
    `;

    if (source === "train") {
      conditions.push("m.id != 'train-daemon'");
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

    // Provider filter
    if (filters.provider) {
      conditions.push("m.provider = ?");
      params.push(filters.provider);
    }

    // Status filter
    if (filters.status) {
      if (source !== "train") {
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
    const limit = filters.limit !== undefined && filters.limit !== null ? Math.min(parseInt(filters.limit), 10000) : 5000;
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
        supports_vision: model.supports_vision === 1,
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

    // Use catalog as base so ALL catalog models (even uninitialized in models table) are counted
    // Treat NULL permanent as 0 for banned checks.
    let baseQuery = `
      FROM catalog c
      LEFT JOIN models m ON c.id = m.id
    `;

    let activeCondition = "(m.cooldown_until <= ? OR m.cooldown_until IS NULL OR m.cooldown_until = 0) AND (COALESCE(m.permanent, 0) = 0) AND (COALESCE(m.degraded, 0) = 0)";
    let cooldownCondition = "m.cooldown_until > ?";
    let degradedCondition = "COALESCE(m.degraded, 0) = 1";
    let bannedCondition = "COALESCE(m.permanent, 0) = 1";

    if (source === "train") {
      baseQuery = `
        FROM catalog c
        LEFT JOIN models_train m ON c.id = m.id
      `;
    }

    // Build WHERE conditions
    const conditions = [];
    const params = [];

    // Exclude paid models if configured
    if (this.excludePaid) {
      conditions.push("(c.is_free = 1)");
    }

    // Only free models if configured
    if (this.onlyFree) {
      conditions.push("(c.is_free = 1 OR c.is_free IS NULL)");
    }

    // Exclude thinking models if configured
    if (this.excludeThinking) {
      conditions.push("c.id NOT REGEXP ?");
      params.push("thinking|reasoning|[-_]r1[-_]|[-_]r1$|^r1[-_]|o1[-_]|o3[-_]|o4[-_]|qwq");
    }

    const whereClause = conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";

    // Get total count
    const totalStmt = this.db.prepare(`SELECT COUNT(*) AS count ${baseQuery}${whereClause}`);
    const totalResult = totalStmt.all(...params);
    const total = totalResult[0].count;

    // Get counts by provider
    const providerStmt = this.db.prepare(`
      SELECT
        c.provider,
        COUNT(*) AS count
      ${baseQuery}
      ${whereClause}
      GROUP BY c.provider
    `);
    const providerResult = providerStmt.all(...params);
    const byProvider = {};
    providerResult.forEach(row => {
      byProvider[row.provider] = row.count;
    });

    if (source === "train") {
      // Tested count: models where N > 0 or executionTime > 0
      const testedStmt = this.db.prepare(`
        SELECT COUNT(*) AS count ${baseQuery}
        WHERE (m.N > 0 OR m.executionTime > 0)${whereClause ? " AND " + whereClause.slice(6) : ""}
      `);
      const tested = testedStmt.all(...params)[0].count;

      // OK count: models where okStatus = 1
      const okStmt = this.db.prepare(`
        SELECT COUNT(*) AS count ${baseQuery}
        WHERE m.okStatus = 1${whereClause ? " AND " + whereClause.slice(6) : ""}
      `);
      const ok = okStmt.all(...params)[0].count;

      // Fail count: models where errorStatus = 1
      const failStmt = this.db.prepare(`
        SELECT COUNT(*) AS count ${baseQuery}
        WHERE m.errorStatus = 1${whereClause ? " AND " + whereClause.slice(6) : ""}
      `);
      const fail = failStmt.all(...params)[0].count;

      return {
        total,
        tested,
        ok,
        fail,
        byProvider
      };
    }

    // Get active count
    const activeStmt = this.db.prepare(`
      SELECT COUNT(*) AS count ${baseQuery}
      WHERE ${activeCondition}${whereClause ? " AND " + whereClause.slice(6) : ""}
    `);
    const activeResult = activeStmt.all(now, ...params);
    const active = activeResult[0].count;

    // Get cooldown count
    const cooldownStmt = this.db.prepare(`
      SELECT COUNT(*) AS count ${baseQuery}
      WHERE ${cooldownCondition}${whereClause ? " AND " + whereClause.slice(6) : ""}
    `);
    const cooldownResult = cooldownStmt.all(now, ...params);
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

    // Get attention count (models whose provider has needs_attention = 1)
    const attentionStmt = this.db.prepare(`
      SELECT COUNT(*) AS count ${baseQuery}
      LEFT JOIN provider_history ph ON c.provider = ph.provider
      WHERE ph.needs_attention = 1${whereClause ? " AND " + whereClause.slice(6) : ""}
    `);
    const attentionResult = attentionStmt.all(...params);
    const attention = attentionResult[0].count;

    return {
      total,
      active,
      cooldown,
      degraded,
      banned,
      attention,
      byProvider
    };
  }

  getProviders() {
    const now = Date.now();

    // Use catalog distinct providers as base so all providers present in catalog (even without history) are included
    const query = `
      SELECT
        cp.provider,
        COALESCE(ph.fails, 0) AS fails,
        COALESCE(ph.cooldown_until, 0) AS cooldown_until,
        COALESCE(ph.permanent, 0) AS permanent,
        COALESCE(ph.needs_attention, 0) AS needs_attention,
        ph.attention_reason,
        COUNT(c.id) AS modelCount
      FROM (SELECT DISTINCT provider FROM catalog) cp
      LEFT JOIN provider_history ph ON cp.provider = ph.provider
      LEFT JOIN catalog c ON c.provider = cp.provider
      GROUP BY cp.provider
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

  getTrainingStatus() {
    try {
      const daemon = this.db.prepare(`
        SELECT * FROM models_train WHERE id = 'train-daemon'
      `).get();

      const now = Date.now();
      // Use isTraining flag from database - it's set to 0 during inter-cycle pauses (CYCLE_DELAY)
      // The 15s timeout that caused false "Idle (Timeout)" during 30s inter-cycle pauses has been removed
      // Training daemon updates statusMessage each cycle with "Training - Cycle N - OK=..." format
      let isTraining = daemon ? daemon.isTraining === 1 : false;
      let statusMessage = daemon ? daemon.statusMessage : 'Idle';

      // Only mark as inactive if daemon record doesn't exist or hasn't been updated in 60s
      // This accounts for normal daemon operation with 30s cycle delays
      if (!daemon || !daemon.updated_at || (now - daemon.updated_at > 60000)) {
        isTraining = false;
        if (statusMessage === 'Active' || statusMessage.startsWith('Training')) {
          statusMessage = 'Idle (Daemon Inactive)';
        }
      }

      return {
        isTraining,
        executionTime: daemon ? daemon.executionTime : 0,
        calledModels: daemon ? daemon.calledModels : 0,
        okStatus: daemon ? daemon.okStatus : 0,
        errorStatus: daemon ? daemon.errorStatus : 0,
        cycleCount: daemon ? daemon.last_used_index : 0,
        lastRun: daemon ? daemon.updated_at : null,
        statusMessage
      };
    } catch (e) {
      console.warn("[BANDIT] getTrainingStatus error:", e.message);
      return { isTraining: false, executionTime: 0, calledModels: 0, okStatus: 0, errorStatus: 0, cycleCount: 0, lastRun: null, statusMessage: 'Error querying training status' };
    }
  }

  updateTrainingStatus(isTraining, executionTime, calledModels, okStatus, errorStatus, statusMessage) {
    try {
      const now = Date.now();
      // Get last_used_index from existing record, or use 0
      const existing = this.db.prepare(`SELECT last_used_index FROM models_train WHERE id = 'train-daemon'`).get();
      const lastUsedIndex = existing ? existing.last_used_index + 1 : 0;
      
      this.db.prepare(`
        INSERT INTO models_train (id, provider, sum_reward, N, last_used_index, isTraining, executionTime, calledModels, okStatus, errorStatus, statusMessage, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          isTraining = excluded.isTraining,
          executionTime = excluded.executionTime,
          calledModels = excluded.calledModels,
          okStatus = excluded.okStatus,
          errorStatus = excluded.errorStatus,
          statusMessage = excluded.statusMessage,
          updated_at = excluded.updated_at,
          last_used_index = last_used_index + 1
      `).run('train-daemon', '', 0, 0, lastUsedIndex, isTraining ? 1 : 0, executionTime, calledModels, okStatus, errorStatus, statusMessage, now);
    } catch (e) {
      console.error("[BANDIT] updateTrainingStatus error:", e.message);
    }
  }

  close() {
      if (this.quota && typeof this.quota.stopBackgroundRoller === "function") {
          this.quota.stopBackgroundRoller();
      }
      if (this.db) {
          this.db.close();
      }
  }
}

// Exported helper functions for testing
/**
 * Applies punishment to a provider based on action type
 * Implements exponential backoff cooldowns
 * @param {object} db - SQLite database connection
 * @param {string} provider - Provider name
 * @param {string} actionType - Type of punishment action
 * @param {string} error - Error message/details
 */
export async function applyPunishment(db, provider, actionType, error) {
  if (!db || !provider) return;
  
  const now = Date.now();
  
  if (actionType === 'ban-provider' || actionType === 'ban-model') {
    // Get current provider state
    const providerRow = db.prepare(
      'SELECT total_failures, circuit_breaker_until FROM provider_history WHERE provider = ?'
    ).get(provider);
    
    const currentFailures = providerRow ? providerRow.total_failures || 0 : 0;
    const newFailures = currentFailures + 1;
    
    // If no row exists, insert it with permanent ban
    if (!providerRow) {
      db.prepare(`
        INSERT INTO provider_history
          (provider, total_failures, circuit_breaker_until, permanent, last_punishment, punishment_log)
        VALUES (?, ?, 999999999999999, 1, ?, json_object(
          'timestamp', ?,
          'failures', ?,
          'action', ?,
          'error', ?
        ))
      `).run(provider, newFailures, now, now, newFailures, actionType, error);
      return;
    }
    
    // Update records atomically with permanent ban (999999999999999 is ~unlimited timestamp)
    db.prepare(`
      UPDATE provider_history
      SET total_failures = ?,
        circuit_breaker_until = 999999999999999,
        permanent = 1,
        last_punishment = ?,
        punishment_log = json_insert(
          COALESCE(punishment_log, '[]'),
          '$',
          json_object(
            'timestamp', ?,
            'failures', ?,
            'action', ?,
            'error', ?
          )
        )
      WHERE provider = ?
    `).run(newFailures, now, now, newFailures, actionType, error, provider);
    
    return;
  }
  
  // Get current provider state with locking
  const providerRow = db.prepare(
    'SELECT total_failures, circuit_breaker_until FROM provider_history WHERE provider = ?'
  ).get(provider);
  
  // If no row exists, insert it
  if (!providerRow) {
    db.prepare(
      'INSERT INTO provider_history (provider, total_failures, circuit_breaker_until) VALUES (?, 0, 0)'
    ).run(provider);
  }
  
  const res = db.prepare(
    'SELECT total_failures, circuit_breaker_until FROM provider_history WHERE provider = ?'
  ).get(provider);
  
  const currentFailures = res ? res.total_failures || 0 : 0;
  const newFailures = currentFailures + 1;
  
  // Calculate exponential backoff: 15s -> 5m -> 30m -> 2h -> permanent
  const cooldownMs = calculateCooldown(newFailures, error);
  
  // Update records atomically
  db.prepare(`
    UPDATE provider_history
    SET total_failures = ?,
        circuit_breaker_until = ?,
        last_punishment = ?,
        punishment_log = json_insert(
          COALESCE(punishment_log, '[]'),
          '$',
          json_object(
            'timestamp', ?,
            'failures', ?,
            'action', ?,
            'error', ?
          )
        )
    WHERE provider = ?
  `).run(newFailures, now + cooldownMs, actionType, now, newFailures, actionType, error, provider);
  
  // Apply permanent ban if threshold exceeded (10 failures)
  if (newFailures >= 10) {
    db.prepare(`
      UPDATE provider_history
      SET circuit_breaker_until = 999999999999999,
          permanent = 1
      WHERE provider = ?
    `).run(provider);
  }
}

/**
 * Calculates cooldown time based on failure count (exponential backoff)
 * 1st failure: 15s, 2nd: 30s, 3rd: 1min, 4th: 2min, 5th: 4min,
 * 6th: 8min, 7th: 16min, 8th: 32min, 9th: 1hr, 10th: permanent
 */
function calculateCooldown(failureCount, error) {
  const baseMs = 15000; // 15 seconds
  const maxMs = 5 * 60 * 1000; // 5 minutes cap
  
  // Parse reset time from error message if present
  const resetMatch = error?.match?.(/reset after (\d+)(s|m|h)/i);
  if (resetMatch) {
    const v = parseInt(resetMatch[1], 10);
    const u = resetMatch[2].toLowerCase();
    if (u === 's') return v * 1000;
    if (u === 'm') return v * 60 * 1000;
    if (u === 'h') return v * 3600 * 1000;
  }
  
  // Exponential: 15s * 2^(n-1), capped at max
  const cooldown = baseMs * Math.pow(2, Math.min(failureCount - 1, 8));
  return Math.max(Math.min(cooldown, maxMs), baseMs);
}

/**
 * Resets failures gradually (decrements by 1)
 * @param {object} db - SQLite database connection
 * @param {string} provider - Provider name
 */
export async function resetFailuresGradually(db, provider) {
  if (!db || !provider) return;
  
  db.prepare(`
    UPDATE provider_history
    SET total_failures = MAX(total_failures - 1, 0)
    WHERE provider = ?
  `).run(provider);
}

/**
 * Classifies an error based on config patterns (public wrapper)
 * @param {object} config - Bandit configuration with patterns
 * @param {string} error - Error message to classify
 * @returns {object} Classification result with action, reason, etc.
 */
export function classifyError(config, error) {
  if (!config || !error) {
    return { action: 'cooldown-provider', reason: 'unknown' };
  }
  
  const message = typeof error === 'string' ? error : String(error);
  const patterns = config.patterns || {};
  const fallbackAction = getFallbackAction(config);
  
  for (const [patternKey, actionConfig] of Object.entries(patterns)) {
    const regex = new RegExp(patternKey, 'i');
    if (regex.test(message)) {
      return {
        action: actionConfig.action || fallbackAction,
        reason: actionConfig.reason,
        severity: actionConfig.severity,
        cooldownMs: actionConfig.duration,
        scope: actionConfig.scope || 'model'
      };
    }
  }
  
  return {
    action: fallbackAction,
    reason: undefined
  };
}

/**
 * Gets the fallback action from config
 * @param {object} config - Bandit configuration
 * @returns {string} Fallback action
 */
export function getFallbackAction(config) {
  return config?.fallback_action || 'cooldown-provider';
}

/**
 * Gets action for a specific pattern key
 * @param {object} config - Bandit configuration with patterns
 * @param {string} patternKey - The pattern key to look up
 * @returns {object|null} Action configuration or null
 */
export function getPatternAction(config, patternKey) {
  if (!config?.patterns || !patternKey) return null;
  return config.patterns[patternKey] || null;
}
