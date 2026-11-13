/**
 * Structured logger for the OmniRoute Bandit Proxy.
 *
 * Outputs JSON lines with timestamp, level, and structured context fields.
 * Falls back to plain console.log when structured output is not desired
 * (e.g. when STRUCTURED_LOG env var is not set to "true").
 *
 * Usage:
 *   import { log } from "./structured-logger.mjs";
 *   log("info", "Model selected", { model, provider, score, tier });
 *   log("warn", "Fallback triggered", { model, fallbackModel, attempt });
 *   log("error", "Upstream error", { model, status, error: txt.slice(0, 200) });
 */

const ENABLED = String(process.env.STRUCTURED_LOG || "").toLowerCase() === "true";

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const MIN_LEVEL = LEVELS[
  String(process.env.STRUCTURED_LOG_LEVEL || "info").toLowerCase()
] || LEVELS.info;

/**
 * Emit a structured log line.
 * @param {string} level - "debug" | "info" | "warn" | "error"
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
 * Convenience wrappers for each level.
 */
export const debug = (message, ctx = {}) => log("debug", message, ctx);
export const info = (message, ctx = {}) => log("info", message, ctx);
export const warn = (message, ctx = {}) => log("warn", message, ctx);
export const error = (message, ctx = {}) => log("error", message, ctx);
