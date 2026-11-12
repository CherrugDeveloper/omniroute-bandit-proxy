/**
 * Real-time statistics aggregator for the Bandit proxy.
 * 
 * Consumes punishment events from the event stream and maintains
 * unified, real-time history and statistics based on the log stream.
 * 
 * Statistics are updated on each event and can be queried by the dashboard
 * for real-time visibility into model bans, cooldowns, and provider health.
 */

import { createPunishmentEvents, EVENT_TYPES, getRecentEvents } from './events.mjs';

/**
 * StatsAggregator class - maintains real-time stats from punishment events.
 */
export class StatsAggregator {
  constructor(options = {}) {
    this.maxHistory = options.maxHistory || 1000;
    this.statsWindowMs = options.statsWindowMs || 24 * 60 * 60 * 1000; // 24h default

    // Aggregated counters
    this.counters = {
      totalBans: 0,
      totalCooldowns: 0,
      totalFlags: 0,
      totalPaidGroupBans: 0,
      totalCriticalFailures: 0,
      totalDegradations: 0,
      modelsBanned: new Set(),
      providersBanned: new Set(),
      providersCooldown: new Set(),
      providersFlagged: new Set()
    };

    // Time-windowed counters (rolling)
    this.windowedCounters = {
      bansLastHour: 0,
      cooldownsLastHour: 0,
      criticalFailuresLastHour: 0
    };

    // Per-model stats
    this.modelStats = new Map(); // modelId -> { bans, cooldowns, flags, lastEvent, reasons }

    // Per-provider stats
    this.providerStats = new Map(); // provider -> { bans, cooldowns, flags, paidGroupBans, lastEvent, reasons }

    // Event history (reverse chronological, newest first)
    this.eventHistory = [];

    // Subscribe to punishment events
    this._subscribe();

    // Start window reset timer (every hour)
    this._windowTimer = setInterval(() => this._resetWindowedCounters(), 60 * 60 * 1000);
    if (this._windowTimer.unref) this._windowTimer.unref();
  }

  /**
   * Subscribe to punishment events from the event emitter.
   * @private
   */
  _subscribe() {
    const events = createPunishmentEvents();
    events.on('event', (event) => {
      this._processEvent(event);
    });
  }

  /**
   * Process a single punishment event and update all statistics.
   * @param {Object} event - Formatted event payload from formatEventPayload()
   * @private
   */
  _processEvent(event) {
    const { subtype: type, provider, modelId, reason, cooldownMs, failures, consecutive, source, timestamp, sequence } = event;
    const now = timestamp || Date.now();

    // Add to event history (newest first - reverse chronological)
    const historyEntry = {
      type,
      provider,
      modelId: modelId || null,
      reason,
      cooldownMs: cooldownMs || 0,
      failures: failures || 0,
      consecutive: consecutive || 0,
      source: source || 'prod',
      timestamp: now,
      sequence
    };

    this.eventHistory.unshift(historyEntry);
    if (this.eventHistory.length > this.maxHistory) {
      this.eventHistory.pop();
    }

    // Update global counters
    switch (type) {
      case EVENT_TYPES.BAN_MODEL:
        this.counters.totalBans++;
        this.counters.modelsBanned.add(modelId);
        this.windowedCounters.bansLastHour++;
        break;
      case EVENT_TYPES.BAN_PROVIDER:
        this.counters.totalBans++;
        this.counters.providersBanned.add(provider);
        this.windowedCounters.bansLastHour++;
        break;
      case EVENT_TYPES.BAN_PAID_GROUP:
        this.counters.totalPaidGroupBans++;
        this.counters.providersBanned.add(provider);
        this.windowedCounters.bansLastHour++;
        break;
      case EVENT_TYPES.COOLDOWN_MODEL:
        this.counters.totalCooldowns++;
        this.windowedCounters.cooldownsLastHour++;
        break;
      case EVENT_TYPES.COOLDOWN_PROVIDER:
        this.counters.totalCooldowns++;
        this.counters.providersCooldown.add(provider);
        this.windowedCounters.cooldownsLastHour++;
        break;
      case EVENT_TYPES.FLAG_PROVIDER:
        this.counters.totalFlags++;
        this.counters.providersFlagged.add(provider);
        break;
      case EVENT_TYPES.CRITICAL_FAILURE:
        this.counters.totalCriticalFailures++;
        this.windowedCounters.criticalFailuresLastHour++;
        break;
      case EVENT_TYPES.DEGRADED_MODEL:
        this.counters.totalDegradations++;
        break;
    }

    // Update per-model stats
    if (modelId) {
      if (!this.modelStats.has(modelId)) {
        this.modelStats.set(modelId, {
          bans: 0,
          cooldowns: 0,
          flags: 0,
          lastEvent: null,
          reasons: [],
          providers: new Set()
        });
      }
      const mStat = this.modelStats.get(modelId);
      mStat.lastEvent = { type, reason, timestamp: now, sequence };
      if (provider) mStat.providers.add(provider);

      if (type === EVENT_TYPES.BAN_MODEL) {
        mStat.bans++;
        mStat.reasons.push({ type: 'ban', reason, timestamp: now });
      } else if (type === EVENT_TYPES.COOLDOWN_MODEL) {
        mStat.cooldowns++;
        mStat.reasons.push({ type: 'cooldown', reason, timestamp: now });
      } else if (type === EVENT_TYPES.FLAG_PROVIDER) {
        mStat.flags++;
        mStat.reasons.push({ type: 'flag', reason, timestamp: now });
      }

      // Trim reasons array
      if (mStat.reasons.length > 50) {
        mStat.reasons = mStat.reasons.slice(-50);
      }
    }

    // Update per-provider stats
    if (provider) {
      if (!this.providerStats.has(provider)) {
        this.providerStats.set(provider, {
          bans: 0,
          cooldowns: 0,
          flags: 0,
          paidGroupBans: 0,
          lastEvent: null,
          reasons: [],
          modelsBanned: new Set()
        });
      }
      const pStat = this.providerStats.get(provider);
      pStat.lastEvent = { type, reason, timestamp: now, sequence };

      if (type === EVENT_TYPES.BAN_MODEL && modelId) {
        pStat.bans++;
        pStat.modelsBanned.add(modelId);
        pStat.reasons.push({ type: 'ban', modelId, reason, timestamp: now });
      } else if (type === EVENT_TYPES.BAN_PROVIDER) {
        pStat.bans++;
        pStat.reasons.push({ type: 'ban-provider', reason, timestamp: now });
      } else if (type === EVENT_TYPES.BAN_PAID_GROUP) {
        pStat.paidGroupBans++;
        pStat.reasons.push({ type: 'paid-group-ban', reason, timestamp: now });
      } else if (type === EVENT_TYPES.COOLDOWN_MODEL) {
        pStat.cooldowns++;
        pStat.reasons.push({ type: 'cooldown', modelId, reason, timestamp: now });
      } else if (type === EVENT_TYPES.COOLDOWN_PROVIDER) {
        pStat.cooldowns++;
        pStat.reasons.push({ type: 'cooldown-provider', reason, timestamp: now });
      } else if (type === EVENT_TYPES.FLAG_PROVIDER) {
        pStat.flags++;
        pStat.reasons.push({ type: 'flag', reason, timestamp: now });
      }

      // Trim reasons array
      if (pStat.reasons.length > 50) {
        pStat.reasons = pStat.reasons.slice(-50);
      }
    }
  }

  /**
   * Reset hourly windowed counters.
   * @private
   */
  _resetWindowedCounters() {
    this.windowedCounters.bansLastHour = 0;
    this.windowedCounters.cooldownsLastHour = 0;
    this.windowedCounters.criticalFailuresLastHour = 0;
  }

  /**
   * Get overall statistics summary.
   * @returns {Object}
   */
  getStats() {
    return {
      counters: {
        totalBans: this.counters.totalBans,
        totalCooldowns: this.counters.totalCooldowns,
        totalFlags: this.counters.totalFlags,
        totalPaidGroupBans: this.counters.totalPaidGroupBans,
        totalCriticalFailures: this.counters.totalCriticalFailures,
        totalDegradations: this.counters.totalDegradations,
        uniqueModelsBanned: this.counters.modelsBanned.size,
        uniqueProvidersBanned: this.counters.providersBanned.size,
        uniqueProvidersCooldown: this.counters.providersCooldown.size,
        uniqueProvidersFlagged: this.counters.providersFlagged.size
      },
      windowed: {
        bansLastHour: this.windowedCounters.bansLastHour,
        cooldownsLastHour: this.windowedCounters.cooldownsLastHour,
        criticalFailuresLastHour: this.windowedCounters.criticalFailuresLastHour
      },
      models: this.getModelStats(),
      providers: this.getProviderStats(),
      recentEvents: this.getRecentEvents(50),
      eventCount: this.eventHistory.length
    };
  }

  /**
   * Get statistics for all tracked models.
   * @returns {Array} Array of { modelId, ...stats }
   */
  getModelStats() {
    const result = [];
    for (const [modelId, stats] of this.modelStats) {
      result.push({
        modelId,
        bans: stats.bans,
        cooldowns: stats.cooldowns,
        flags: stats.flags,
        lastEvent: stats.lastEvent,
        reasons: stats.reasons.slice(-10),
        providers: Array.from(stats.providers)
      });
    }
    // Sort by most recent event first
    result.sort((a, b) => {
      if (!a.lastEvent) return 1;
      if (!b.lastEvent) return -1;
      return b.lastEvent.timestamp - a.lastEvent.timestamp;
    });
    return result;
  }

  /**
   * Get statistics for all tracked providers.
   * @returns {Array} Array of { provider, ...stats }
   */
  getProviderStats() {
    const result = [];
    for (const [provider, stats] of this.providerStats) {
      result.push({
        provider,
        bans: stats.bans,
        cooldowns: stats.cooldowns,
        flags: stats.flags,
        paidGroupBans: stats.paidGroupBans,
        lastEvent: stats.lastEvent,
        reasons: stats.reasons.slice(-10),
        modelsBanned: Array.from(stats.modelsBanned)
      });
    }
    // Sort by most recent event first
    result.sort((a, b) => {
      if (!a.lastEvent) return 1;
      if (!b.lastEvent) return -1;
      return b.lastEvent.timestamp - a.lastEvent.timestamp;
    });
    return result;
  }

  /**
   * Get recent events in reverse chronological order (newest first).
   * @param {number} limit - Maximum number of events
   * @returns {Array}
   */
  getRecentEvents(limit = 50) {
    return this.eventHistory.slice(0, limit);
  }

  /**
   * Get stats for a specific model.
   * @param {string} modelId
   * @returns {Object|null}
   */
  getModelStat(modelId) {
    if (!this.modelStats.has(modelId)) return null;
    const stats = this.modelStats.get(modelId);
    return {
      modelId,
      bans: stats.bans,
      cooldowns: stats.cooldowns,
      flags: stats.flags,
      lastEvent: stats.lastEvent,
      reasons: stats.reasons.slice(-10),
      providers: Array.from(stats.providers)
    };
  }

  /**
   * Get stats for a specific provider.
   * @param {string} provider
   * @returns {Object|null}
   */
  getProviderStat(provider) {
    if (!this.providerStats.has(provider)) return null;
    const stats = this.providerStats.get(provider);
    return {
      provider,
      bans: stats.bans,
      cooldowns: stats.cooldowns,
      flags: stats.flags,
      paidGroupBans: stats.paidGroupBans,
      lastEvent: stats.lastEvent,
      reasons: stats.reasons.slice(-10),
      modelsBanned: Array.from(stats.modelsBanned)
    };
  }

  /**
   * Shutdown the aggregator (clear timers).
   */
  shutdown() {
    if (this._windowTimer) {
      clearInterval(this._windowTimer);
      this._windowTimer = null;
    }
    const events = createPunishmentEvents();
    events.removeAllListeners('event');
  }
}

/**
 * Singleton instance.
 */
let aggregatorInstance = null;

/**
 * Get or create the singleton StatsAggregator instance.
 * @param {Object} options
 * @returns {StatsAggregator}
 */
export function getStatsAggregator(options) {
  if (!aggregatorInstance) {
    aggregatorInstance = new StatsAggregator(options);
  }
  return aggregatorInstance;
}

/**
 * Shutdown the singleton instance.
 */
export function shutdownStatsAggregator() {
  if (aggregatorInstance) {
    aggregatorInstance.shutdown();
    aggregatorInstance = null;
  }
}
