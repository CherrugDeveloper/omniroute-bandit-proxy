// ============================================================
// Health Check attivo
// ============================================================
// Periodicamente fa un probe leggero sui modelli "malati"
// (bannati o in cooldown lungo) e li riabilita se rispondono.
//
// Silenzioso: log solo su avvio, riabilitazioni ed errori critici.
// ============================================================

export class HealthChecker {
  constructor(bandit, options = {}) {
    this.bandit = bandit;
    this.baseUrl = options.baseUrl || "http://127.0.0.1:20128/v1";
    this.apiKey = options.apiKey || "";
    this.intervalMs = options.intervalMs || 600000;
    this.batchSize = options.batchSize || 20;
    this.timeoutMs = options.timeoutMs || 15000;
    this.verbose = options.verbose || false;

    this.timer = null;
    this.running = false;
    this.inFlight = false;

    this.stats = {
      runs: 0,
      tested: 0,
      revived: 0,
      lastRun: null,
      lastError: null
    };
  }

  start() {
    if (this.running) return;
    this.running = true;

    // Prima esecuzione dopo 30s (per non sovrapporsi al boot)
    this.timer = setTimeout(() => this._tickAndReschedule(), 30000);

    console.log(
      `[HEALTH] Health check attivo (intervallo: ${this.intervalMs / 1000}s, batch: ${this.batchSize}, timeout: ${this.timeoutMs / 1000}s)`
    );
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  _scheduleNext() {
    if (!this.running) return;
    this.timer = setTimeout(() => this._tickAndReschedule(), this.intervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  async _tickAndReschedule() {
    if (!this.running) return;
    try {
      await this._tick();
    } catch (e) {
      this.stats.lastError = { time: Date.now(), message: e.message };
      console.error(`[HEALTH] Errore critico durante il ciclo: ${e.message}`);
    } finally {
      this._scheduleNext();
    }
  }

  async _tick() {
    if (this.inFlight) {
      if (this.verbose) console.log("[HEALTH] Ciclo precedente ancora in corso, salto");
      return;
    }
    this.inFlight = true;

    try {
      const candidates = this.bandit.getUnhealthyModels(this.batchSize);
      if (candidates.length === 0) {
        this.stats.runs++;
        this.stats.lastRun = Date.now();
        return;
      }

      if (this.verbose) {
        console.log(`[HEALTH] Ciclo: ${candidates.length} modelli da testare`);
      }

      let revived = 0;
      for (const m of candidates) {
        if (!this.running) break;
        const ok = await this._probe(m.id);
        if (ok) {
          let stato = "in cooldown";
          if (Number(m.permanent) === 1) stato = "BANNATO";
          else if (Number(m.degraded) === 1) stato = "DEGRADED";

          this.bandit.reviveModel(m.id);
          revived++;
          console.log(`[HEALTH] ✅ ${m.id} riabilitato (era ${stato})`);
        } else if (this.verbose) {
          console.log(`[HEALTH] ❌ ${m.id} ancora non disponibile`);
        }
      }

      this.stats.runs++;
      this.stats.tested += candidates.length;
      this.stats.revived += revived;
      this.stats.lastRun = Date.now();

      if (this.verbose) {
        console.log(`[HEALTH] Ciclo chiuso: ${revived}/${candidates.length} riabilitati`);
      }
    } finally {
      this.inFlight = false;
    }
  }

  async _probe(modelId) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const url = `${this.baseUrl}/chat/completions`;

    try {
      const headers = { "Content-Type": "application/json" };
      if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

      const r = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: "ok" }],
          max_tokens: 1,
          stream: false
        }),
        signal: controller.signal
      });

      if (!r.ok) return false;
      const data = await r.json().catch(() => null);
      // Considera OK solo se c'è una risposta strutturata
      return !!(data && (data.choices || data.error === undefined));
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  getStatus() {
    return {
      running: this.running,
      inFlight: this.inFlight,
      intervalMs: this.intervalMs,
      batchSize: this.batchSize,
      timeoutMs: this.timeoutMs,
      stats: this.stats
    };
  }
}
