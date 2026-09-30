import Database from 'better-sqlite3';

export class DiscountedUCB1Bandit {
  constructor(dbPath = './bandit_state.db', discountFactor = 0.98, explorationC = 0.25) {
    this.discountFactor = discountFactor;
    this.explorationC = explorationC;
    this.totalRequests = 0;
    
    // In-memory state per 1480+ modelli (RAM < 5MB)
    this.modelsState = new Map();

    // SQLite su NVMe in WAL mode
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
      )
    `);
  }

  _loadState() {
    const stmt = this.db.prepare('SELECT * FROM model_history');
    for (const row of stmt.iterate()) {
      this.modelsState.set(row.model, {
        N: row.n_count,
        R_sum: row.r_sum,
        avg: row.n_count > 0 ? row.r_sum / row.n_count : 0.0,
        fails: row.fails,
        cooldownUntil: row.cooldown_until,
        permanent: Boolean(row.permanent)
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

    // Filtra modelli non in blacklist permanente e fuori dal cooldown
    const eligible = [];
    for (const [id, st] of this.modelsState.entries()) {
      if (!st.permanent && now >= st.cooldownUntil) {
        eligible.push(id);
      }
    }

    if (eligible.length === 0) return null;

    let bestModel = null;
    let bestScore = -Infinity;

    for (const id of eligible) {
      const st = this.modelsState.get(id);

      // Priorità ai modelli mai esplorati (senza cold prior)
      if (st.N === 0) return id;

      // Discounted UCB1 Formula
      const uncertainty = this.explorationC * Math.sqrt(Math.log(Math.max(1, this.totalRequests)) / st.N);
      const score = st.avg + uncertainty;

      if (score > bestScore) {
        bestScore = score;
        bestModel = id;
      }
    }

    return bestModel || eligible[0];
  }

  recordFeedback(model, success, ttft = 0.0, tps = 0.0) {
    const now = Date.now() / 1000;
    let st = this.modelsState.get(model);
    if (!st) {
      st = { N: 0.0, R_sum: 0.0, avg: 0.0, fails: 0, cooldownUntil: 0.0, permanent: false };
      this.modelsState.set(model, st);
    }

    if (!success) {
      st.fails += 1;
      if (st.fails >= 3) {
        st.permanent = true;
        console.log(`[PERMANENT BLACKLIST] Modello ${model} eliminato definitivamente.`);
      } else {
        // Cooldown esponenziale: 1h -> 6h -> 24h
        const cooldownSec = 3600 * Math.pow(6, st.fails - 1);
        st.cooldownUntil = now + cooldownSec;
        console.log(`[COOLDOWN] Modello ${model} in pausa per ${(cooldownSec / 3600).toFixed(1)}h (Fallimento ${st.fails}/3).`);
      }
    } else {
      // Sconto storico (Discount Factor)
      st.N = (st.N * this.discountFactor) + 1.0;

      // Reward da TTFT e Throughput (scaled 0..1)
      const rTtft = Math.max(0.0, 1.0 - (ttft / 3.0));
      const rTps = Math.min(1.0, tps / 40.0);
      const reward = (0.5 * rTtft) + (0.5 * rTps);

      st.R_sum = (st.R_sum * this.discountFactor) + reward;
      st.avg = st.R_sum / st.N;
    }

    this._saveModel(model, st);
  }
}
