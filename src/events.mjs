/**
 * High-priority event system for critical punishment events.
 * Bypasses log buffer polling to deliver immediate visibility
 * for ban/cooldown events to the dashboard.
 *
 * Based on AGENTS.md rules:
 * - 3-strike system: Aggressive punishment for critical failures (403, 429, timeout, safeWrite errors)
 * - Permanent ban after 5 consecutive critical failures (paid models punished as group)
 * - Exponential backoff cooldowns (15s→5m→30m→2h→permanent)
 *
 * Reverse chronological logging: events are stored in a ring buffer and
 * can be retrieved in reverse chronological order (newest first).
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
 * Maximum number of events to keep in the reverse-chronological ring buffer.
 * Dashboard reads from this buffer for real-time history display.
 */
const MAX_EVENT_BUFFER = 1000;

/**
 * Global ring buffer of punishment events, newest first.
 * Each event has a monotonically increasing sequence number.
 */
const eventBuffer = [];
let eventSequence = 0;

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
 * @param {number} [event.sequence] - Monotonic sequence number for ordering
 * @returns {Object} Formatted event for WS transmission
 */
export function formatEventPayload(event) {
  return {
    type: 'punishment',
    subtype: event.type,
    timestamp: event.timestamp || Date.now(),
    sequence: event.sequence,
    provider: event.provider,
    modelId: event.modelId || null,
    reason: event.reason,
    cooldownMs: event.cooldownMs || 0,
    failures: event.failures,
    consecutive: event.consecutive || 0,
    source: event.source || 'prod',
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
  
  // Timeout errors are classified as transient (cooldown-model), not critical.
  // Removed timeout as critical failure to be consistent with bandit.mjs _isCriticalFailure().
  
  // safeWrite errors are now classified as transient (cooldown-model), not critical.
  // SafeWrite is an infrastructure initialization error, not a model fault.
  
  return false;
}

/**
 * Logs a punishment event to the console for immediate visibility
 * Also broadcasts to connected dashboard clients via WebSocket
 * Persists to database if bandit instance is provided
 * Events are stored in a ring buffer for reverse-chronological retrieval.
 * @param {Object} params
 * @param {Object} [params.bandit] - Optional bandit instance for DB persistence
 * @param {number} [params.sequence] - Optional pre-assigned sequence number
 */
export function logPunishment({ bandit, type, provider, modelId, reason, cooldownMs, failures, consecutive, source = 'prod', sequence }) {
  const timestamp = Date.now();
  const isoTimestamp = new Date(timestamp).toISOString();
  const seq = sequence !== undefined ? sequence : ++eventSequence;
  let logLine;

  if (type === EVENT_TYPES.BAN_PROVIDER) {
    logLine = `[BANDIT-3STRIKE] BAN-PROVIDER | provider=${provider} | ${reason} | failures=${failures}`;
  } else if (type === EVENT_TYPES.BAN_MODEL) {
    logLine = `[BANDIT-EMERGENCY] BAN-MODEL | model=${modelId} | ${reason} | failures=${failures}`;
  } else if (type === EVENT_TYPES.BAN_PAID_GROUP) {
    logLine = `[BANDIT-3STRIKE] PAID-GROUP-BAN | provider=${provider} | 5 consecutive critical failures | model=${modelId}`;
  } else if (type === EVENT_TYPES.COOLDOWN_PROVIDER) {
    logLine = `[BANDIT] cooldown-provider | provider=${provider} | ${reason} | ${Math.round(cooldownMs/1000)}s | failures=${failures}`;
  } else if (type === EVENT_TYPES.COOLDOWN_MODEL) {
    logLine = `[BANDIT] cooldown-model | model=${modelId} | ${reason} | ${Math.round(cooldownMs/1000)}s | failures=${failures}`;
  } else if (type === EVENT_TYPES.FLAG_PROVIDER) {
    logLine = `[BANDIT] flag-provider | provider=${provider} | ${reason}`;
  } else if (type === EVENT_TYPES.CRITICAL_FAILURE) {
    logLine = `[BANDIT-3STRIKE] CRITICAL | model=${modelId} | status=X | reason=${reason} | consecutive=${consecutive}/5`;
  } else {
    logLine = `[BANDIT] ${type} | provider=${provider} | model=${modelId} | ${reason}`;
  }

  console.log(logLine);

  // Build event record for ring buffer
  const eventRecord = {
    type,
    provider,
    modelId,
    reason,
    cooldownMs: cooldownMs || 0,
    failures: failures || 0,
    consecutive: consecutive || 0,
    source,
    timestamp,
    isoTimestamp,
    sequence: seq
  };

  // Insert at front of buffer (newest first) - reverse chronological order
  eventBuffer.unshift(eventRecord);
  if (eventBuffer.length > MAX_EVENT_BUFFER) {
    eventBuffer.pop();
  }

  // Persist to database if bandit instance is available
  if (bandit) {
    bandit.recordPunishmentEvent(type, provider, modelId, reason, cooldownMs, failures, consecutive, source);
  }

  // Emit for WebSocket subscribers (newest first ordering)
  const events = createPunishmentEvents();
  events.emit('event', formatEventPayload({ ...eventRecord, sequence: seq }));
}

/**
 * Retrieves punishment events in reverse chronological order (newest first).
 * @param {number} limit - Maximum number of events to return
 * @returns {Array} Array of event payloads, newest first
 */
export function getRecentEvents(limit = 100) {
  return eventBuffer.slice(0, limit).map(e => formatEventPayload(e));
}

/**
 * Returns the total count of events in the buffer.
 * @returns {number}
 */
export function getEventCount() {
  return eventBuffer.length;
}

/**
 * Returns the current sequence number (for assigning to new events).
 * @returns {number}
 */
export function getNextSequence() {
  return eventSequence + 1;
}

/**
 * Clears the event buffer (useful for testing or reset).
 */
export function clearEventBuffer() {
  eventBuffer.length = 0;
  eventSequence = 0;
}