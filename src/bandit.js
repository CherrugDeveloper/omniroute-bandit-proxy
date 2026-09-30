import Database from "better-sqlite3";

export class DiscountedUCB1Bandit {
  constructor(dbPath = "bandit.db") {
    this.db = new Database(dbPath);
    this.discountFactor = 0.99;
    this.totalRequests = 0;
    this._initDB();
  }

  _initDB() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS models (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        N REAL DEFAULT 0,
        sum_reward REAL DEFAULT 0,
        fails INTEGER DEFAULT 0,
        cooldown_until REAL DEFAULT 0,
        permanent INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS provider_history (
        provider TEXT PRIMARY KEY,
        fails INTEGER DEFAULT 0,
        cooldown_until REAL DEFAULT 0,
        pointer INTEGER DEFAULT 0,
        permanent INTEGER DEFAULT 0
      );
    `);
  }

  async fetchAndSyncModels() {
    const omnirouteBaseUrl = process.env.OMNIROUTE_BASE_URL || "http://localhost:20128/v1";
    const omnirouteApiKey = process.env.OMNIROUTE_API_KEY;

    try {
      const headers = { "Content-Type": "application/json" };
      if (omnirouteApiKey) headers["Authorization"] = `Bearer ${omnirouteApiKey}`;

      const res = await fetch(`${omnirouteBaseUrl}/models`, { headers });
      if (!res.ok) {
        console.error(`[BANDIT] Impossibile recuperare i modelli da OmniRoute: HTTP ${res.status}`);
        return;
      }

      const data = await res.json();
      const modelList = data.data || data.models || data;

      if (Array.isArray(modelList)) {
        const stmt = this.db.prepare(`
          INSERT INTO models (id, provider) VALUES (?, ?)
          ON CONFLICT(id) DO UPDATE SET provider=excluded.provider
        `);

        const pStmt = this.db.prepare(`
          INSERT INTO provider_history (provider, fails, cooldown_until, pointer, permanent)
          VALUES (?, 0, 0, 0, 0)
          ON CONFLICT(provider) DO NOTHING
        `);

        const insertMany = this.db.transaction((models) => {
          for (const m of models) {
            const modelId = typeof m === 'string' ? m : (m.id || m.name);
            if (!modelId) continue;
            const provider = this._getProvider(modelId);
            stmt.run(modelId, provider);
            pStmt.run(provider);
          }
        });

        insertMany(modelList);
        console.log(`[BANDIT] Sincronizzati ${modelList.length} modelli da OmniRoute.`);
      }
    } catch (err) {
      console.error("[BANDIT] Errore durante il fetch dei modelli da OmniRoute:", err.message);
    }

    // Fallback di sicurezza se il database è vuoto
    const count = this.db.prepare("SELECT COUNT(*) as cnt FROM models").get().cnt;
    if (count === 0) {
      const defaults = ["gpt-4o", "gpt-4o-mini", "claude-3-5-sonnet", "deepseek-chat"];
      const stmt = this.db.prepare("INSERT OR IGNORE INTO models (id, provider) VALUES (?, ?)");
      const pStmt = this.db.prepare("INSERT OR IGNORE INTO provider_history (provider) VALUES (?)");
      for (const m of defaults) {
        const prov = this._getProvider(m);
        stmt.run(m, prov);
        pStmt.run(prov);
      }
    }
  }

  _getProvider(modelId) {
    if (modelId.includes("/")) {
      return modelId.split("/")[0];
    }
    const lower = modelId.toLowerCase();
    if (lower.includes("gpt") || lower.includes("openai") || lower.includes("o1") || lower.includes("o3")) return "openai";
    if (lower.includes("claude") || lower.includes("anthropic")) return "anthropic";
    if (lower.includes("deepseek")) return "deepseek";
    if (lower.includes("llama") || lower.includes("meta")) return "meta";
    if (lower.includes("gemini") || lower.includes("google")) return "google";
    return "default-provider";
  }

  selectModel(excludedModels = new Set()) {
    const nowSec = Date.now() / 1000;
    
    // Recupera tutti i provider e controlla il loro stato di cooldown
    const providers = this.db.prepare("SELECT * FROM provider_history").all();
    const activeProviders = new Set();

    for (const p of providers) {
      if (p.permanent) continue;
      if (p.cooldown_until && p.cooldown_until > nowSec) {
        // Provider in cooldown
        continue;
      }
      activeProviders.add(p.provider);
    }

    // Prendi tutti i modelli validi non esclusi e il cui provider è attivo
    const models = this.db.prepare("SELECT * FROM models WHERE permanent = 0").all();
    const candidates = models.filter(m => {
      if (excludedModels.has(m.id)) return false;
      if (!activeProviders.has(m.provider)) return false;
      if (m.cooldown_until && m.cooldown_until > nowSec) return false;
      return true;
    });

    if (candidates.length === 0) {
      // Se non ci sono candidati a causa dei cooldown, proviamo a sbloccare temporaneamente i provider scaduti o a restituire il meno peggio
      return null;
    }

    // Calcolo UCB1 scontato
    let bestModel = null;
    let maxScore = -Infinity;

    for (const m of candidates) {
      let score;
      if (m.N === 0) {
        score = Infinity; // Esplorazione prioritaria per nuovi modelli
      } else {
        const avg = m.sum_reward / m.N;
        const totalN = models.reduce((acc, curr) => acc + curr.N, 0) || 1;
        const bonus = Math.sqrt((2 * Math.log(totalN)) / m.N);
        score = avg + bonus;
      }

      if (score > maxScore) {
        maxScore = score;
        bestModel = m.id;
      }
    }

    return bestModel;
  }

  recordFeedback(modelId, success, durationSec = 1.0, timeoutSec = 30.0) {
    this.totalRequests++;
    const nowSec = Date.now() / 1000;
    const model = this.db.prepare("SELECT * FROM models WHERE id = ?").get(modelId);
    if (!model) return;

    const providerName = model.provider;
    let reward = success ? 1.0 : 0.0;

    // Penalità temporale se fallisce o è lento
    if (success && durationSec > timeoutSec) {
      reward = 0.1;
    }

    // Applica discounting factor a N e sum_reward esistenti
    this.db.prepare(`
      UPDATE models 
      SET N = N * ?, sum_reward = sum_reward * ?, fails = ? 
      WHERE id = ?
    `).run(
      this.discountFactor, 
      this.discountFactor, 
      success ? 0 : model.fails + 1, 
      modelId
    );

    // Aggiungi il nuovo campione
    this.db.prepare(`
      UPDATE models 
      SET N = N + 1, sum_reward = sum_reward + ? 
      WHERE id = ?
    `).run(reward, modelId);

    // Gestione fallimenti a livello di Provider (soglia a 3 fallimenti)
    const prov = this.db.prepare("SELECT * FROM provider_history WHERE provider = ?").get(providerName);
    if (prov) {
      if (!success) {
        const newFails = prov.fails + 1;
        if (newFails >= 3) {
          // Cooldown esponenziale collettivo (es. 1 ora * 2^(fallimenti - 3))
          const hours = Math.pow(2, newFails - 3);
          const cooldownUntil = nowSec + (hours * 3600);
          console.error(`[PROVIDER COOLDOWN] Provider [${providerName}] in pausa per ${hours}h a causa di ${newFails} fallimenti consecutivi.`);
          
          this.db.prepare(`
            UPDATE provider_history 
            SET fails = ?, cooldown_until = ? 
            WHERE provider = ?
          `).run(newFails, cooldownUntil, providerName);
        } else {
          this.db.prepare("UPDATE provider_history SET fails = ? WHERE provider = ?").run(newFails, providerName);
        }
      } else {
        // Successo: resetta i fallimenti del provider
        this.db.prepare("UPDATE provider_history SET fails = 0, cooldown_until = 0 WHERE provider = ?").run(providerName);
      }
    }
  }

  getMetrics() {
    const models = this.db.prepare("SELECT * FROM models").all();
    const providers = this.db.prepare("SELECT * FROM provider_history").all();
    const totalRequests = this.totalRequests;

    const formattedModels = models.map(m => {
      let score;
      const totalN = models.reduce((acc, curr) => acc + curr.N, 0) || 1;
      if (m.N === 0) {
        score = Infinity;
      } else {
        const avg = m.sum_reward / m.N;
        const bonus = Math.sqrt((2 * Math.log(totalN)) / m.N);
        score = avg + bonus;
      }
      return {
        id: m.id,
        provider: m.provider,
        N: m.N,
        avg: m.N > 0 ? m.sum_reward / m.N : 0,
        score: score,
        fails: m.fails,
        cooldownUntil: m.cooldown_until,
        permanent: m.permanent
      };
    });

    return {
      totalRequests,
      models: formattedModels,
      providers: providers.map(p => ({
        provider: p.provider,
        pointer: p.pointer,
        fails: p.fails,
        cooldownUntil: p.cooldown_until,
        permanent: p.permanent
      }))
    };
  }
}
