import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  createThrottledLogger,
  isLowValueNoise,
  DEFAULT_DENYLIST_REGEX,
  buildDenylistRegex,
  isEnvFlagEnabled,
  isCorsDebugEnabled,
  isDebugVerboseEnabled,
  readDebugVerboseTtlMs,
  createTtlFlag,
  isPollingPath,
  POLLING_PATH_PREFIXES,
} from "../src/log-throttle.mjs";

// ============================================================
// createThrottledLogger
// ============================================================
describe("createThrottledLogger", () => {
  test("first call within window is suppressed (lastLogAt starts at 0)", () => {
    const logger = createThrottledLogger("test", 1000);
    const result = logger.decide("hello", 0);
    assert.equal(result.log, false);
    assert.equal(result.suppressed, 1);
  });

  test("first call after window logs again", () => {
    const logger = createThrottledLogger("test", 1000);
    // First call at t=0 is suppressed (0-0=0 < 1000)
    logger.decide("hello", 0);
    // Calls within window are suppressed
    logger.decide("hello", 500);
    logger.decide("hello", 800);
    // After window elapses, logs again
    const r = logger.decide("hello", 1500);
    assert.equal(r.log, true);
    assert.equal(r.suppressed, 3); // reports how many were suppressed since last log
  });

  test("calls within window are suppressed", () => {
    const logger = createThrottledLogger("test", 1000);
    logger.decide("hello", 0); // first call suppressed
    const r2 = logger.decide("hello", 500);
    assert.equal(r2.log, false);
    assert.equal(r2.suppressed, 2);
    const r3 = logger.decide("hello", 800);
    assert.equal(r3.log, false);
    assert.equal(r3.suppressed, 3);
  });

  test("different keys have independent state", () => {
    const a = createThrottledLogger("a", 1000);
    const b = createThrottledLogger("b", 1000);
    a.decide("x", 0);
    a.decide("x", 100);
    const r = b.decide("y", 100);
    assert.equal(r.log, false);
    assert.equal(r.suppressed, 1); // b has its own counter
    assert.equal(a.getState().suppressed, 2); // a's counter is untouched by b
  });

  test("getState returns copy of internal state", () => {
    const logger = createThrottledLogger("test", 1000);
    logger.decide("x", 0);
    const s = logger.getState();
    assert.equal(s.lastLogAt, 0);
    assert.equal(s.suppressed, 1);
    // mutation of returned object does not affect internal state
    s.lastLogAt = 9999;
    const s2 = logger.getState();
    assert.equal(s2.lastLogAt, 0);
  });
});

// ============================================================
// isLowValueNoise / buildDenylistRegex
// ============================================================
describe("isLowValueNoise / buildDenylistRegex", () => {
  test("DEFAULT_DENYLIST_REGEX matches CORS/DEBUG", () => {
    assert.ok(DEFAULT_DENYLIST_REGEX.test("[CORS/DEBUG] Incoming GET /v1/models"));
  });

  test("DEFAULT_DENYLIST_REGEX matches DEBUG AUTH", () => {
    assert.ok(DEFAULT_DENYLIST_REGEX.test("[DEBUG AUTH] token missing"));
  });

  test("DEFAULT_DENYLIST_REGEX matches DEBUG server", () => {
    assert.ok(DEFAULT_DENYLIST_REGEX.test("[DEBUG server] /v1/dashboard/stats serving stats:"));
  });

  test("DEFAULT_DENYLIST_REGEX matches PROXY", () => {
    assert.ok(DEFAULT_DENYLIST_REGEX.test("[PROXY] POST /v1/chat/completions"));
  });

  test("DEFAULT_DENYLIST_REGEX does NOT match SUCCESS", () => {
    assert.ok(!DEFAULT_DENYLIST_REGEX.test("[SUCCESS] model in 1.23s"));
  });

  test("isLowValueNoise returns true for denylisted tags", () => {
    assert.ok(isLowValueNoise("[CORS/DEBUG] foo", DEFAULT_DENYLIST_REGEX));
    assert.ok(isLowValueNoise("[DEBUG AUTH] bar", DEFAULT_DENYLIST_REGEX));
    assert.ok(isLowValueNoise("[DEBUG server] baz", DEFAULT_DENYLIST_REGEX));
    assert.ok(isLowValueNoise("[PROXY] qux", DEFAULT_DENYLIST_REGEX));
  });

  test("isLowValueNoise returns false for non-denylisted tags", () => {
    assert.ok(!isLowValueNoise("[SUCCESS] foo", DEFAULT_DENYLIST_REGEX));
    assert.ok(!isLowValueNoise("[ERROR] bar", DEFAULT_DENYLIST_REGEX));
    assert.ok(!isLowValueNoise("plain message", DEFAULT_DENYLIST_REGEX));
  });

  test("buildDenylistRegex with empty string returns default", () => {
    const r = buildDenylistRegex("");
    assert.ok(r.test("[CORS/DEBUG] x"));
  });

  test("buildDenylistRegex with custom list overrides default", () => {
    const r = buildDenylistRegex("FOO|BAR");
    assert.ok(r.test("[FOO] something"));
    assert.ok(r.test("[BAR] something"));
    assert.ok(!r.test("[CORS/DEBUG] something")); // default no longer applies
  });

  test("buildDenylistRegex escapes regex metacharacters", () => {
    const r = buildDenylistRegex("A.B"); // dot should be literal
    assert.ok(r.test("[A.B] ok"));
    assert.ok(!r.test("[AXB] ok"));
  });
});

// ============================================================
// isEnvFlagEnabled / isCorsDebugEnabled / isDebugVerboseEnabled
// ============================================================
describe("env flag helpers", () => {
  test("isEnvFlagEnabled returns true only for 'true'", () => {
    assert.equal(isEnvFlagEnabled("true"), true);
    assert.equal(isEnvFlagEnabled("false"), false);
    assert.equal(isEnvFlagEnabled("1"), false);
    assert.equal(isEnvFlagEnabled(""), false);
    assert.equal(isEnvFlagEnabled(undefined), false);
  });

  test("isCorsDebugEnabled reads CORS_DEBUG", () => {
    assert.equal(isCorsDebugEnabled({ CORS_DEBUG: "true" }), true);
    assert.equal(isCorsDebugEnabled({ CORS_DEBUG: "false" }), false);
    assert.equal(isCorsDebugEnabled({}), false);
  });

  test("isDebugVerboseEnabled reads DEBUG_VERBOSE", () => {
    assert.equal(isDebugVerboseEnabled({ DEBUG_VERBOSE: "true" }), true);
    assert.equal(isDebugVerboseEnabled({ DEBUG_VERBOSE: "false" }), false);
    assert.equal(isDebugVerboseEnabled({}), false);
  });
});

// ============================================================
// readDebugVerboseTtlMs
// ============================================================
describe("readDebugVerboseTtlMs", () => {
  test("returns default when unset", () => {
    assert.equal(readDebugVerboseTtlMs({}), 900000);
  });

  test("returns default when invalid", () => {
    assert.equal(readDebugVerboseTtlMs({ DEBUG_VERBOSE_TTL_MS: "abc" }), 900000);
    assert.equal(readDebugVerboseTtlMs({ DEBUG_VERBOSE_TTL_MS: "0" }), 900000);
    assert.equal(readDebugVerboseTtlMs({ DEBUG_VERBOSE_TTL_MS: "-1" }), 900000);
  });

  test("returns parsed value when valid", () => {
    assert.equal(readDebugVerboseTtlMs({ DEBUG_VERBOSE_TTL_MS: "60000" }), 60000);
    assert.equal(readDebugVerboseTtlMs({ DEBUG_VERBOSE_TTL_MS: "123456" }), 123456);
  });
});

// ============================================================
// createTtlFlag
// ============================================================
describe("createTtlFlag", () => {
  test("starts disabled when initialEnabled=false", () => {
    const flag = createTtlFlag(false, 1000, () => 1000);
    assert.equal(flag.isActive(), false);
    assert.equal(flag.isEnabled(), false);
  });

  test("starts enabled when initialEnabled=true", () => {
    const flag = createTtlFlag(true, 1000, () => 1000);
    assert.equal(flag.isActive(), true);
    assert.equal(flag.isEnabled(), true);
  });

  test("expires after TTL", () => {
    let now = 1000;
    const flag = createTtlFlag(true, 1000, () => now);
    assert.equal(flag.isActive(), true);
    now = 2001; // past TTL
    assert.equal(flag.isActive(), false);
    assert.equal(flag.isEnabled(), false);
  });

  test("set(true) re-enables and resets timer", () => {
    let now = 1000;
    const flag = createTtlFlag(false, 1000, () => now);
    assert.equal(flag.isActive(), false);
    flag.set(true);
    assert.equal(flag.isActive(), true);
    now = 1500;
    assert.equal(flag.isActive(), true);
    now = 2001;
    assert.equal(flag.isActive(), false);
  });

  test("set(false) disables immediately", () => {
    let now = 1000;
    const flag = createTtlFlag(true, 1000, () => now);
    flag.set(false);
    assert.equal(flag.isActive(), false);
    assert.equal(flag.isEnabled(), false);
  });
});

// ============================================================
// isPollingPath / POLLING_PATH_PREFIXES
// ============================================================
describe("isPollingPath", () => {
  test("returns true for all configured polling prefixes", () => {
    for (const prefix of POLLING_PATH_PREFIXES) {
      assert.ok(isPollingPath(prefix), `expected ${prefix} to be polling`);
      assert.ok(isPollingPath(prefix + "/extra"), `expected ${prefix}/extra to be polling`);
    }
  });

  test("returns false for non-polling paths", () => {
    assert.ok(!isPollingPath("/v1/chat/completions"));
    assert.ok(!isPollingPath("/v1/images/generations"));
    assert.ok(!isPollingPath("/v1/unknown"));
    assert.ok(!isPollingPath("/health"));
    assert.ok(!isPollingPath(""));
  });

  test("returns false for non-string input", () => {
    assert.ok(!isPollingPath(null));
    assert.ok(!isPollingPath(undefined));
    assert.ok(!isPollingPath(123));
  });
});

// ============================================================
// Integration: ring-buffer denylist via pushLog (smoke test)
// ============================================================
describe("ring-buffer denylist integration (smoke)", () => {
  // We can't easily test the real pushLog without booting the server,
  // but we can verify the helper functions it uses are wired correctly.
  test("isLowValueNoise + buildDenylistRegex work together for default denylist", () => {
    const denylist = buildDenylistRegex(process.env.LOG_BUFFER_DENYLIST || "");
    assert.ok(isLowValueNoise("[CORS/DEBUG] test", denylist));
    assert.ok(isLowValueNoise("[DEBUG AUTH] test", denylist));
    assert.ok(isLowValueNoise("[DEBUG server] test", denylist));
    assert.ok(isLowValueNoise("[PROXY] test", denylist));
    assert.ok(!isLowValueNoise("[SUCCESS] test", denylist));
  });

  test("custom LOG_BUFFER_DENYLIST overrides default", () => {
    const custom = "CUSTOM|OTHER";
    const denylist = buildDenylistRegex(custom);
    assert.ok(isLowValueNoise("[CUSTOM] test", denylist));
    assert.ok(isLowValueNoise("[OTHER] test", denylist));
    assert.ok(!isLowValueNoise("[CORS/DEBUG] test", denylist)); // default no longer applies
  });
});