// ============================================================
// Health Check attivo
// ============================================================
// Periodicamente fa un probe leggero sui modelli "malati"
// (bannati o in cooldown lungo) e li riabilita se rispondono.
//
// Silenzioso: log solo su avvio, riabilitazioni ed errori critici.
// ============================================================

export function sanitizeBaseUrl(urlStr, defaultUrl = "http://127.0.0.1:20128/v1") {
  const fallback = (defaultUrl || "http://127.0.0.1:20128/v1").trim().replace(/\/+$/, "");
  if (!urlStr || typeof urlStr !== "string") {
    return fallback;
  }
  const trimmed = urlStr.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return fallback;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.toString().replace(/\/+$/, "");
  } catch (err) {
    console.error(`[CONFIG] Invalid base URL "${urlStr}": ${err.message}. Falling back to "${fallback}"`);
    try {
      return new URL(fallback).toString().replace(/\/+$/, "");
    } catch {
      return fallback;
    }
  }
}

export function buildEndpointUrl(baseUrl, endpointPath = "/chat/completions") {
  const sanitizedBase = sanitizeBaseUrl(baseUrl);
  const cleanPath = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
  const fullUrl = `${sanitizedBase}${cleanPath}`;
  try {
    const url = new URL(fullUrl);
    return url.toString();
  } catch (err) {
    throw new Error(`[CONFIG] Failed to construct valid URL from base "${baseUrl}" and path "${endpointPath}": ${err.message}`);
  }
}

export class HealthChecker {
  constructor(bandit, options = {}) {
    this.bandit = bandit;
    this.baseUrl = sanitizeBaseUrl(options.baseUrl, "http://127.0.0.1:20128/v1");
    this.apiKey = options.apiKey || "";
    this.intervalMs = options.intervalMs || 600000;
    this.providerIntervals = options.providerIntervals || {};
    this.batchSize = options.batchSize || 20;
    this.timeoutMs = options.timeoutMs || 15000;
    this.verbose = options.verbose || false;

    this.timer = null;
    this.running = false;
    this.inFlight = false;
    this.lastProviderCheck = new Map(); // Track last check time per provider

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
    // Use per-provider interval if configured, otherwise use global interval
    const nextProvider = this._getNextProviderToCheck();
    if (nextProvider) {
      const providerInterval = this.providerIntervals[nextProvider] || this.intervalMs;
      const now = Date.now();
      const lastCheck = this.lastProviderCheck.get(nextProvider) || 0;
      // Only schedule if enough time has passed for this provider
      if (now - lastCheck >= providerInterval) {
        // Schedule immediately (delay = 0) to avoid negative timeout warnings
        this.timer = setTimeout(() => this._tickAndReschedule(), 0);
        this.lastProviderCheck.set(nextProvider, Date.now());
      } else {
        // Schedule with remaining time
        const delay = providerInterval - (now - lastCheck);
        this.timer = setTimeout(() => this._tickAndReschedule(), delay);
        this.lastProviderCheck.set(nextProvider, Date.now());
      }
    } else {
      this.timer = setTimeout(() => this._tickAndReschedule(), this.intervalMs);
    }
    if (this.timer.unref) this.timer.unref();
  }

  _getNextProviderToCheck() {
    const unhealthyModels = this.bandit.getUnhealthyModels(this.batchSize);
    if (unhealthyModels.length === 0) return null;
    // Return the first provider that needs checking
    return unhealthyModels[0]?.provider;
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
        // Check if enough time has passed for this provider's interval
        const providerInterval = this.providerIntervals[m.provider] || this.intervalMs;
        const lastCheck = this.lastProviderCheck.get(m.provider) || 0;
        if (Date.now() - lastCheck < providerInterval) {
          if (this.verbose) console.log(`[HEALTH] Skip ${m.id}: provider ${m.provider} last checked ${Math.ceil((Date.now() - lastCheck) / 1000 / 60)}m ago, need ${Math.ceil(providerInterval / 1000 / 60)}min wait`);
          continue;
        }

        const ok = await this._probe(m.id);
        if (ok) {
          let stato = "in cooldown";
          if (Number(m.permanent) === 1) stato = "BANNATO";
          else if (Number(m.degraded) === 1) stato = "DEGRADED";

          this.bandit.reviveModel(m.id);
          // Auto-clear needs_attention flag for the provider on successful health check
          try {
            this.bandit.clearProviderAttention(m.provider);
          } catch (e) {
            console.error(`[HEALTH] Errore nel clearing attention flag per ${m.provider}: ${e.message}`);
          }
          // Reset provider-level cooldown when a model from that provider is reachable
          try {
            this.bandit.resetProviderCooldown(m.provider);
          } catch (e) {
            console.error(`[HEALTH] Errore nel reset cooldown provider per ${m.provider}: ${e.message}`);
          }
          revived++;
          console.log(`[HEALTH] ✅ ${m.id} riabilitato (era ${stato})`);
        } else if (this.verbose) {
          console.log(`[HEALTH] ❌ ${m.id} ancora non disponibile`);
        }

        // Update last check time for this provider
        this.lastProviderCheck.set(m.provider, Date.now());
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
    const url = buildEndpointUrl(this.baseUrl, "/chat/completions");

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
      providerIntervals: this.providerIntervals,
      batchSize: this.batchSize,
      timeoutMs: this.timeoutMs,
      stats: this.stats
    };
  }
}
