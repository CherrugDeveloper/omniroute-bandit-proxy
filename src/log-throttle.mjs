/**
 * Shared throttling + log-filtering helpers for the OmniRoute Bandit Proxy.
 *
 * These small, side-effect-free utilities are extracted from src/index.mjs so
 * that the polling-noise behaviour can be unit-tested without booting the
 * whole Express server (which would otherwise open the SQLite database and
 * register hundreds of routes).
 *
 * Four concerns live here:
 *   1. createThrottledLogger() — the `{ lastLogAt, suppressed }` pattern that
 *      previously existed twice (dashboard-stats and /v1/models) with two
 *      different windows and inconsistent defaults.  Now there is ONE factory
 *      and both call sites use it.
 *   2. isLowValueNoise() — the ring-buffer denylist predicate that decides
 *      whether a console line is cheap enough to skip from the in-memory
 *      `logBuffer` (which backs the dashboard Logs tab at /v1/logs).
 *   3. createTtlFlag() — the TTL-bounded `debugVerbose` flag (R2).  A flag that
 *      is switched on automatically expires so that a forgotten `/v1/debug/
 *      toggle` cannot keep the server in verbose mode forever.
 *   4. isPollingPath() — the list of dashboard-polled API routes whose access
 *      log lines are low-value noise (R5).
 */

/**
 * Default TTL applied to the verbose debug flag: 15 minutes.
 * @type {number}
 */
export const DEFAULT_DEBUG_VERBOSE_TTL_MS = 900000;

/**
 * Build a throttled-logger state machine.
 *
 * The returned `decide(message, now = Date.now())` returns an object describing
 * what to do:
 *   - { log: true,  message, suppressed } → emit this line now
 *   - { log: false, suppressed: N }      → suppress; N is the running count of
 *                                         suppressed calls since the last emit
 *
 * When the throttle window elapses, the caller is responsible for emitting a
 * single summary line that includes the suppressed count.  The convention
 * used throughout this codebase is the suffix:
 *
 *     ` (soppresse ${N} richieste precedenti)`
 *
 * which is exactly what the original two call sites appended.
 *
 * @param {string} _key        Unused but kept for API symmetry / future stats.
 * @param {number} windowMs    Milliseconds between allowed log emissions.
 * @returns {{ decide: Function, getState: Function }}
 */
export function createThrottledLogger(_key, windowMs) {
  const state = { lastLogAt: 0, suppressed: 0 };

  /**
   * @param {string} message
   * @param {number} [now=Date.now()]
   * @returns {{ log: boolean, message?: string, suppressed: number }}
   */
  const decide = (message, now = Date.now()) => {
    if (now - state.lastLogAt >= windowMs) {
      const suppressed = state.suppressed;
      state.lastLogAt = now;
      state.suppressed = 0;
      return { log: true, message, suppressed };
    }
    state.suppressed++;
    return { log: false, suppressed: state.suppressed };
  };

  return { decide, getState: () => ({ ...state }) };
}

/**
 * Regex that matches the low-value polling-noise lines we want to keep OUT of
 * the in-memory ring buffer while STILL writing them to the terminal/stdout.
 *
 * Groups (case-sensitive, matching the exact prefixes used in src/index.mjs):
 *   - [CORS/DEBUG]        — the per-request CORS middleware line (R1)
 *   - [DEBUG AUTH]        — the per-request requireAuth line (R2)
 *   - [DEBUG server]      — the per-poll /v1/dashboard/stats line (R3)
 *   - [PROXY]             — the per-request access log line
 *
 * The denylist is intentionally narrow: real production events ([ERROR],
 * [WARN], [UPSTREAM], [BANDIT], [FALLBACK], [AFFINITY], [SUCCESS], …) must
 * still land in the ring buffer so they are visible in the dashboard Logs
 * tab.
 *
 * @param {string} message
 * @param {RegExp} [denylistRegex]
 * @returns {boolean}
 */
export function isLowValueNoise(message, denylistRegex) {
  if (typeof message !== 'string') return false;
  const pattern = denylistRegex || DEFAULT_DENYLIST_REGEX;
  return pattern.test(message);
}

/**
 * Default denylist.  Overridable at runtime via the LOG_BUFFER_DENYLIST env
 * var (a list of `|`-separated literal prefixes, e.g.
 * `CORS/DEBUG|DEBUG AUTH|DEBUG server|PROXY`).
 * @type {RegExp}
 */
export const DEFAULT_DENYLIST_REGEX = /^\[(CORS\/DEBUG|DEBUG AUTH|DEBUG server|PROXY)\]/;

/**
 * Build a denylist RegExp from a user-supplied string.
 *
 * The string is a list of `|`-separated literal prefixes (NOT a full regex —
 * we anchor each one with `^\[` automatically to avoid accidental partial
 * matches).  Empty/falsy input falls back to the default.
 *
 * @param {string} [raw]
 * @returns {RegExp}
 */
export function buildDenylistRegex(raw) {
  if (!raw || typeof raw !== 'string' || raw.trim() === '') {
    return DEFAULT_DENYLIST_REGEX;
  }
  const parts = raw.split('|').map(s => s.trim()).filter(Boolean).map(escapeRegExp);
  if (parts.length === 0) return DEFAULT_DENYLIST_REGEX;
  return new RegExp('^\\[(' + parts.join('|') + ')\\]');
}

/**
 * Escape a string so it can be safely embedded inside a RegExp literal.
 * @param {string} s
 * @returns {string}
 */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True when an environment flag is explicitly enabled.
 *
 * Only the exact string "true" enables a flag — everything else (including
 * "1", "yes", "TRUE" with different case) stays off, so a typo can never
 * silently turn on verbose logging.
 *
 * @param {string|undefined} raw
 * @returns {boolean}
 */
export function isEnvFlagEnabled(raw) {
  return raw === 'true';
}

/**
 * R1 — is the per-request CORS/DEBUG log line enabled?
 * Opt-in via CORS_DEBUG=true; silent by default.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isCorsDebugEnabled(env = process.env) {
  return isEnvFlagEnabled(env.CORS_DEBUG);
}

/**
 * R2 — is the verbose debug mode seeded on at boot?
 * Opt-in via DEBUG_VERBOSE=true; off by default.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isDebugVerboseEnabled(env = process.env) {
  return isEnvFlagEnabled(env.DEBUG_VERBOSE);
}

/**
 * R2 — read the TTL (ms) after which the verbose debug flag auto-expires.
 * Falls back to DEFAULT_DEBUG_VERBOSE_TTL_MS (15 min) for missing/invalid
 * values.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number}
 */
export function readDebugVerboseTtlMs(env = process.env) {
  const parsed = parseInt(env.DEBUG_VERBOSE_TTL_MS || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_DEBUG_VERBOSE_TTL_MS;
  return parsed;
}

/**
 * R2 — a boolean flag that expires automatically.
 *
 * The flag starts in the requested state and is switched on/off explicitly via
 * set().  Once enabled it stays active for at most `ttlMs` milliseconds; after
 * that isActive() returns false (and latches the flag off) until set() is
 * called again.
 *
 * @param {boolean} initialEnabled
 * @param {number} ttlMs
 * @param {() => number} [nowFn=Date.now]
 * @returns {{ isActive: Function, set: Function, isEnabled: Function }}
 */
export function createTtlFlag(initialEnabled, ttlMs, nowFn = Date.now) {
  let enabled = !!initialEnabled;
  let setAt = enabled ? nowFn() : 0;

  const isActive = () => {
    if (!enabled) return false;
    if (nowFn() - setAt >= ttlMs) {
      enabled = false;
      setAt = 0;
      return false;
    }
    return true;
  };

  const set = (value) => {
    enabled = !!value;
    setAt = enabled ? nowFn() : 0;
    return enabled;
  };

  return { isActive, set, isEnabled: () => enabled };
}

/**
 * R5 — API routes polled by the dashboard.  Access-log lines for these routes
 * are pure noise (the dashboard polls them once per second), so they are not
 * emitted as `[PROXY] ...` lines.
 *
 * NOTE: real proxy traffic (/v1/chat/completions, /v1/images/generations) is
 * deliberately NOT in this list — it must always be logged.
 *
 * @type {string[]}
 */
export const POLLING_PATH_PREFIXES = [
  "/v1/metrics",
  "/v1/logs",
  "/v1/active",
  "/v1/modes",
  "/v1/models",
  "/v1/models/summary",
  "/v1/debug/status",
  "/v1/inflight",
  "/v1/dashboard/stats",
  "/v1/consideration",
  "/v1/quota",
  "/v1/providers",
  "/v1/sessions",
  "/v1/health-check/status",
];

/**
 * R5 — is this request path a dashboard polling route?
 * @param {string} path
 * @returns {boolean}
 */
export function isPollingPath(path) {
  if (typeof path !== 'string' || path === '') return false;
  return POLLING_PATH_PREFIXES.some(prefix => path.startsWith(prefix));
}
