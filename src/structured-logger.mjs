/**
 * Structured logger for the OmniRoute Bandit Proxy.
 *
 * Outputs JSON lines with timestamp, level, and structured context fields.
 * Falls back to plain console.log when structured output is not desired
 * (e.g. when STRUCTURED_LOG env var is not set to "true").
 *
 * Usage:
 *   import { log, detailed } from "./structured-logger.mjs";
 *   log("info", "Model selected", { model, provider, score, tier });
 *   log("warn", "Fallback triggered", { model, fallbackModel, attempt });
 *   log("error", "Upstream error", { model, status, error: txt.slice(0, 200) });
 *   detailed("punishment", { modelId, provider, action, reason, cooldownMs, stack: err.stack });
 */

const ENABLED = String(process.env.STRUCTURED_LOG || "").toLowerCase() === "true";

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  detailed: 50,  // New level for detailed punishment/debug logging
};

const MIN_LEVEL = LEVELS[
  String(process.env.STRUCTURED_LOG_LEVEL || process.env.LOG_LEVEL || "info").toLowerCase()
] || LEVELS.info;

/**
 * Emit a structured log line.
 * @param {string} level - "debug" | "info" | "warn" | "error" | "detailed"
 * @param {string} message - Human-readable message
 * @param {Object} [ctx] - Additional structured context (will be JSON-serialized)
 */
export function log(level, message, ctx = {}) {
  const levelNum = LEVELS[level] || LEVELS.info;
  if (levelNum < MIN_LEVEL) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    message,
    ...ctx,
  };

  if (ENABLED) {
    console.log(JSON.stringify(entry));
  } else {
    // Fallback: human-readable single-line format
    const ctxStr = Object.keys(ctx).length
      ? " " +
        Object.entries(ctx)
          .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
          .join(" ")
      : "";
    console.log(`[${entry.timestamp}] [${entry.level}] ${message}${ctxStr}`);
  }
}

/**
 * Emit a detailed structured log entry for punishment/decision logging.
 * Format: JSON with timestamp, level, component, modelId, provider, action, reason, cooldownMs, and optionally stack.
 * @param {string} component - Action type: "punishment" | "reset" | "fallback"
 * @param {Object} ctx - Context object with modelId, provider, action, reason, cooldownMs, stack (optional)
 */
export function detailed(component, ctx = {}) {
  if (LEVELS.detailed < MIN_LEVEL) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level: "DETAILED",
    component,
    ...ctx,
  };

  if (ENABLED) {
    console.log(JSON.stringify(entry));
  } else {
    // Fallback: human-readable single-line format
    const { timestamp, level, component, action, modelId, provider, reason, cooldownMs, stack } = entry;
    const parts = [];
    if (timestamp) parts.push(`ts=${timestamp}`);
    if (level) parts.push(`level=${level}`);
    if (component) parts.push(`component=${component}`);
    if (action) parts.push(`action=${action}`);
    if (modelId) parts.push(`modelId=${modelId}`);
    if (provider) parts.push(`provider=${provider}`);
    if (reason) parts.push(`reason=${reason}`);
    if (cooldownMs !== undefined) parts.push(`cooldownMs=${cooldownMs}`);
    const mainMsg = `[${parts.join(' ')}]`;
    console.log(`${mainMsg}`);
  }
}

/**
 * Convenience wrappers for each level.
 */
export const debug = (message, ctx = {}) => log("debug", message, ctx);
export const info = (message, ctx = {}) => log("info", message, ctx);
export const warn = (message, ctx = {}) => log("warn", message, ctx);
export const error = (message, ctx = {}) => log("error", message, ctx);