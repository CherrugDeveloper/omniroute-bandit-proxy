import Database from "better-sqlite3";
import { profileMultiplier } from './modes-registry.mjs';

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

        CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider);
        CREATE INDEX IF NOT EXISTS idx_models_cooldown ON models(cooldown_until);
      `);
    } catch (err) {
      console.error("[BANDIT] Errore inizializzazione DB:", err.message);
      throw err;
    }
  }

  _migrateDB() {
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
  }

    _getMeta(key) {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
    return row ? row.value : 0;
  }

  _setMeta(key, value) {
    this.db.prepare(`
      INSERT INTO meta (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  }

  _incrMeta(key, delta = 1) {
    this.db.prepare(`
      INSERT INTO meta (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = value + excluded.value
    `).run(key, delta);
  }

    _registerModelUse(modelId, provider) {
    // Aggiunge provider e modello solo se non esistono ancora
    this.db.prepare(`
      INSERT OR IGNORE INTO provider_history (provider, fails, cooldown_until, pointer, permanent)
      VALUES (?, 0, 0, 0, 0)
    `).run(provider);

    // INSERT se nuovo, altrimenti incrementa last_used_index (round-robin)
    this.db.prepare(`
      INSERT INTO models (id, provider, last_used_index)
      VALUES (?, ?, 1)
      ON CONFLICT(id) DO UPDATE SET last_used_index = last_used_index + 1
    `).run(modelId, provider);
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

      const insertStmt = this.db.prepare(`
        INSERT INTO catalog (id, provider, max_input_tokens, is_free, supports_tools) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
          provider = excluded.provider, 
          max_input_tokens = excluded.max_input_tokens, 
          is_free = excluded.is_free,
          supports_tools = excluded.supports_tools
      `);

      const isFreeModel = (id) => {
        const lower = String(id).toLowerCase();
        return /(:free|-free|_free|\/free)\b/.test(lower) || lower.includes(":free");
      };

      const isChatModel = (m, id) => {
        if (!m || typeof m !== "object") return true;

        // Escludi type non-chat espliciti
        if (m.type && !["chat", "text"].includes(String(m.type).toLowerCase())) {
          return false;
        }

        // Se il modello dichiara output_modalities, l'unico output ammesso è "text"
        const outputs = m.output_modalities;
        if (Array.isArray(outputs)) {
          if (outputs.length !== 1 || String(outputs[0]).toLowerCase() !== "text") {
            return false;
          }
        }

        // Escludi ID con pattern non-chat (TTS, audio, image, batch, embedding, whisper...)
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

          // Skip modelli virtuali/combo
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
          // Escludi i modelli FIM (Fill-In-the-Middle): sono code completion,
          // non agent. Anche se dichiarano tool_calling, producono diff imprecisi.
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
    // ID senza `/`: usa il primo segmento significativo come provider fittizio
    // Es. gpt-5.6-luna-medium → gpt-5.6-luna, cosi un modello rotto
    // non banna l'intero gruppo "default".
    const parts = modelId.split("-");
    // Rimuovi suffisso variante se è uno di quelli noti
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
    const row = this.db.prepare(`
      SELECT id, provider, N, sum_reward, fails, degraded, cooldown_until, permanent
      FROM models WHERE id = ?
    `).get(modelId);
    if (!row) return null;
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
      const rows = this.db.prepare(`
        SELECT id, sum_reward / N AS avg
        FROM models
        WHERE permanent = 0 AND degraded = 0 AND N >= 3 AND N > 0
        ORDER BY avg DESC
      `).all();
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

    selectModel(excluded = new Set(), forceProvider = null, estimatedTokens = 0, requireTools = false, profile = null) {
    const now = Date.now();
    const excludeSet = this._normalizeExcludedModels(excluded);

    if (forceProvider && typeof forceProvider !== "string") {
      console.warn("[BANDIT] forceProvider non è string, ignorato");
      forceProvider = null;
    }

    const selectTransaction = this.db.transaction(() => {
      // Provider disponibili: dal CATALOG, con cooldown letti da provider_history (se esistono)
      const getAvailableProviders = forceProvider
        ? this.db.prepare(`
            SELECT DISTINCT c.provider
            FROM catalog c
            LEFT JOIN provider_history p ON c.provider = p.provider
            WHERE (p.cooldown_until IS NULL OR p.cooldown_until < ?)
              AND (p.permanent IS NULL OR p.permanent = 0)
              AND (p.needs_attention IS NULL OR p.needs_attention = 0)
              AND c.provider = ?
          `).all(now, forceProvider)
        : this.db.prepare(`
            SELECT DISTINCT c.provider
            FROM catalog c
            LEFT JOIN provider_history p ON c.provider = p.provider
            WHERE (p.cooldown_until IS NULL OR p.cooldown_until < ?)
              AND (p.permanent IS NULL OR p.permanent = 0)
              AND (p.needs_attention IS NULL OR p.needs_attention = 0)
          `).all(now);

      if (getAvailableProviders.length === 0) {
        // Prova a sbloccare il provider in cooldown più vecchio
        const oldestProvider = this.db.prepare(`
          SELECT provider FROM provider_history
          WHERE cooldown_until > ? AND (permanent = 0 OR permanent IS NULL)
          ORDER BY cooldown_until ASC
          LIMIT 1
        `).get(now);

        if (oldestProvider) {
          console.log(`[BANDIT] Tutti i provider in cooldown, sblocco ${oldestProvider.provider}`);
          this.db.prepare(`UPDATE provider_history SET cooldown_until = ? WHERE provider = ?`)
            .run(0, oldestProvider.provider);
            return this.selectModel(excluded, oldestProvider.provider, estimatedTokens, requireTools, profile);
        }
        return null;
      }

      const providerList = getAvailableProviders.map(p => p.provider);
      let bestModel = null;
      let maxScore = -Infinity;
      const totalN = this.totalObservations || 1;

      const paidFilter = this.excludePaid ? "AND (m.is_paid IS NULL OR m.is_paid = 0)" : "";
      const freeFilter = this.onlyFree ? "AND c.is_free = 1" : "";
      const exploitMinN = parseFloat(process.env.EXPLOIT_MIN_N || "3");
      const exploitFilter = this.exploitOnly ? `AND COALESCE(m.N, 0) >= ${exploitMinN}` : "";
      const toolsFilter = requireTools
        ? "AND c.supports_tools = 1"
        : "";
      const fimFilter = "AND c.id NOT LIKE '%fim%' AND c.id NOT LIKE '%code-fim%'";
      const thinkingFilter = this.excludeThinking
        ? "AND c.id NOT LIKE '%thinking%' AND c.id NOT LIKE '%reasoning%' AND c.id NOT LIKE '%-think%' AND c.id NOT LIKE '%max-prime%' AND c.id NOT LIKE '%-ultra%'"
        : "";

      const modelsStmt = this.db.prepare(`
        SELECT c.id, c.provider,
               COALESCE(m.N, 0)             AS N,
               COALESCE(m.sum_reward, 0)    AS sum_reward,
               COALESCE(m.fails, 0)         AS fails,
               COALESCE(m.cooldown_until,0) AS cooldown_until,
               COALESCE(m.permanent, 0)     AS permanent,
               COALESCE(m.last_used_index,0) AS last_used_index,
               COALESCE(p.pointer, 0)       AS provider_pointer,
               COALESCE(c.max_input_tokens, 0) AS max_input_tokens,
               COALESCE(c.is_free, 0)       AS is_free,
               COALESCE(m.degraded, 0)      AS degraded,
               COALESCE(m.is_paid, 0)       AS is_paid,
               COALESCE(mt.N, 0)            AS N_train,
               COALESCE(mt.sum_reward, 0)   AS sum_reward_train
        FROM catalog c
        LEFT JOIN models m ON c.id = m.id
        LEFT JOIN models_train mt ON c.id = mt.id
        LEFT JOIN provider_history p ON c.provider = p.provider
        WHERE c.provider = ?
          AND (m.cooldown_until IS NULL OR m.cooldown_until < ?)
          AND (m.permanent IS NULL OR m.permanent = 0)
          AND (p.needs_attention IS NULL OR p.needs_attention = 0)
          AND (c.max_input_tokens = 0 OR c.max_input_tokens >= ?)
          ${paidFilter}
          ${freeFilter}
          ${thinkingFilter}
          ${exploitFilter}
          ${toolsFilter}
          ${fimFilter}
        ORDER BY
          CASE WHEN COALESCE(m.last_used_index,0) >= COALESCE(p.pointer,0) THEN 1 ELSE 0 END,
          COALESCE(m.last_used_index,0) ASC,
          c.id ASC
      `);

      let anyResults = false;

      for (const provider of providerList) {
        const providerModels = modelsStmt.all(provider, now, estimatedTokens);
        if (providerModels.length > 0) anyResults = true;

        for (const m of providerModels) {
          if (excludeSet.has(m.id)) continue;
          // Effective N e sum_reward:
          // - se models (prod) ha dati → uso quelli (peso pieno)
          // - altrimenti se models_train ha dati → prior al 30%
          // - altrimenti → 0 (exploration pura)
          let effN, effSum;
          if (m.N >= 1) {
            effN = m.N;
            effSum = m.sum_reward;
          } else if (m.N_train > 0.1) {
            effN = m.N_train * 0.3;
            effSum = m.sum_reward_train * 0.3;
          } else {
            effN = 0;
            effSum = 0;
          }

          let score;
          if (effN < 0.1) {
            score = Infinity;
          } else {
            const avgReward = effSum / effN;
            const ucbBonus = Math.sqrt((2 * Math.log(totalN)) / effN);
            score = avgReward + ucbBonus;
          }
          // Penalità modelli degraded: priorità ridotta ma ancora selezionabili
          if (Number(m.degraded) === 1 && score !== Infinity) {
            score = score * 0.3;
          }

          // Soft bias per profilo modalità (code/reasoning/general)
          if (score !== Infinity) {
            score *= profileMultiplier(profile, m.id);   // ← NUOVA RIGA
          }

          if (score > maxScore) {
            maxScore = score;
            bestModel = m;
          }
        }
      }

      // FALLBACK: se con EXPLOIT_ONLY non c'è nulla, ritenta senza il filtro N>=3
      if (!bestModel && !anyResults && this.exploitOnly && !forceProvider) {
        if (!this._fallbackWarned) {
          console.log(`[BANDIT] EXPLOIT_ONLY ha 0 candidati → fallback senza filtro`);
          this._fallbackWarned = true;
          setTimeout(() => { this._fallbackWarned = false; }, 60000);
        }
        const oldExploit = this.exploitOnly;
        this.exploitOnly = false;
        try {
          return this.selectModel(excluded, forceProvider, estimatedTokens, requireTools, profile);
        } finally {
          this.exploitOnly = oldExploit;
        }
      }

      if (!bestModel) {
        if (!forceProvider) {
          const oldestProvider = this.db.prepare(`
            SELECT provider FROM provider_history
            WHERE cooldown_until > ? AND (permanent = 0 OR permanent IS NULL)
            ORDER BY cooldown_until ASC
            LIMIT 1
          `).get(now);

          if (oldestProvider) {
            console.log(`[BANDIT] Nessun modello disponibile, sblocco ${oldestProvider.provider}`);
            this.db.prepare(`UPDATE provider_history SET cooldown_until = ? WHERE provider = ?`)
              .run(0, oldestProvider.provider);
            return this.selectModel(excluded, oldestProvider.provider, estimatedTokens, requireTools, profile);
          }
        }
        return null;
      }

      // Registra modello + provider e aggiorna round-robin in un colpo
      this._registerModelUse(bestModel.id, bestModel.provider);

      return bestModel.id;
    });
    return selectTransaction();
  }
  recordFeedback(modelId, success, reward = 1.0, errorDetails = null, opts = {}) {
    const tx = this.db.transaction(() => {
    const now = Date.now();
    const source = opts.source === 'training' ? 'training' : 'prod';

    if (source === 'training') {
      return this._recordTrainingFeedback(modelId, success, reward);
    }

    let model = this.db.prepare("SELECT * FROM models WHERE id = ?").get(modelId);

      if (!model) {
        // Modello non ancora in `models` (es. forzato via x-force-model).
        // Lo registriamo al volo leggendo il provider dal catalog.
        const catRow = this.db.prepare("SELECT provider FROM catalog WHERE id = ?").get(modelId);
        if (!catRow) {
          // Non è nemmeno nel catalogo → ignora
          console.warn(`[BANDIT] recordFeedback: modello ${modelId} non in catalogo, ignoro`);
          return;
        }

        this.db.prepare(`
          INSERT OR IGNORE INTO provider_history (provider, fails, cooldown_until, pointer, permanent)
          VALUES (?, 0, 0, 0, 0)
        `).run(catRow.provider);

        this.db.prepare(`
          INSERT INTO models (id, provider, last_used_index)
          VALUES (?, ?, 0)
          ON CONFLICT(id) DO NOTHING
        `).run(modelId, catRow.provider);

        model = this.db.prepare("SELECT * FROM models WHERE id = ?").get(modelId);
        if (!model) {
          console.warn(`[BANDIT] recordFeedback: impossibile registrare ${modelId}`);
          return;
        }
        console.log(`[BANDIT] ${modelId}: auto-registrato (primo uso via force)`);
      }

      let permanentBan = false;
      let specificCooldownMs = null;

      if (!success && errorDetails && typeof errorDetails === "object") {
        const c = this._classifyError(errorDetails, model.provider);
        console.log(`[BANDIT] ${modelId}: ${c.action} (${c.reason})${c.cooldownMs ? ` per ${c.cooldownMs / 1000}s` : ""}`);

        // skip-feedback (es. input-too-long): il modello è OK, solo la richiesta è grande.
        // Non tocca DB, non penalizza.
        if (c.action === "skip-feedback") {
          return;
        }

        switch (c.action) {
          case "ban-model":
            permanentBan = true;
            break;
          case "ban-provider":
            this._banProvider(model.provider);
            break;
          case "cooldown-paid-only":
            this._cooldownPaidOnly(model.provider, c.cooldownMs);
            break;
          case "cooldown-provider":
            // Se l'errore è 402/no-credit, marca il MODELLO come paid
            // (non bannare il provider, solo escludere quel modello se EXCLUDE_PAID)
            if (c.reason === "no-credit" || /402|payment|credit|funds/i.test(String(errorDetails?.status || "") + " " + String(errorDetails?.message || ""))) {
              this.db.prepare(`UPDATE models SET is_paid = 1 WHERE id = ?`).run(modelId);
              console.log(`[BANDIT] ${modelId}: marcato is_paid=1`);
            }
            this._forceProviderCooldown(model.provider, c.cooldownMs, c.reason);
            break;
          case "flag-provider":
            this._flagProviderAttention(model.provider, c.reason, errorDetails.message || errorDetails.error || "");
            break;
          case "cooldown-model": {
            const isTransient5xx = ["server-error", "timeout", "unknown"].includes(c.reason);

            if (isTransient5xx) {
              const consec = (Number(model.consecutive_5xx) || 0) + 1;

              // 10 errori 5xx di fila → cooldown lungo (1h), NON ban permanente.
              // Ban permanente solo per errori strutturali (404, policy, validation).
              if (consec >= 10) {
                console.log(`[BANDIT] ${modelId}: ${consec} errori transitori → cooldown 1h`);
                specificCooldownMs = 60 * 60 * 1000;
                this.db.prepare(`
                  UPDATE models SET consecutive_5xx = 0, degraded = 1, degraded_since = ?
                  WHERE id = ?
                `).run(Date.now(), modelId);
              } else {
                specificCooldownMs = c.cooldownMs;
                this.db.prepare(`
                  UPDATE models 
                  SET consecutive_5xx = ?, degraded = 1, degraded_since = ?
                  WHERE id = ?
                `).run(consec, Date.now(), modelId);
                console.log(`[BANDIT] ${modelId}: degraded (${consec}/5 errori transitori)`);
              }
            } else {
              specificCooldownMs = c.cooldownMs;
            }
            break;
          }
        }
      }

      let newFails = success ? 0 : model.fails + 1;

      let newN, newSumReward;
      if (success) {
        newN = model.N * this.discountFactor + 1;
        newSumReward = model.sum_reward * this.discountFactor + reward;
      } else {
        newN = model.N * this.discountFactor;
        newSumReward = model.sum_reward * this.discountFactor;
      }

      let cooldownUntil = 0;
      let newPermanent = model.permanent || 0;

      if (success) {
        cooldownUntil = 0;
        newFails = 0;
      } else if (permanentBan) {
        newPermanent = 1;
        cooldownUntil = 0;
      } else if (specificCooldownMs) {
        cooldownUntil = now + specificCooldownMs;
      } else {
        const cooldownMs = this._getModelCooldownMs(newFails);
        if (cooldownMs === null) {
          newPermanent = 1;
          cooldownUntil = 0;
        } else {
          cooldownUntil = now + cooldownMs;
        }
      }

      this.db.prepare(`
        UPDATE models
        SET N = ?, sum_reward = ?, fails = ?, cooldown_until = ?, permanent = ?
        WHERE id = ?
      `).run(newN, newSumReward, newFails, cooldownUntil, newPermanent, modelId);

      if (success) {
        this.totalObservations++;
        this._lastReward.set(modelId, reward);
        this._rankCache.at = 0; // invalida classifica (ricalcolo al prossimo getModelRank)
        this._setMeta("totalObservations", this.totalObservations);
        this.db.prepare(`UPDATE provider_history SET fails = 0 WHERE provider = ?`).run(model.provider);

        // Se era degraded, lo "guarisci"
        if (Number(model.degraded) === 1) {
          console.log(`[BANDIT] ${modelId}: riabilitato da degraded`);
        }
        this.db.prepare(`
          UPDATE models 
          SET consecutive_5xx = 0, degraded = 0, degraded_since = 0
          WHERE id = ?
        `).run(modelId);
      }
    });
    return tx();
  }

  // Scrive le statistiche di training in `models_train` (separate da `models`).
  // Non tocca ban/cooldown/degraded/provider_history: il training è "silenzioso".
  _recordTrainingFeedback(modelId, success, reward = 1.0) {
    // 1. Assicura che il modello sia in models_train
    let mt = this.db.prepare("SELECT * FROM models_train WHERE id = ?").get(modelId);
    if (!mt) {
      const catRow = this.db.prepare("SELECT provider FROM catalog WHERE id = ?").get(modelId);
      if (!catRow) return; // non in catalogo → ignora
      this.db.prepare(`
        INSERT OR IGNORE INTO models_train (id, provider, N, sum_reward)
        VALUES (?, ?, 0, 0)
      `).run(modelId, catRow.provider);
      mt = this.db.prepare("SELECT * FROM models_train WHERE id = ?").get(modelId);
      if (!mt) return;
    }

    // 2. Aggiorna con discount factor (come in prod)
    let newN, newSumReward;
    if (success) {
      newN = (mt.N || 0) * this.discountFactor + 1;
      newSumReward = (mt.sum_reward || 0) * this.discountFactor + reward;
    } else {
      newN = (mt.N || 0) * this.discountFactor;
      newSumReward = (mt.sum_reward || 0) * this.discountFactor;
    }

    this.db.prepare(`
      UPDATE models_train SET N = ?, sum_reward = ? WHERE id = ?
    `).run(newN, newSumReward, modelId);
  }

  _recordProviderFailure(provider) {
    const now = Date.now();

    // Se il provider non esiste ancora, lo registriamo
    this.db.prepare(`
      INSERT OR IGNORE INTO provider_history (provider, fails, cooldown_until, pointer, permanent)
      VALUES (?, 0, 0, 0, 0)
    `).run(provider);

    const providerRecord = this.db.prepare("SELECT * FROM provider_history WHERE provider = ?").get(provider);

    if (!providerRecord) return;

    let newFails = providerRecord.fails + 1;
    const cooldownMs = this._getProviderCooldownMs(newFails);

    let cooldownUntil = 0;
    let newPermanent = 0;

    if (cooldownMs === null) {
      newPermanent = 1;
    } else {
      cooldownUntil = now + cooldownMs;
    }

    this.db.prepare(`
      UPDATE provider_history 
      SET fails = ?, cooldown_until = ?, permanent = ?
      WHERE provider = ?
    `).run(newFails, cooldownUntil, newPermanent, provider);

    const cooldownStr = cooldownUntil > 0 ? new Date(cooldownUntil).toISOString() : "PERMANENTE";
    console.log(`[BANDIT] Provider ${provider}: ${newFails} fallimenti, cooldown ${cooldownStr}`);
  }

  _forceProviderCooldown(provider, cooldownMs, reason = "") {
    const now = Date.now();
    const until = now + cooldownMs;

    // Assicura che il provider esista in provider_history
    this.db.prepare(`
      INSERT OR IGNORE INTO provider_history (provider, fails, cooldown_until, pointer, permanent)
      VALUES (?, 0, 0, 0, 0)
    `).run(provider);

    // Metti in cooldown TUTTI i modelli di quel provider
    const info = this.db.prepare(`
      UPDATE models SET cooldown_until = ?
      WHERE provider = ? AND (permanent = 0 OR permanent IS NULL)
    `).run(until, provider);

    // E metti in cooldown anche il provider stesso
    this.db.prepare(`
      UPDATE provider_history SET cooldown_until = ?
      WHERE provider = ? AND (permanent = 0 OR permanent IS NULL)
    `).run(until, provider);

    console.log(`[BANDIT] Provider ${provider} in cooldown fino a ${new Date(until).toISOString()} (${info.changes} modelli aggiornati)`);
    if (this.notifier && (reason === "quota-exhausted" || reason === "no-credit")) {
      const label = reason === "no-credit" ? "credito esaurito" : "quota esaurita";
      this.notifier.notify(
        `provider.${reason.replace("-", "_")}`,
        `Provider \`${provider}\`: ${label}. Cooldown ${Math.round(cooldownMs / 60000)} min`,
        { provider, cooldownMs, reason }
      ).catch(() => {});
    }
  }

  // Mette in cooldown SOLO i modelli paid (is_free=0) del provider,
  // lasciando attivi quelli free (:free, -free, ecc.)
  _cooldownPaidOnly(provider, cooldownMs) {
    const until = Date.now() + cooldownMs;

    this.db.prepare(`
      INSERT OR IGNORE INTO provider_history (provider, fails, cooldown_until, pointer, permanent)
      VALUES (?, 0, 0, 0, 0)
    `).run(provider);

    // 1. Assicura che TUTTI i paid del provider esistano in `models`
    //    (anche quelli mai testati) così possono ricevere il cooldown.
    this.db.prepare(`
      INSERT OR IGNORE INTO models (id, provider, last_used_index)
      SELECT id, ?, 0 FROM catalog WHERE provider = ? AND is_free = 0
    `).run(provider, provider);

    // 2. Cooldown sui paid
    const paidInfo = this.db.prepare(`
      UPDATE models SET cooldown_until = ?
      WHERE provider = ?
        AND id IN (SELECT id FROM catalog WHERE is_free = 0)
        AND (permanent = 0 OR permanent IS NULL)
    `).run(until, provider);

    // Verifica quanti free restano attivi
    const freeActive = this.db.prepare(`
      SELECT COUNT(*) AS n FROM catalog c
      JOIN models m ON m.id = c.id
      WHERE c.provider = ? AND c.is_free = 1
        AND (m.cooldown_until IS NULL OR m.cooldown_until < ?)
        AND (m.permanent = 0 OR m.permanent IS NULL)
    `).get(provider, Date.now());

    console.log(`[BANDIT] Provider ${provider}: key-quota-exceeded → ${paidInfo.changes} modelli PAID in cooldown ${Math.round(cooldownMs/60000)}m, ${freeActive.n} free attivi`);

    // Se NON ci sono free attivi, metti in cooldown tutto il provider
    if (freeActive.n === 0) {
      console.log(`[BANDIT] Provider ${provider}: nessun free attivo, cooldown provider intero`);
      this._forceProviderCooldown(provider, cooldownMs, "key-quota-exceeded");
    }

    if (this.notifier) {
      this.notifier.notify(
        "provider.key_quota_exceeded",
        `Provider \`${provider}\`: credito esaurito. ${paidInfo.changes} paid in cooldown, ${freeActive.n} free ancora attivi`,
        { provider, cooldownMs, paidCount: paidInfo.changes, freeCount: freeActive.n }
      ).catch(() => {});
    }
  }
  
  _flagProviderAttention(provider, reason = "unknown", message = "") {
    this.db.prepare(`
      INSERT OR IGNORE INTO provider_history (provider, fails, cooldown_until, pointer, permanent, needs_attention)
      VALUES (?, 0, 0, 0, 0, 1)
    `).run(provider);

    const msgShort = String(message || "").slice(0, 500);
    this.db.prepare(`
      UPDATE provider_history
      SET needs_attention = 1, attention_reason = ?, attention_message = ?
      WHERE provider = ?
    `).run(reason, msgShort, provider);

    // Metti in cooldown i modelli di quel provider finché l'utente non decide
    this.db.prepare(`
      UPDATE models SET cooldown_until = ?
      WHERE provider = ? AND (permanent = 0 OR permanent IS NULL)
    `).run(Date.now() + 24 * 3600000, provider);

    console.log(`[BANDIT] Provider ${provider} marcato needs_attention (${reason})`);
    if (this.notifier) {
      this.notifier.notify(
        "provider.needs_attention",
        `Provider \`${provider}\` marcato *needs attention* (${reason})\n${msgShort.slice(0, 200)}`,
        { provider, reason, message: msgShort.slice(0, 300) }
      ).catch(() => {});
    }
  }

clearProviderAttention(provider) {
    if (!provider || typeof provider !== "string") return false;
    const info = this.db.prepare(`
      UPDATE provider_history 
      SET needs_attention = 0, fails = 0, cooldown_until = 0, permanent = 0,
          attention_reason = '', attention_message = ''
      WHERE provider = ?
    `).run(provider);

    this.db.prepare(`
      UPDATE models SET cooldown_until = 0, fails = 0
      WHERE provider = ? AND (permanent = 0 OR permanent IS NULL)
    `).run(provider);

    console.log(`[BANDIT] Provider ${provider} sbloccato manualmente`);
    return info.changes > 0;
  }

  ignoreProvider(provider) {
    if (!provider || typeof provider !== "string") return false;
    this.db.prepare(`
      UPDATE provider_history SET permanent = 1, needs_attention = 0 WHERE provider = ?
    `).run(provider);
    this.db.prepare(`UPDATE models SET permanent = 1 WHERE provider = ?`).run(provider);
    console.log(`[BANDIT] Provider ${provider} ignorato permanentemente`);
    return true;
  }

  _parseResetAfter(msg) {
    // "reset after 5m" / "retry after 30s" / "wait 60 seconds" / "reset after 1m 59s"
    const m1 = msg.match(/(?:reset|retry|wait)\s+(?:after\s+)?(\d+)\s*([smh])/i);
    if (m1) {
      const n = parseInt(m1[1], 10);
      const u = m1[2].toLowerCase();
      return u === "s" ? n * 1000 : u === "m" ? n * 60000 : n * 3600000;
    }
    // "wait 60 seconds"
    const m2 = msg.match(/wait\s+(\d+)\s+seconds?/i);
    if (m2) return parseInt(m2[1], 10) * 1000;
    // "reset_seconds: 117" o "reset_seconds":117
    const m3 = msg.match(/reset_?seconds"?\s*[:=]\s*(\d+)/i);
    if (m3) return parseInt(m3[1], 10) * 1000;
    // "reset after 1m 59s" (formato composto)
    const m4 = msg.match(/reset\s+after\s+(\d+)m\s+(\d+)s/i);
    if (m4) return (parseInt(m4[1], 10) * 60 + parseInt(m4[2], 10)) * 1000;
    return null;
  }
  _getProviderModelCount(provider) {
    if (!provider) return 0;
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM catalog WHERE provider = ?").get(provider);
    return row ? row.n : 0;
  }
_classifyError(errorDetails, providerName = null) {
    const msg = String(errorDetails.message || errorDetails.error || "").toLowerCase();
    // Saturazione globale provider (chat_admission_busy) → cooldown provider breve
    if (/chat_admission_busy|Structurally heavy|structure_limit|capacity is busy/i.test(msg)) {
      return { action: "cooldown-provider", reason: "provider-saturated", cooldownMs: 120000 }; // 2 min
    }
    // OpenRouter 403 "Key limit exceeded" → cooldown provider lungo (4h).
    // È un limite di budget/rate temporaneo, non un ban permanente.
    if (/key limit exceeded|key limit reached|per-model access|all \d+ active accounts cooling/i.test(msg)) {
      return { action: "cooldown-provider", reason: "key-limit-exceeded", cooldownMs: 4 * 60 * 60 * 1000 }; // 4h
    }
    // 413 / ITPM / Request too large → skip (non è colpa del modello, la richiesta è troppo grande)
    if (/413|ITPM|TPM|tokens per minute|input tokens per minute|Request too large|Requested \d+.*Limit \d+/i.test(msg)) {
      return { action: "skip-feedback", reason: "request-too-large" };
    }
    if (!errorDetails || typeof errorDetails !== "object") {
      return { scope: "model", action: "cooldown-model", cooldownMs: 60 * 60000, reason: "no-details" };
    }

    const status = errorDetails.status || errorDetails.code;

    // === DEMO LIMIT (provider demo con limiti hard, non si risolve comprimendo) ===
    // Va PRIMA di input-too-long perché contiene anche "stream_early_eof"
    if (/demo is limited|demo.*limit|limited to \d+ messages/i.test(msg)) {
      return { scope: "provider", action: "flag-provider", reason: "demo-limit" };
    }

    // === INPUT TROPPO LUNGO (anche mascherato da errore stream/5xx) ===
    if (
      /input exceeds maximum|maximum input tokens|too many tokens|context length|exceeds.*input.*tokens|prompt is too long|prompt too long|content too large/i.test(msg) ||
      /max\s+\d+\s+characters/i.test(msg) ||
      /stream.*early.*eof|stream_early_eof|stream ended before/i.test(msg)
    ) {
      return { scope: "model", action: "skip-feedback", reason: "input-too-long" };
    }

    // === BUG INTERNO UPSTREAM (non ritentare mai lo stesso modello) ===
    if (/assignment to constant variable|is not a function|undefined is not|null is not|cannot read/i.test(msg)) {
      return { scope: "model", action: "ban-model", reason: "upstream-bug" };
    }

    // === MODELLO NON ESISTENTE / NON SUPPORTATO ===
    if (
      (status === 404 && /does not exist|no access|not found|not supported/i.test(msg)) ||
      (status === 400 && /not supported|invalid model|unsupported model/i.test(msg))
    ) {
      return { scope: "model", action: "ban-model", reason: "model-invalid" };
    }

    // === ENDPOINT INCOMPATIBILE (es. modelli :batch non usabili con chat/completions) ===
    if (/cannot be used with.*chat\/completions|adapter.*batch|not.*chat.*completion/i.test(msg)) {
      return { scope: "model", action: "ban-model", reason: "endpoint-incompatible" };
    }

        // === VALIDATION ERROR (body malformato respinto dall'upstream) ===
    if (/must not be an empty array|validation error|value_error|invalid.*body|invalid.*request.*body/i.test(msg)) {
      return { scope: "model", action: "ban-model", reason: "validation-error" };
    }

    // === vLLM MISCONFIGURATO (tool_choice non supportato) ===
    if (/tool_choice requires|enable-auto-tool-choice|tool-call-parser/i.test(msg)) {
      return { scope: "model", action: "ban-model", reason: "provider-misconfigured-tools" };
    }

    // === POLICY / GUARDRAIL / DATA RESTRICTIONS (rifiuto permanente) ===
    if (/guardrail|data policy|not available matching.*restriction|removed them for the following/i.test(msg)) {
      return { scope: "model", action: "ban-model", reason: "policy-restricted" };
    }

    // === PROVIDER MISCONFIGURATO (auth, playwright, transport, cli obsoleto) ===
    if (
      /no auth provided|please log in|not authenticated|missing.*api.?key|invalid.*api.?key/i.test(msg) ||
      /playwright is not available|playwright.*install/i.test(msg) ||
      /transport is not configured|missing url or token|not configured/i.test(msg) ||
      /cli is no longer supported|please upgrade|version.*not supported/i.test(msg) ||
      /cli not found|not found.*install via|spawn.*enoent|command not found/i.test(msg) ||
      /must be an absolute path|bridge sandbox|_home must be|env(ironment)? var/i.test(msg) ||
      status === 466
    ) {
      return { scope: "provider", action: "flag-provider", reason: "provider-misconfigured" };
    }

    // === PROVIDER BLOCCATO DA ANTI-ABUSE / CHALLENGE ===
    if (
      /anti-abuse|challenge failed|err_bn_limit|bot detection|captcha/i.test(msg) ||
      status === 418
    ) {
      return { scope: "provider", action: "cooldown-provider", cooldownMs: 6 * 3600000, reason: "provider-blocked" };
    }

    if (/suspended|banned|account disabled|account terminated|api key.*revoked/i.test(msg)) {
      return { scope: "provider", action: "ban-provider", reason: "account-banned" };
    }

    // === KEY LIMIT / CREDITO ESAURITO (paid-only) ===
    // I modelli paid del provider smettono di funzionare, i free restano attivi.
    if (status === 403 && /key limit|total limit|credit|insufficient|billing|payment/i.test(msg)) {
      return { scope: "provider", action: "cooldown-paid-only", cooldownMs: 6 * 3600000, reason: "key-quota-exceeded" };
    }

    if (status === 403) {
      // 403 generico → solo il modello
      return { scope: "model", action: "ban-model", reason: "forbidden" };
    }

    // 403 "Key limit exceeded" → problema di credito OpenRouter (tutta la key)
    if (status === 403 && /key limit|total limit|quota|credit/i.test(msg)) {
      return { scope: "provider", action: "flag-provider", reason: "key-quota-exceeded" };
    }

    // === QUOTA ESAURITA PROVIDER (rispetta reset del server) ===
    if (
      status === 429 &&
      /all\s+\S+\s+accounts?\s+have\s+exhausted|exhausted\s+their\s+quota|quota\s+exhausted/i.test(msg)
    ) {
      return {
        scope: "provider",
        action: "cooldown-provider",
        cooldownMs: this._parseResetAfter(msg) || 15 * 60000,
        reason: "quota-exhausted"
      };
    }

    // === RATE LIMIT / COOLING DOWN (usa reset_seconds o reset_after) ===
    if (status === 429 || /cooling down|rate limit|too many requests/i.test(msg)) {
      let ms = this._parseResetAfter(msg);
      // Prova reset_seconds (formato JSON OmniRoute)
      if (!ms) {
        const m = msg.match(/reset_?seconds"?\s*[:=]\s*(\d+)/i) || msg.match(/"reset_seconds":(\d+)/i);
        if (m) ms = parseInt(m[1], 10) * 1000;
      }
      return {
        scope: "model",
        action: "cooldown-model",
        cooldownMs: ms || 15 * 60000,
        reason: "rate-limited"
      };
    }

    // === TIMEOUT / ABORT ===
    // === 429 RATE LIMIT ===
    // Se il provider ha "molti" modelli (OpenRouter, groq, ecc.), cooldown provider breve
    // per evitare di bruciare N modelli con lo stesso 429.
    if (status === 429 || /rate.?limit|too many requests|quota.*exceeded/i.test(msg)) {
      const providerModelCount = this._getProviderModelCount(providerName);
      if (providerModelCount > 20) {
        return { scope: "provider", action: "cooldown-provider", cooldownMs: 60000, reason: "rate-limit-burst" };
      }
      // Provider piccolo: cooldown solo il modello
      return { scope: "model", action: "cooldown-model", cooldownMs: 60000, reason: "rate-limit" };
    }
    if (/timeout|aborted|abort/i.test(msg)) {
      return { scope: "model", action: "cooldown-model", cooldownMs: 10 * 60000, reason: "timeout" };
    }

    // === 402 PAYMENT REQUIRED → il provider non ha credito, cooldown lungo ===
    if (status === 402 || /insufficient.*(funds|credit|balance|quota)/i.test(msg)) {
      return { scope: "provider", action: "cooldown-provider", cooldownMs: 6 * 3600000, reason: "no-credit" };
    }

    // === 5xx TRANSITORI su un modello specifico → cooldown SOLO il modello ===
    // Non uccidere l'intero provider: altri modelli dello stesso provider possono funzionare.
    if (typeof status === "number" && status >= 500 && status < 600) {
      return { scope: "model", action: "cooldown-model", cooldownMs: 10 * 60000, reason: "server-error" };
    }

    // === FALLBACK ===
    return { scope: "model", action: "cooldown-model", cooldownMs: 30 * 60000, reason: "unknown" };
  }

  _banProvider(provider) {
    this.db.prepare(`
      INSERT OR IGNORE INTO provider_history (provider, fails, cooldown_until, pointer, permanent)
      VALUES (?, 0, 0, 0, 1)
    `).run(provider);
    this.db.prepare(`UPDATE provider_history SET permanent = 1 WHERE provider = ?`).run(provider);
    this.db.prepare(`UPDATE models SET permanent = 1 WHERE provider = ?`).run(provider);
    console.log(`[BANDIT] Provider ${provider} disabilitato permanentemente (ban account)`);
    if (this.notifier) {
      this.notifier.notify("provider.banned", `Provider \`${provider}\` disabilitato permanentemente (account bannato/sospeso)`, { provider }).catch(() => {});
    }
  }

  _recordProviderFailureGeneric(provider, cooldownMs = 30 * 60 * 1000) {
    const now = Date.now();

    // Assicura che il provider esista
    this.db.prepare(`
      INSERT OR IGNORE INTO provider_history (provider, fails, cooldown_until, pointer, permanent)
      VALUES (?, 0, 0, 0, 0)
    `).run(provider);

    const rec = this.db.prepare("SELECT fails FROM provider_history WHERE provider = ?").get(provider);
    const newFails = (rec?.fails || 0) + 1;
    const PROVIDER_FAIL_THRESHOLD = 3;

    if (newFails >= PROVIDER_FAIL_THRESHOLD) {
      console.log(`[BANDIT] Provider ${provider} raggiunta soglia (${newFails} fail) → cooldown ${cooldownMs / 1000}s`);
      this.db.prepare(`UPDATE provider_history SET fails = 0 WHERE provider = ?`).run(provider);
      this._forceProviderCooldown(provider, cooldownMs);
    } else {
      this.db.prepare(`UPDATE provider_history SET fails = ? WHERE provider = ?`).run(newFails, provider);
    }
  }

  getMetrics() {
    const now = Date.now();
    const models = this.db.prepare(`
      SELECT m.*, COALESCE(c.is_free, 0) AS is_free
      FROM models m
      LEFT JOIN catalog c ON c.id = m.id
      ORDER BY m.provider, m.id
    `).all();
    const providers = this.db.prepare("SELECT * FROM provider_history ORDER BY fails DESC").all();
    const catalogCount = this.db.prepare("SELECT COUNT(*) AS n FROM catalog").get().n;
    const catalogProviderCount = this.db.prepare("SELECT COUNT(DISTINCT provider) AS n FROM catalog").get().n;
    const catalogFreeCount = this.db.prepare("SELECT COUNT(*) AS n FROM catalog WHERE is_free = 1").get().n;

    const modelsWithScores = models.map(m => {
      const totalN = this.totalObservations || 1;
      let score = -Infinity;

      if (m.N > 0.1) {
        const avgReward = m.sum_reward / m.N;
        const ucbBonus = Math.sqrt((2 * Math.log(totalN)) / m.N);
        score = avgReward + ucbBonus;
      } else if (m.cooldown_until < now && !m.permanent) {
        score = Infinity;
      }

      const N = Number(m.N) || 0;
      const sumReward = Number(m.sum_reward) || 0;
      const fails = Number(m.fails) || 0;
      const cooldownUntil = Number(m.cooldown_until) || 0;

      return {
        ...m,
        N,
        sum_reward: sumReward,
        fails,
        cooldown_until: cooldownUntil,
        degraded: Number(m.degraded) || 0,
        degraded_since: Number(m.degraded_since) || 0,
        is_paid: Number(m.is_paid) || 0,
        avg: N > 0 ? sumReward / N : 0,
        score,
        cooldownRemaining: cooldownUntil > now ? Math.round((cooldownUntil - now) / 1000) : 0
      };
    });

    const providersWithRemaining = providers.map(p => {
      const cooldownUntil = Number(p.cooldown_until) || 0;
      return {
        ...p,
        fails: Number(p.fails) || 0,
        cooldown_until: cooldownUntil,
        needs_attention: Number(p.needs_attention) || 0,
        permanent: Number(p.permanent) || 0,
        attention_reason: p.attention_reason || '',
        attention_message: p.attention_message || '',
        cooldownRemaining: cooldownUntil > now ? Math.round((cooldownUntil - now) / 1000) : 0
      };
    });

    // === Metriche aggregate ===
    const now2 = Date.now();
    const providerCooldown = {};
    for (const p of providersWithRemaining) {
      providerCooldown[p.provider] = {
        cooldown: Number(p.cooldown_until) || 0,
        needsAttention: Number(p.needs_attention) || 0,
        permanent: Number(p.permanent) || 0
      };
    }
    const activeModels = modelsWithScores.filter(m => {
      if (Number(m.permanent)) return false;
      if (Number(m.cooldown_until) > now2) return false;
      const pc = providerCooldown[m.provider];
      if (pc) {
        if (pc.permanent) return false;
        if (pc.needsAttention) return false;
        if (pc.cooldown > now2) return false;
      }
      return true;
    });
    const avgReward = activeModels.length > 0
      ? activeModels.reduce((s, m) => s + (Number(m.avg) || 0), 0) / activeModels.length
      : 0;

    // Latenza media ricavata dal reward: reward = max(0, 1 - t/30) → t = (1 - reward) * 30
    const avgLatencySec = activeModels.length > 0
      ? activeModels
          .filter(m => Number(m.avg) > 0)
          .reduce((s, m) => s + (1 - Number(m.avg)) * 30, 0) /
        Math.max(1, activeModels.filter(m => Number(m.avg) > 0).length)
      : 0;

    // Free attivi
    const freeActive = activeModels.filter(m => Number(m.is_free) === 1).length;

    // Top model per QUALITÀ (avg reward), non per score UCB1 (esplorazione)
    // Considera solo modelli con almeno 3 osservazioni pesate
    const candidates = activeModels.filter(m =>
      Number(m.N) >= 3 &&
      Number(m.avg) > 0 &&
      !isNaN(Number(m.avg))
    );
    candidates.sort((a, b) => Number(b.avg) - Number(a.avg));
    const topModel = candidates[0] ? (() => {
      const c = candidates[0];
      const avg = Math.round(Number(c.avg) * 1000) / 1000;
      const last = this._lastReward.get(c.id) ?? null;
      let trend = 'flat';
      if (last != null) {
        trend = last > avg + 0.02 ? 'up' : last < avg - 0.02 ? 'down' : 'flat';
      }
      return {
        id: c.id,
        provider: c.provider || null,
        avg,
        N: Math.round(Number(c.N) * 100) / 100,
        lastReward: last,
        trend,
      };
    })() : null;
    return {
      totalRequests: this.totalRequests,
      models: modelsWithScores,
      providers: providersWithRemaining,
      totalObservations: this.totalObservations,
      catalogCount,
      catalogProviderCount,
      catalogFreeCount,
      catalogRawCount: this._getMeta("catalogRawCount"),
      excludePaid: this.excludePaid,
      onlyFree: this.onlyFree,
      exploitOnly: this.exploitOnly,
      excludeThinking: this.excludeThinking,
      summary: {
        activeCount: activeModels.length,
        avgReward: Math.round(avgReward * 1000) / 1000,
        avgLatencySec: Math.round(avgLatencySec * 10) / 10,
        freeActive,
        topModel
      }
    };
  }

  // FIX #4: Validazione input reset
  resetModel(modelId) {
    if (!modelId || typeof modelId !== "string" || modelId.length > 256) {
      console.error("[BANDIT] Invalid modelId for reset");
      return;
    }

    this.db.prepare(`
      UPDATE models 
      SET fails = 0, cooldown_until = 0, permanent = 0, last_used_index = 0
      WHERE id = ?
    `).run(modelId);
    console.log(`[BANDIT] Modello ${modelId} resettato`);
  }

    blockModel(modelId) {
    if (!modelId || typeof modelId !== "string" || modelId.length > 256) {
      console.error("[BANDIT] Invalid modelId for block");
      return false;
    }
    const info = this.db.prepare(`
      UPDATE models 
      SET permanent = 1, cooldown_until = 0 
      WHERE id = ?
    `).run(modelId);
    console.log(`[BANDIT] Modello ${modelId} bloccato permanentemente`);
    return info.changes > 0;
  }

  resetProvider(provider) {
    // FIX #4: Validazione input provider
    if (!provider || typeof provider !== "string" || provider.length > 128) {
      console.error("[BANDIT] Invalid provider name for reset");
      return;
    }

    this.db.prepare(`
      UPDATE provider_history 
      SET fails = 0, cooldown_until = 0, permanent = 0, pointer = 0
      WHERE provider = ?
    `).run(provider);
    this.db.prepare(`
      UPDATE models 
      SET fails = 0, cooldown_until = 0, permanent = 0, last_used_index = 0
      WHERE provider = ?
    `).run(provider);
    console.log(`[BANDIT] Provider ${provider} resettato`);
  }

  resetGlobalCounters() {
    this.totalObservations = 0;
    this._lastReward = new Map(); // modelId -> ultimo reward osservato
    this.totalRequests = 0;
    this._setMeta("totalObservations", 0);
    this._setMeta("totalRequests", 0);
    console.log("[BANDIT] Contatori globali resettati (richieste + osservazioni)");
    return true;
  }
  getProviderCount() {
    const row = this.db.prepare("SELECT COUNT(DISTINCT provider) AS n FROM catalog").get();
    return row ? row.n : 0;
  }

    getUnhealthyModels(limit = 20) {
    const now = Date.now();
    const oneHourFromNow = now + 3600000;
    // Escludi provider con rate limit noti bassi (openrouter 20 RPM / 1000 RPD con 800+ modelli)
    const excluded = String(process.env.HEALTH_EXCLUDE_PROVIDERS || "")
      .split(",").map(s => s.trim()).filter(Boolean);
    const exclFilter = excluded.length > 0
      ? ` AND provider NOT IN (${excluded.map(p => `'${p.replace(/'/g, "''")}'`).join(",")})`
      : "";
    return this.db.prepare(`
      SELECT id, provider, permanent, degraded, cooldown_until, consecutive_5xx
      FROM models
      WHERE (permanent = 1
         OR cooldown_until > ?
         OR degraded = 1)
         ${exclFilter}
      ORDER BY
        CASE WHEN permanent = 1 THEN 0 ELSE 1 END,
        CASE WHEN degraded = 1 THEN 0 ELSE 1 END,
        cooldown_until ASC,
        consecutive_5xx DESC
      LIMIT ?
    `).all(oneHourFromNow, limit);
  }

  reviveModel(id) {
    if (!id || typeof id !== "string") return false;
    const info = this.db.prepare(`
      UPDATE models
      SET permanent = 0, cooldown_until = 0, fails = 0, consecutive_5xx = 0
      WHERE id = ?
    `).run(id);
    return info.changes > 0;
  }

  isModelAvailable(id) {
    if (!id || typeof id !== "string") return false;
    const now = Date.now();
    const row = this.db.prepare(`
      SELECT c.id
      FROM catalog c
      LEFT JOIN models m ON c.id = m.id
      LEFT JOIN provider_history p ON c.provider = p.provider
      WHERE c.id = ?
        AND (m.permanent IS NULL OR m.permanent = 0)
        AND (m.cooldown_until IS NULL OR m.cooldown_until < ?)
        AND (p.permanent IS NULL OR p.permanent = 0)
        AND (p.needs_attention IS NULL OR p.needs_attention = 0)
        AND (p.cooldown_until IS NULL OR p.cooldown_until < ?)
    `).get(id, now, now);
    return !!row;
  }

  getModelMaxInput(modelId) {
    if (!modelId || typeof modelId !== "string") return 0;
    const row = this.db.prepare("SELECT max_input_tokens FROM catalog WHERE id = ?").get(modelId);
    return row?.max_input_tokens || 0;
  }

    estimateTokens(body) {
    if (!body) return 0;
    try {
      const s = typeof body === "string" ? body : JSON.stringify(body);
      // Stima conservativa: 1 token ~= 4 caratteri (misto testo/codice/JSON)
      return Math.ceil(s.length / 4);
    } catch {
      return 0;
    }
  }

  maxCatalogInput() {
    const row = this.db.prepare("SELECT MAX(max_input_tokens) AS m FROM catalog").get();
    return row?.m || 0;
  }

  close() {
    try {
      this.db.close();
    } catch (err) {
      console.error("[BANDIT] Errore chiusura DB:", err.message);
    }
  }
}