import Database from "better-sqlite3";

export class DiscountedUCB1Bandit {
    constructor(dbPath = "bandit.db") {
    this.db = new Database(dbPath);
    this.discountFactor = 0.99;
    this._initDB();
    this._migrateDB();
    this.totalObservations = this._getMeta("totalObservations");
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
          last_used_index INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS provider_history (
          provider TEXT PRIMARY KEY,
          fails INTEGER DEFAULT 0,
          cooldown_until REAL DEFAULT 0,
          pointer INTEGER DEFAULT 0,
          permanent INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY,
          value REAL NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS catalog (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL
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
        INSERT INTO catalog (id, provider) VALUES (?, ?)
        ON CONFLICT(id) DO UPDATE SET provider = excluded.provider
      `);

      const isChatModel = (m) => {
        if (!m || typeof m !== "object") return true; // se è solo una stringa, teniamolo
        // Escludi esplicitamente le immagini
        if (m.type === "image") return false;
        // Tieni solo se produce testo
        const outputs = m.output_modalities;
        if (Array.isArray(outputs) && !outputs.includes("text")) return false;
        return true;
      };

      const syncCatalog = this.db.transaction((models) => {
        this.db.prepare("DELETE FROM catalog").run();
        let inserted = 0;
        let skipped = 0;

        for (const m of models) {
          const modelId = typeof m === "string" ? m : (m.id || m.name);
          if (!modelId) continue;

          // Skip modelli virtuali/combo
          if (modelId.startsWith("auto/") || modelId.includes("combo") || modelId.startsWith("gh/")) {
            continue;
          }

          if (!isChatModel(m)) {
            skipped++;
            continue;
          }

          const provider = this._getProvider(modelId);
          insertStmt.run(modelId, provider);
          inserted++;
        }
        return { inserted, skipped };
      });

      const { inserted, skipped } = syncCatalog(modelList);
      console.log(`[BANDIT] Catalog sincronizzato: ${inserted} modelli chat (esclusi ${skipped} non-chat)`);
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
    return "default";
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

  _getModelCooldownMs(fails) {
    if (fails >= 4) return null;
    const cooldowns = [
      0,
      2 * 3600000,
      6 * 3600000,
      12 * 3600000
    ];
    return cooldowns[Math.min(fails, 3)];
  }

  _getProviderCooldownMs(fails) {
    if (fails >= 4) return null;
    const cooldowns = [
      0,
      1 * 3600000,
      3 * 3600000,
      6 * 3600000
    ];
    return cooldowns[Math.min(fails, 3)];
  }

  selectModel(excludedModels = [], forceProvider = null) {
    const now = Date.now();
    const excludeSet = this._normalizeExcludedModels(excludedModels);

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
              AND c.provider = ?
          `).all(now, forceProvider)
        : this.db.prepare(`
            SELECT DISTINCT c.provider
            FROM catalog c
            LEFT JOIN provider_history p ON c.provider = p.provider
            WHERE (p.cooldown_until IS NULL OR p.cooldown_until < ?)
              AND (p.permanent IS NULL OR p.permanent = 0)
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
          return this.selectModel(excludedModels, oldestProvider.provider);
        }
        return null;
      }

      const providerList = getAvailableProviders.map(p => p.provider);
      let bestModel = null;
      let maxScore = -Infinity;
      const totalN = this.totalObservations || 1;

      // Una query per provider (volutamente semplice)
      const modelsStmt = this.db.prepare(`
        SELECT c.id, c.provider,
               COALESCE(m.N, 0)             AS N,
               COALESCE(m.sum_reward, 0)    AS sum_reward,
               COALESCE(m.fails, 0)         AS fails,
               COALESCE(m.cooldown_until,0) AS cooldown_until,
               COALESCE(m.permanent, 0)     AS permanent,
               COALESCE(m.last_used_index,0) AS last_used_index,
               COALESCE(p.pointer, 0)       AS provider_pointer
        FROM catalog c
        LEFT JOIN models m ON c.id = m.id
        LEFT JOIN provider_history p ON c.provider = p.provider
        WHERE c.provider = ?
          AND (m.cooldown_until IS NULL OR m.cooldown_until < ?)
          AND (m.permanent IS NULL OR m.permanent = 0)
        ORDER BY
          CASE WHEN COALESCE(m.last_used_index,0) >= COALESCE(p.pointer,0) THEN 1 ELSE 0 END,
          COALESCE(m.last_used_index,0) ASC,
          c.id ASC
      `);

      for (const provider of providerList) {
        const providerModels = modelsStmt.all(provider, now);

        for (const m of providerModels) {
          if (excludeSet.has(m.id)) continue;

          let score;
          if (m.N < 0.1) {
            score = Infinity;
          } else {
            const avgReward = m.sum_reward / m.N;
            const ucbBonus = Math.sqrt((2 * Math.log(totalN)) / m.N);
            score = avgReward + ucbBonus;
          }

          if (score > maxScore) {
            maxScore = score;
            bestModel = m;
          }
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
            return this.selectModel(excludedModels, oldestProvider.provider);
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

  recordFeedback(modelId, success, reward = 1.0, errorDetails = null) {
    const now = Date.now();
    const model = this.db.prepare("SELECT * FROM models WHERE id = ?").get(modelId);

    if (!model) {
      console.warn(`[BANDIT] recordFeedback: modello inesistente ${modelId}`);
      return;
    }

    let permanentBan = false;
    let specificCooldownMs = null;

    if (!success && errorDetails && typeof errorDetails === "object") {
      const errorMsg = (errorDetails.message || errorDetails.error || "").toLowerCase();
      const errorStatus = errorDetails.status || errorDetails.code;

      if (
        errorMsg.includes("suspended") ||
        errorMsg.includes("banned") ||
        errorMsg.includes("account disabled") ||
        errorMsg.includes("terminated") ||
        errorStatus === 403
      ) {
        console.log(`[BANDIT] Ban permanente per ${modelId}: ${errorMsg.substring(0, 100)}`);
        permanentBan = true;
      }

      const retryAfterMatch = errorMsg.match(/retry after (\d+)/i) || errorMsg.match(/wait (\d+) seconds/i);
      if (retryAfterMatch) {
        specificCooldownMs = parseInt(retryAfterMatch[1]) * 1000;
        console.log(`[BANDIT] Cooldown specifico per ${modelId}: ${specificCooldownMs}ms`);
      }

      if (errorStatus === 429 && !specificCooldownMs) {
        specificCooldownMs = 60000;
      }

      // Rileva "quota exhausted a livello account/provider"
      const isProviderQuota =
        errorStatus === 429 &&
        /all\s+\S+\s+accounts?\s+have\s+exhausted|exhausted\s+their\s+quota|quota\s+exhausted/i.test(errorMsg);

      if (isProviderQuota) {
        // ... blocco esistente
        this._forceProviderCooldown(model.provider, providerCooldownMs);
      } else {
        // Fail generico: accumula e, se supera soglia, mette in cooldown il provider
        this._recordProviderFailureGeneric(model.provider);
      }
    }

    const newFails = success ? 0 : model.fails + 1;

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

    if (newPermanent === 1 && model.permanent === 0) {
      this._recordProviderFailure(model.provider);
    }
    
    if (success) {
      this.totalObservations++;
      this._setMeta("totalObservations", this.totalObservations);
      // Il provider ha risposto bene: azzera il contatore fail
      this.db.prepare(`UPDATE provider_history SET fails = 0 WHERE provider = ?`).run(model.provider);
    }
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

    const newFails = providerRecord.fails + 1;
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

    _forceProviderCooldown(provider, cooldownMs) {
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
  }

    _recordProviderFailureGeneric(provider, cooldownMs = 5 * 60 * 1000) {
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
    const models = this.db.prepare("SELECT * FROM models ORDER BY provider, id").all();
    const providers = this.db.prepare("SELECT * FROM provider_history ORDER BY fails DESC").all();

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

      return {
        ...m,
        avg: m.N > 0 ? m.sum_reward / m.N : 0,
        score,
        cooldownRemaining: m.cooldown_until > now ? Math.round((m.cooldown_until - now) / 1000) : 0
      };
    });

    const providersWithRemaining = providers.map(p => ({
      ...p,
      cooldownRemaining: p.cooldown_until > now ? Math.round((p.cooldown_until - now) / 1000) : 0
    }));

    // FIX #6: totalRequests basato sul counter incrementale, non su N scontato
    return {
      totalRequests: this.totalRequests,
      models: modelsWithScores,
      providers: providersWithRemaining,
      totalObservations: this.totalObservations
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

  close() {
    try {
      this.db.close();
    } catch (err) {
      console.error("[BANDIT] Errore chiusura DB:", err.message);
    }
  }
}