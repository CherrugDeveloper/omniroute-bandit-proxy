// WebSocket reconnection logic for punishment events endpoint (ws://127.0.0.1:8080/v1/events/punishment)
// Exponential backoff: 15s → 5m → 30m → 2h → permanent
let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 4; // 15s, 5m, 30m, 2h

function calculateBackoffDelay(attempt) {
  const delays = [15, 300, 1800, 7200]; // seconds: 15s, 5m, 30m, 2h
  if (attempt < MAX_RECONNECT_ATTEMPTS) {
    return delays[attempt];
  }
  return delays[MAX_RECONNECT_ATTEMPTS - 1]; // cap at 2h
}

function connectToPunishmentEvents() {
  ws = new WebSocket('ws://127.0.0.1:8080/v1/events/punishment');
  
  ws.onopen = () => {
    console.log('[Punishment WS] Connected');
    reconnectAttempts = 0; // reset on successful connection
  };

  ws.onclose = () => {
    console.log('[Punishment WS] Disconnected, attempting reconnect...');
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = calculateBackoffDelay(reconnectAttempts);
      console.log(`[Punishment WS] Reconnecting in ${delay} seconds (attempt ${reconnectAttempts + 1})`);
      setTimeout(() => {
        reconnectAttempts++;
        connectToPunishmentEvents();
      }, delay * 1000);
    } else {
      console.log('[Punishment WS] Permanent disconnection - maximum reconnection attempts reached');
    }
  };

  ws.onerror = (error) => {
    console.error('[Punishment WS] Error:', error.message);
    ws.close(); // Trigger onclose to schedule reconnect
  };

  ws.onmessage = (event) => {
    const eventData = JSON.parse(event.data);
    // Process punishment event data (existing logic would go here if needed)
    // For now, we just log that we received an event
    console.log('[Punishment WS] Received event', eventData);
  };
}

// WebSocket connection initialized lazily by the server process, not on module load
// connectToPunishmentEvents() should only be called from src/index.mjs when the backend server starts
// This prevents test environments from hanging due to pending setTimeout reconnection attempts

// Rest of the existing file content follows...
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
import { info as slogInfo, error as slogError } from "./structured-logger.mjs";
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

const MAX_EVENT_BUFFER = 1000;
const eventBuffer = [];
let eventSequence = 0;

export function initializeEventBuffer(bandit) {
  if (!bandit || typeof bandit.getRecentPunishmentEvents !== 'function') {
    return;
  }
  try {
    const rows = bandit.getRecentPunishmentEvents(MAX_EVENT_BUFFER);
    eventBuffer.length = 0;
    for (const row of rows) {
      eventBuffer.push({
        type: row.type,
        provider: row.provider,
        modelId: row.modelId,
        reason: row.reason,
        cooldownMs: row.cooldownMs || 0,
        failures: row.failures || 0,
        consecutive: row.consecutive || 0,
        source: row.source || 'prod',
        timestamp: row.timestamp || Date.now(),
        isoTimestamp: new Date(row.timestamp || Date.now()).toISOString(),
        sequence: ++eventSequence,
      });
    }
    eventBuffer.sort((a, b) => b.timestamp - a.timestamp);
    if (eventBuffer.length > MAX_EVENT_BUFFER) {
      eventBuffer.length = MAX_EVENT_BUFFER;
    }
    if (eventBuffer.length > 0) {
      eventSequence = Math.max(...eventBuffer.map(e => e.sequence));
    }
  } catch (err) {
    slogError("[EVENTS] Failed to initialize event buffer from DB:", err.message);
  }
}

export function createPunishmentEvents() {
  if (!globalThis.__punishmentEvents__) {
    globalThis.__punishmentEvents__ = new EventEmitter();
  }
  return globalThis.__punishmentEvents__;
}

export function emitPunishmentEvent(event) {
  const events = createPunishmentEvents();
  events.emit('punishment', event);
}

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

export function isCriticalFailure(statusCode, message = '', errorDetails = {}) {
  const msg = message || errorDetails.message || '';
  
  if (statusCode === 403) {
    return /account disabled|banned|suspended|key limit exceeded|does not reset|never resets/i.test(msg);
  }
  
  if (statusCode === 429) {
    return /model_cooldown|cooling down/i.test(msg);
  }
  
  return false;
}

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
  
  slogInfo(logLine);
  
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

export function getRecentEvents(limit = 100) {
  return eventBuffer.slice(0, limit).map(e => formatEventPayload(e));
}

export function getEventCount() {
  return eventBuffer.length;
}

export function getNextSequence() {
  return eventSequence + 1;
}

export function clearEventBuffer() {
  eventBuffer.length = 0;
  eventSequence = 0;
}