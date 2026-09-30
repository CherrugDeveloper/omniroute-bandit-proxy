import Database from 'better-sqlite3';

export class DiscountedUCB1Bandit {
  constructor(dbPath = './bandit_state.db', discountFactor = 0.98, explorationC = 0.25) {
    this.discountFactor = discountFactor;
    this.explorationC = explorationC;
    this.totalRequests = 0;

    this.modelsState = new Map();
    this.providersState = new Map(); // providerId -> { fails, permanent, cooldownUntil, pointer }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this._initDb();
    this._loadState();
  }

  _initDb() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS model_history (
        model TEXT PRIMARY KEY,
        fails INTEGER,
        permanent INTEGER,
        cooldown_until REAL,
        n_count REAL,
        r_sum REAL
      );
      CREATE TABLE IF NOT EXISTS provider_history (
        provider TEXT PRIMARY KEY,
        fails INTEGER,
        permanent INTEGER,
        cooldown_until REAL,
        pointer INTEGER
      );
    `);
  }

  _loadState() {
    const stmtModels = this.db.prepare('SELECT * FROM model_history');
    for (const row of stmtModels.iterate()) {
      this.modelsState.set(row.model, {
        N: row.n_count,
        R_sum: row.r_sum,
        avg: row.n_count > 0 ? row.r_sum / row.n_count : 0.0,
        fails: row.fails,
        cooldownUntil: row.cooldown_until,
        permanent: Boolean(row.permanent)
      });
    }

    const stmtProviders = this.db.prepare('SELECT * FROM provider_history');
    for (const row of stmtProviders.iterate()) {
      this.providersState.set(row.provider, {
        fails: row.fails,
        permanent: Boolean(row.permanent),
        cooldownUntil: row.cooldown_until,
        pointer: row.pointer || 0
      });
    }
  }

  _saveModel(model, st) {
    const stmt = this.db.prepare(`
      INSERT INTO model_history (model, fails, permanent, cooldown_until, n_count, r_sum)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(model) DO UPDATE SET
        fails=excluded.fails,
        permanent=excluded.permanent,
        cooldown_until=excluded.cooldown_until,
        n_count=excluded.n_count,
        r_sum=excluded.r_sum
    `);
    stmt.run(model, st.fails, st.permanent ? 1 : 0, st.cooldownUntil, st.N, st.R_sum);
  }

  _saveProvider(provider, provSt) {
    const stmt = this.db.prepare(`
      INSERT INTO provider_history (provider, fails, permanent, cooldown_until, pointer)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(provider) DO UPDATE SET
        fails=excluded.fails,
        permanent=excluded.permanent,
        cooldown_until=excluded.cooldown_until,
        pointer=excluded.pointer
    `);
    stmt.run(provider, provSt.fails, provSt.permanent ? 1 : 0, provSt.cooldownUntil, provSt.pointer);
  }

  _getProvider(modelId) {
    if (modelId.includes('/')) return modelId.split('/')[0];
    if (modelId.startsWith('gpt-') || modelId.startsWith('o1-') || modelId.startsWith('o3-')) return 'openai';
    if (modelId.startsWith('claude-')) return 'anthropic';
    if (modelId.startsWith('gemini-')) return 'google';
    if (modelId.startsWith('deepseek-')) return 'deepseek';
    return 'default';
  }

  registerModels(modelIds) {
    for (const id of modelIds) {
      if (!this.modelsState.has(id)) {
        this.modelsState.set(id, {
          N: 0.0,
          R_sum: 0.0,
          avg: 0.0,
          fails: 0,
          cooldownUntil: 0.0,
          permanent: false
        });
      }
    }
  }

  selectModel() {
    this.totalRequests++;
    const now = Date.now() / 1000;

    const providerMap = new Map();
    for (const [id, st] of this.modelsState.entries()) {
      if (st.permanent) continue;
      const provider = this._getProvider(id);
      
      let provSt = this.providersState.get(provider);
      if (!provSt) {
        provSt = { fails: 0, permanent: false, cooldownUntil: 0.0, pointer: 0 };
        this.providersState.set(provider, provSt);
      }

      if (provSt.permanent || now < provSt.cooldownUntil) continue;
      if (now < st.cooldownUntil) continue;

      if (!providerMap.has(provider)) {
        providerMap.set(provider, []);
      }
      providerMap.get(provider).push({ id, st });
    }

    if (providerMap.size === 0) return null;

    let bestModel = null;
    let bestScore = -Infinity;

    for (const [provider, models] of providerMap.entries()) {
      let provSt = this.providersState.get(provider);
      
      if (provSt.pointer >= models.length) {
        provSt.pointer = 0;
      }

      const targetModelObj = models[provSt.pointer];
      const { id, st } = targetModelObj;

      if (st.N === 0) return id;

      const uncertainty = this.explorationC * Math.sqrt(Math.log(Math.max(1, this.totalRequests)) / st.N);
      const score = st.avg + uncertainty;

      if (score > bestScore) {
        bestScore = score;
        bestModel = id;
      }
    }

    return bestModel;
  }

  recordFeedback(model, success, ttft = 0.0, tps = 0.0) {
    const now = Date.now() / 1000;
    let st = this.modelsState.get(model);
    if (!st) {
      st = { N: 0.0, R_sum: 0.0, avg: 0.0, fails: 0, cooldownUntil: 0.0, permanent: false };
      this.modelsState.set(model, st);
    }

    const provider = this._getProvider(model);
    let provSt = this.providersState.get(provider);
    if (!provSt) {
      provSt = { fails: 0, permanent: false, cooldownUntil: 0.0, pointer: 0 };
      this.providersState.set(provider, provSt);
    }

    const providerModels = [];
    for (const [id] of this.modelsState.entries()) {
      if (this._getProvider(id) === provider) providerModels.push(id);
    }

    if (!success) {
      st.fails += 1;
      if (providerModels.length > 0) {
        provSt.pointer = (provSt.pointer + 1) % providerModels.length;
      }

      provSt.fails += 1;
      if (provSt.fails >= 3) {
        if (provSt.fails >= 9) {
          provSt.permanent = true;
          console.log(`[PERMANENT BLACKLIST] Provider [${provider}] bandito definitivamente (Fallimenti totali: ${provSt.fails}).`);
        } else {
          const cooldownSec = 3600 * Math.pow(6, Math.floor(provSt.fails / 3) - 1);
          provSt.cooldownUntil = now + cooldownSec;
          console.log(`[PROVIDER COOLDOWN] Provider [${provider}] in pausa per ${(cooldownSec / 3600).toFixed(1)}h | Fallimenti: ${provSt.fails}`);
        }
      }

      this._saveProvider(provider, provSt);
    } else {
      provSt.fails = Math.max(0, provSt.fails - 1);
      this._saveProvider(provider, provSt);

      st.N = (st.N * this.discountFactor) + 1.0;
      const rTtft = Math.max(0.0, 1.0 - (ttft / 3.0));
      const rTps = Math.min(1.0, tps / 40.0);
      const reward = (0.5 * rTtft) + (0.5 * rTps);

      st.R_sum = (st.R_sum * this.discountFactor) + reward;
      st.avg = st.R_sum / st.N;

      console.log(`[FEEDBACK SUCCESS] Modello: ${model.padEnd(20)} | Provider: ${provider} | TTFT: ${ttft.toFixed(2)}s | Reward: ${reward.toFixed(3)}`);
    }

    this._saveModel(model, st);
  }

  getMetrics() {
    const now = Date.now() / 1000;
    const models = [];
    
    for (const [id, st] of this.modelsState.entries()) {
      const provider = this._getProvider(id);
      const provSt = this.providersState.get(provider) || { fails: 0, permanent: false, cooldownUntil: 0, pointer: 0 };
      
      const effectiveCooldown = Math.max(st.cooldownUntil, provSt.cooldownUntil);
      const isPermanent = st.permanent || provSt.permanent;

      const uncertainty = st.N > 0 ? this.explorationC * Math.sqrt(Math.log(Math.max(1, this.totalRequests)) / st.N) : 0;
      const score = st.N > 0 ? st.avg + uncertainty : Infinity;
      
      models.push({
        id,
        provider,
        N: st.N,
        avg: st.avg,
        fails: st.fails,
        providerFails: provSt.fails,
        cooldownUntil: effectiveCooldown,
        permanent: isPermanent,
        score: score
      });
    }

    const providers = [];
    for (const [prov, provSt] of this.providersState.entries()) {
      providers.push({
        provider: prov,
        fails: provSt.fails,
        permanent: provSt.permanent,
        cooldownUntil: provSt.cooldownUntil,
        pointer: provSt.pointer
      });
    }

    return {
      totalRequests: this.totalRequests,
      explorationC: this.explorationC,
      discountFactor: this.discountFactor,
      providers,
      models: models.sort((a, b) => b.score - a.score)
    };
  }
}
