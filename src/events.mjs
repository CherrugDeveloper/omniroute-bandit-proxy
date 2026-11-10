/**
 * High-priority event system for critical punishment events.
 * Bypasses log buffer polling to deliver immediate visibility
 * for ban/cooldown events to the dashboard.
 * 
 * Based on AGENTS.md rules:
 * - 3-strike system: Aggressive punishment for critical failures (403, 429, timeout, safeWrite errors)
 * - Permanent ban after 3 consecutive critical failures (paid models punished as group)
 * - Exponential backoff cooldowns (15s→5m→30m→2h→permanent)
 */

import { EventEmitter } from 'node:events';

/**
 * Event types for punishment/consequence notifications
 */
export const EVENT_TYPES = {
  BAN_PROVIDER: 'ban-provider',
  BAN_MODEL: 'ban-model',
  BAN_PAID_GROUP: 'ban-paid-group',
  COOLDOWN_PROVIDER: 'cooldown-provider',
  COOLDOWN_MODEL: 'cooldown-model',
  FLAG_PROVIDER: 'flag-provider',
  DEGRADED_MODEL: 'degraded',
  CRITICAL_FAILURE: 'critical-failure'
};

/**
 * Creates a singleton event emitter for punishment events
 * @returns {EventEmitter}
 */
export function createPunishmentEvents() {
  if (!globalThis.__punishmentEvents__) {
    globalThis.__punishmentEvents__ = new EventEmitter();
  }
  return globalThis.__punishmentEvents__;
}

/**
 * Emits a high-priority ban event for immediate dashboard visibility
 * @param {Object} event - Event data
 * @param {string} event.type - Event type from EVENT_TYPES
 * @param {string} event.provider - Provider name
 * @param {string} [event.modelId] - Model ID (if applicable)
 * @param {string} event.reason - Reason for the ban/cooldown
 * @param {number} event.cooldownMs - Cooldown duration in milliseconds
 * @param {number} event.failures - Total failure count
 * @param {number} [event.consecutive] - Consecutive critical failures
 * @param {object} [event.context] - Additional context
 */
export function emitPunishmentEvent(event) {
  const events = createPunishmentEvents();
  events.emit('punishment', event);
}

/**
 * Creates a WebSocket-compatible event payload for dashboard clients
 * @param {Object} event - Raw event data
 * @returns {Object} Formatted event for WS transmission
 */
export function formatEventPayload(event) {
  return {
    type: 'punishment',
    subtype: event.type,
    timestamp: Date.now(),
    provider: event.provider,
    modelId: event.modelId || null,
    reason: event.reason,
    cooldownMs: event.cooldownMs || 0,
    failures: event.failures,
    consecutive: event.consecutive || 0,
    context: event.context || {}
  };
}

/**
 * Classifies an error as critical for the 3-strike system
 * Based on AGENTS.md: 403 forbidden, 429 rate limit, timeout, safeWrite errors
 * @param {number} statusCode 
 * @param {string} message 
 * @param {object} errorDetails 
 * @returns {boolean}
 */
export function isCriticalFailure(statusCode, message = '', errorDetails = {}) {
  const msg = message || errorDetails.message || '';
  
  // 403 Forbidden - account disabled, banned, key limit exceeded
  if (statusCode === 403) {
    return /account disabled|banned|suspended|key limit exceeded|does not reset|never resets/i.test(msg);
  }
  
  // 429 Rate Limit - model_cooldown code or cooling down
  if (statusCode === 429) {
    return /model_cooldown|cooling down/i.test(msg);
  }
  
  // Timeout errors
  if (/fetch timeout|timeout/i.test(msg)) {
    return true;
  }
  
  // safeWrite errors (OpenCode-specific)
  if (/safeWrite|cannot access safeWrite|safeWrite before initialization|safeWrite is not initialized/i.test(msg)) {
    return true;
  }
  
  return false;
}

/**
 * Logs a punishment event to the console for immediate visibility
 * Also broadcasts to connected dashboard clients via WebSocket
 * Persists to database if bandit instance is provided
 * @param {Object} params
 * @param {Object} [params.bandit] - Optional bandit instance for DB persistence
 */
export function logPunishment({ bandit, type, provider, modelId, reason, cooldownMs, failures, consecutive }) {
  const timestamp = new Date().toISOString();
  let logLine;

  if (type === EVENT_TYPES.BAN_PROVIDER) {
    logLine = `[BANDIT-3STRIKE] BAN-PROVIDER | provider=${provider} | ${reason} | failures=${failures}`;
  } else if (type === EVENT_TYPES.BAN_MODEL) {
    logLine = `[BANDIT-EMERGENCY] BAN-MODEL | model=${modelId} | ${reason} | failures=${failures}`;
  } else if (type === EVENT_TYPES.BAN_PAID_GROUP) {
    logLine = `[BANDIT-3STRIKE] PAID-GROUP-BAN | provider=${provider} | 3 consecutive critical failures | model=${modelId}`;
  } else if (type === EVENT_TYPES.COOLDOWN_PROVIDER) {
    logLine = `[BANDIT] cooldown-provider | provider=${provider} | ${reason} | ${Math.round(cooldownMs/1000)}s | failures=${failures}`;
  } else if (type === EVENT_TYPES.COOLDOWN_MODEL) {
    logLine = `[BANDIT] cooldown-model | model=${modelId} | ${reason} | ${Math.round(cooldownMs/1000)}s | failures=${failures}`;
  } else if (type === EVENT_TYPES.FLAG_PROVIDER) {
    logLine = `[BANDIT] flag-provider | provider=${provider} | ${reason}`;
  } else if (type === EVENT_TYPES.CRITICAL_FAILURE) {
    logLine = `[BANDIT-3STRIKE] CRITICAL | model=${modelId} | status=X | reason=${reason} | consecutive=${consecutive}/3`;
  } else {
    logLine = `[BANDIT] ${type} | provider=${provider} | model=${modelId} | ${reason}`;
  }

  console.log(logLine);
  
  // Persist to database if bandit instance is available
  if (bandit) {
    bandit.recordPunishmentEvent(type, provider, modelId, reason, cooldownMs, failures, consecutive);
  }
  
  // Emit for WebSocket subscribers
  const events = createPunishmentEvents();
  events.emit('event', formatEventPayload({ type, provider, modelId, reason, cooldownMs, failures, consecutive }));
}