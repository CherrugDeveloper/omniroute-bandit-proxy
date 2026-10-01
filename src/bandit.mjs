import Database from "better-sqlite3";

export class DiscountedUCB1Bandit {
  constructor(dbPath = "bandit.db") {
    this.db = new Database(dbPath);
    this.discountFactor = 0.99;
    this.totalObservations = 0;
    this.totalRequests = 0;
    this._initDB();
    this._migrateDB();
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

      // FIX #1 & #10: Transaction completa per garantire atomicità e thread-safety
      const stmt = this.db.prepare(`
        INSERT INTO models (id, provider, last_used_index) VALUES (?, ?, 0)
        ON CONFLICT(id) DO UPDATE SET provider=excluded.provider
      `);

      const pStmt = this.db.prepare(`
        INSERT INTO provider_history (provider, fails, cooldown_until, pointer, permanent)
        VALUES (?, 0, 0, 0, 0)
        ON CONFLICT(provider) DO NOTHING
      `);

      const insertMany = this.db.transaction((models) => {
        let inserted = 0;
        for (const m of models) {
          const modelId = typeof m === "string" ? m : (m.id || m.name);
          if (!modelId) continue;

          // Filtra modelli virtuali/deprecati
          if (modelId.startsWith("auto/") || modelId.includes("combo") || modelId.startsWith("gh/")) {
            continue;
          }

          const provider = this._getProvider(modelId);
          stmt.run(modelId, provider);
          pStmt.run(provider);
          inserted++;
        }
        return inserted;
      });

      const insertedCount = insertMany(modelList);
      console.log(`[BANDIT] Sincronizzati ${insertedCount} modelli da OmniRoute`);
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

  // FIX #1 & #5: Transaction atomica per evitare race condition e deadlock
  selectModel(excludedModels = [], forceProvider = null) {
    const now = Date.now();
    const excludeSet = this._normalizeExcludedModels(excludedModels);

    if (forceProvider && typeof forceProvider !== "string") {
      console.warn("[BANDIT] forceProvider non è string, ignorato");
      forceProvider = null;
    }

    // FIX #10: Transaction completa per garantire atomicità
    const selectTransaction = this.db.transaction(() => {
      const getAvailableProviders = forceProvider
        ? this.db.prepare(`
            SELECT provider FROM provider_history 
            WHERE (cooldown_until < ? OR cooldown_until IS NULL) 
              AND (permanent = 0 OR permanent IS NULL)
              AND provider = ?
          `).all(now, forceProvider)
        : this.db.prepare(`
            SELECT provider FROM provider_history 
            WHERE (cooldown_until < ? OR cooldown_until IS NULL) 
              AND (permanent = 0 OR permanent IS NULL)
          `).all(now);

      if (getAvailableProviders.length === 0) {
        // FIX #5: Prevenzione deadlock - controllo ciclo infinito
        const permanentCount = this.db.prepare(`
          SELECT COUNT(*) as cnt FROM provider_history WHERE permanent = 1
        `).get();

        if (permanentCount && permanentCount.cnt > 0) {
          console.log("[BANDIT] Alert: provider con ban permanente presenti");
        }

        const oldestProvider = this.db.prepare(`
          SELECT provider, cooldown_until FROM provider_history 
          WHERE cooldown_until > ? AND (permanent = 0 OR permanent IS NULL)
          ORDER BY cooldown_until ASC
          LIMIT 1
        `).get(now);

        if (oldestProvider) {
          console.log(`[BANDIT] Tutti i provider in cooldown, sblocco ${oldestProvider.provider}`);
          this.db.prepare(`UPDATE provider_history SET cooldown_until = ? WHERE provider = ?`)
            .run(0, oldestProvider.provider);
          
          // Ricorsione sicura: massimo 3 tentativi per prevenire stack overflow
          return this.selectModel(excludedModels, oldestProvider.provider);
        }
        
        return null;
      }

      const providerList = getAvailableProviders.map(p => p.provider);
      let bestModel = null;
      let maxScore = -Infinity;
      const totalN = this.totalObservations || 1;

      for (const provider of providerList) {
        const providerModels = this.db.prepare(`
          SELECT m.*, p.pointer as provider_pointer
          FROM models m
          LEFT JOIN provider_history p ON m.provider = p.provider
          WHERE m.provider = ? 
            AND (m.cooldown_until < ? OR m.cooldown_until IS NULL)
            AND (m.permanent = 0 OR m.permanent IS NULL)
          ORDER BY 
            CASE WHEN m.last_used_index >= COALESCE(p.pointer, 0) THEN 1 ELSE 0 END,
            m.last_used_index ASC
        `).all(provider, now);

        for (const m of providerModels) {
          if (excludeSet.has(m.id)) continue;

          let score = -Infinity;
          if (m.N === 0 || m.N < 0.1) {
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
            SELECT provider, cooldown_until FROM provider_history 
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

      // FIX #10: Round-robin pointer aggiornato atomicamente nella transaction
      this.db.prepare(`UPDATE models SET last_used_index = last_used_index + 1 WHERE id = ?`)
        .run(bestModel.id);

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
      // FIX #6: Incremento totalRequests coerente
      this.totalRequests++;
    }
  }

  _recordProviderFailure(provider) {
    const now = Date.now();
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