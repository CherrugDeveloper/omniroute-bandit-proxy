import { test } from "node:test";
import assert from "node:assert/strict";
import { DiscountedUCB1Bandit } from "../src/bandit.mjs";

// Helper: crea un bandit con DB in-memory
function makeBandit() {
  return new DiscountedUCB1Bandit(":memory:");
}

// Helper: inserisce un modello nel catalogo
function seedCatalog(b, id, provider) {
  b.db.prepare("INSERT INTO catalog (id, provider) VALUES (?, ?)").run(id, provider);
}

// ============================================================
// _classifyError
// ============================================================

test("_classifyError: 404 model not found -> ban-model", () => {
  const b = makeBandit();
  const c = b._classifyError({ status: 404, message: "The model `gpt-5.5` does not exist or you do not have access" });
  assert.equal(c.action, "ban-model");
  assert.equal(c.scope, "model");
  b.close();
});

test("_classifyError: 400 model not supported -> ban-model", () => {
  const b = makeBandit();
  const c = b._classifyError({ status: 400, message: "model is not supported" });
  assert.equal(c.action, "ban-model");
  b.close();
});

test("_classifyError: upstream bug (Assignment to constant) -> ban-model", () => {
  const b = makeBandit();
  const c = b._classifyError({ message: "Assignment to constant variable" });
  assert.equal(c.action, "ban-model");
  assert.equal(c.reason, "upstream-bug");
  b.close();
});

test("_classifyError: environment error / browserType.launch -> ban-model", () => {
  const b = makeBandit();
  const c = b._classifyError({ message: "browserType.launch: Executable doesn't exist at /root/.cache/ms-playwright/chromium" });
  assert.equal(c.action, "ban-model");
  assert.equal(c.reason, "environment-error");
  b.close();
});

test("_classifyError: missing binary / spawn zcode ENOENT -> ban-provider", () => {
  const b = makeBandit();
  const c = b._classifyError({ message: "spawn zcode ENOENT", provider: "zc" });
  assert.equal(c.action, "ban-provider");
  assert.equal(c.reason, "provider-misconfigured");
  b.close();
});

test("_classifyError: no auth provided -> flag-provider", () => {
  const b = makeBandit();
  const c = b._classifyError({ status: 502, message: "No auth provided. Please log in with `auggie login`" });
  assert.equal(c.action, "flag-provider");
  assert.equal(c.reason, "provider-misconfigured");
  b.close();
});

test("_classifyError: Playwright is not available -> flag-provider", () => {
  const b = makeBandit();
  const c = b._classifyError({ status: 502, message: "Playwright is not available. Install it." });
  assert.equal(c.action, "flag-provider");
  b.close();
});

test("_classifyError: 403 banned -> ban-provider", () => {
  const b = makeBandit();
  const c = b._classifyError({ status: 403, message: "account disabled" });
  assert.equal(c.action, "ban-provider");
  assert.equal(c.scope, "provider");
  b.close();
});

test("_classifyError: 429 quota exhausted -> cooldown-provider", () => {
  const b = makeBandit();
  const c = b._classifyError({
    status: 429,
    message: "All antigravity accounts have exhausted their quota (reset after 5m)"
  });
  assert.equal(c.action, "cooldown-provider");
  assert.equal(c.reason, "quota-exhausted");
  assert.equal(c.cooldownMs, 24 * 3600 * 1000); // 24h per quota-exhausted (permanent condition)
  b.close();
});

test("_classifyError: 429 rate limit -> cooldown-model", () => {
  const b = makeBandit();
  const c = b._classifyError({ status: 429, message: "All credentials for model X are cooling down", code: "model_cooldown" });
  assert.equal(c.action, "cooldown-model");
  b.close();
});

test("_classifyError: timeout -> cooldown-model 10m", () => {
  const b = makeBandit();
  const c = b._classifyError({ message: "fetch timeout" });
  assert.equal(c.action, "cooldown-model");
  assert.equal(c.cooldownMs, 10 * 60 * 1000);
  b.close();
});

test("_classifyError: 5xx -> cooldown-model (non provider)", () => {
  const b = makeBandit();
  const c = b._classifyError({ status: 502, message: "Bad gateway" });
  assert.equal(c.action, "cooldown-model");
  assert.equal(c.scope, "model");
  b.close();
});

test("_classifyError: 402 insufficient funds -> cooldown-provider", () => {
  const b = makeBandit();
  const c = b._classifyError({ status: 402, message: "Insufficient account funds" });
  assert.equal(c.action, "cooldown-provider");
  assert.equal(c.reason, "quota-exhausted");
  b.close();
});

test("_classifyError: 418 anti-abuse -> cooldown-provider 6h", () => {
  const b = makeBandit();
  const c = b._classifyError({ status: 418, message: "anti-abuse challenge failed" });
  assert.equal(c.action, "cooldown-provider");
  assert.equal(c.reason, "provider-blocked");
  b.close();
});

// ============================================================
// _parseResetAfter
// ============================================================

test("_parseResetAfter: 5m -> 300000", () => {
  const b = makeBandit();
  assert.equal(b._parseResetAfter("reset after 5m"), 5 * 60 * 1000);
  b.close();
});

test("_parseResetAfter: 30s -> 30000", () => {
  const b = makeBandit();
  assert.equal(b._parseResetAfter("retry after 30s"), 30 * 1000);
  b.close();
});

test("_parseResetAfter: reset_seconds:117 -> 117000", () => {
  const b = makeBandit();
  assert.equal(b._parseResetAfter('"reset_seconds":117'), 117 * 1000);
  b.close();
});

// ============================================================
// selectModel
// ============================================================

test("selectModel: sceglie un modello dal catalogo e registra il provider", async () => {
  const b = makeBandit();
  seedCatalog(b, "p1/model-a", "p1");
  const chosen = await b.selectModel(false);
  assert.equal(chosen, "p1/model-a");
  const model = b.db.prepare("SELECT * FROM models WHERE id = ?").get("p1/model-a");
  assert.ok(model, "modello registrato in models");
  assert.equal(model.provider, "p1");
  const prov = b.db.prepare("SELECT * FROM provider_history WHERE provider = ?").get("p1");
  assert.ok(prov, "provider registrato in provider_history");
  b.close();
});

test("selectModel: rispetta excludeSet", async () => {
  const b = makeBandit();
  seedCatalog(b, "p1/a", "p1");
  seedCatalog(b, "p1/b", "p1");
  // Escludi a → deve scegliere b
  const chosen = await b.selectModel(new Set(["p1/a"], false));
  assert.equal(chosen, "p1/b");
  b.close();
});

test("selectModel: nessun provider disponibile -> null", async () => {
  const b = makeBandit();
  const chosen = await b.selectModel(false);
  assert.equal(chosen, null);
  b.close();
});

test("selectModel: provider in cooldown non viene scelto", async () => {
  const b = makeBandit();
  seedCatalog(b, "p1/a", "p1");
  seedCatalog(b, "p2/a", "p2");
  // Metti p1 in cooldown 1 ora
  b.db.prepare("INSERT INTO provider_history (provider, cooldown_until) VALUES (?, ?)").run("p1", Date.now() + 3600000);
  const chosen = await b.selectModel(false);
  assert.equal(chosen, "p2/a");
  b.close();
});

test("selectModel: provider needs_attention non viene scelto", async () => {
  const b = makeBandit();
  seedCatalog(b, "p1/a", "p1");
  seedCatalog(b, "p2/a", "p2");
  b.db.prepare("INSERT INTO provider_history (provider, needs_attention) VALUES (?, 1)").run("p1");
  const chosen = await b.selectModel(false);
  assert.equal(chosen, "p2/a");
  b.close();
});

test("selectModel: provider permanent non viene scelto", async () => {
  const b = makeBandit();
  seedCatalog(b, "p1/a", "p1");
  seedCatalog(b, "p2/a", "p2");
  b.db.prepare("INSERT INTO provider_history (provider, permanent) VALUES (?, 1)").run("p1");
  const chosen = await b.selectModel(false);
  assert.equal(chosen, "p2/a");
  b.close();
});

// ============================================================
// recordFeedback
// ============================================================

test("recordFeedback: successo incrementa N e sum_reward", async () => {
  const b = makeBandit();
  seedCatalog(b, "p1/a", "p1");
  await b.selectModel(false); // registra p1/a
  const before = b.db.prepare("SELECT N, sum_reward FROM models WHERE id='p1/a'").get();
  b.recordFeedback("p1/a", true, 0.9, null);
  const after = b.db.prepare("SELECT N, sum_reward FROM models WHERE id='p1/a'").get();
  assert.ok(after.N > before.N, "N aumentato");
  assert.ok(after.sum_reward > before.sum_reward, "sum_reward aumentato");
  assert.equal(after.N, 1); // N=0 prima, 0*0.99+1 = 1
  assert.ok(Math.abs(after.sum_reward - 0.9) < 0.001);
  b.close();
});

test("recordFeedback: successo resetta fails", async () => {
  const b = makeBandit();
  seedCatalog(b, "p1/a", "p1");
  await b.selectModel(false);
  b.db.prepare("UPDATE models SET fails = 3 WHERE id='p1/a'").run();
  b.recordFeedback("p1/a", true, 0.8, null);
  const m = b.db.prepare("SELECT fails FROM models WHERE id='p1/a'").get();
  assert.equal(m.fails, 0);
  b.close();
});

test("recordFeedback: fallimento generico -> cooldown modello", async () => {
  const b = makeBandit();
  seedCatalog(b, "p1/a", "p1");
  await b.selectModel(false);
  const now = Date.now();
  b.recordFeedback("p1/a", false, 0, { status: 502, message: "Bad gateway" });
  const m = b.db.prepare("SELECT cooldown_until, fails FROM models WHERE id='p1/a'").get();
  assert.ok(m.cooldown_until > now, "cooldown impostato");
  assert.equal(m.fails, 1);
  b.close();
});

test("recordFeedback: 404 model -> ban permanente", async () => {
  const b = makeBandit();
  seedCatalog(b, "p1/a", "p1");
  await b.selectModel(false);
  b.recordFeedback("p1/a", false, 0, { status: 404, message: "model does not exist" });
  const m = b.db.prepare("SELECT permanent FROM models WHERE id='p1/a'").get();
  assert.equal(m.permanent, 1);
  b.close();
});

test("recordFeedback: quota exhausted -> cooldown provider", async () => {
  const b = makeBandit();
  seedCatalog(b, "p1/a", "p1");
  await b.selectModel(false);
  const now = Date.now();
  b.recordFeedback("p1/a", false, 0, {
    status: 429,
    message: "All p1 accounts have exhausted their quota (reset after 5m)"
  });
  const p = b.db.prepare("SELECT cooldown_until FROM provider_history WHERE provider='p1'").get();
  assert.ok(p.cooldown_until > now, "cooldown provider impostato");
  b.close();
});

test("recordFeedback: modello inesistente non crasha", () => {
  const b = makeBandit();
  assert.doesNotThrow(() => b.recordFeedback("nonexistent/x", true, 1, null));
  b.close();
});

// ============================================================
// meta persistence
// ============================================================

test("_setMeta/_getMeta: persistenza base", () => {
  const b = makeBandit();
  b._setMeta("counter", 42);
  assert.equal(b._getMeta("counter"), 42);
  b.close();
});

test("_getMeta: chiave inesistente -> 0", () => {
  const b = makeBandit();
  assert.equal(b._getMeta("never-set"), 0);
  b.close();
});

// ============================================================
// errori 5xx non uccidono il provider
// ============================================================

test("recordFeedback: 5xx su un modello non mette in cooldown il provider", async () => {
  const b = makeBandit();
  seedCatalog(b, "p1/a", "p1");
  seedCatalog(b, "p1/b", "p1");
  await b.selectModel(false); // registra un provider
  b.recordFeedback("p1/a", false, 0, { status: 502, message: "Bad gateway" });
  const p = b.db.prepare("SELECT cooldown_until FROM provider_history WHERE provider='p1'").get();
  assert.equal(p.cooldown_until, 0, "provider NON in cooldown");
  // il modello p1/b è ancora selezionabile
  const chosen = await b.selectModel(new Set(["p1/a"], false));
  assert.equal(chosen, "p1/b");
  b.close();
});

test("recordFeedback: 3 consecutive 5xx errors set degraded = 1 and degraded_since", async () => {
  const b = makeBandit();
  seedCatalog(b, "p1/a", "p1");
  await b.selectModel(false);

  // 3 transient errors (502)
  b.recordFeedback("p1/a", false, 0, { status: 502, message: "Bad gateway" });
  b.recordFeedback("p1/a", false, 0, { status: 502, message: "Bad gateway" });
  b.recordFeedback("p1/a", false, 0, { status: 502, message: "Bad gateway" });

  const m = b.db.prepare("SELECT degraded, degraded_since, consecutive_5xx FROM models WHERE id='p1/a'").get();
  assert.equal(m.consecutive_5xx, 3);
  assert.equal(m.degraded, 1);
  assert.ok(m.degraded_since > 0);
  b.close();
});

test("_parseResetAfter: handles HTTP-date and header formats", () => {
  const b = makeBandit();
  // Header as numeric string seconds
  assert.equal(b._parseResetAfter("", { retryAfter: "45" }), 45000);
  // Header as number seconds
  assert.equal(b._parseResetAfter("", { retry_after: 120 }), 120000);
  // Header object with get()
  const mockHeaders = { get: (name) => name === 'retry-after' ? '30' : null };
  assert.equal(b._parseResetAfter("", { headers: mockHeaders }), 30000);
  // HTTP-date future date
  const futureDate = new Date(Date.now() + 60000).toUTCString();
  const parsed = b._parseResetAfter("", { retryAfter: futureDate });
  assert.ok(parsed > 0 && parsed <= 61000);
  b.close();
});

test("_classifyError: distinguishes permanent bans from transient rate limits", () => {
  const b = makeBandit();
  // Permanent ban even if 429 or 403
  const c1 = b._classifyError({ status: 429, message: "Your organization has been suspended" });
  assert.equal(c1.action, "ban-provider");
  assert.equal(c1.reason, "provider-banned");

  // Transient rate limit / quota exceeded
  const c2 = b._classifyError({ status: 429, message: "Rate limit exceeded, please retry later" });
  assert.equal(c2.action, "cooldown-provider");
  assert.equal(c2.reason, "quota-exhausted");
  b.close();
});

test("_classifyError: non-resetting key/quota limits -> cooldown-provider or 24h cooldown", () => {
  const b = makeBandit();
  // Non-resetting key/quota limit
  const c1 = b._classifyError({ status: 403, message: "Key limit exceeded and does not reset" });
  assert.equal(c1.action, "cooldown-provider");
  assert.equal(c1.reason, "quota-exhausted");

  // Key limit exceeded without reset time -> 24h cooldown
  const c2 = b._classifyError({ status: 403, message: "Key limit exceeded (total limit reached)" });
  assert.equal(c2.action, "cooldown-provider");
  assert.equal(c2.reason, "key-limit-exceeded");
  assert.equal(c2.cooldownMs, 24 * 3600 * 1000);

  // Key limit exceeded with valid reset time
  const c3 = b._classifyError({ status: 403, message: "Key limit exceeded (reset after 10m)" });
  assert.equal(c3.action, "cooldown-provider");
  assert.equal(c3.reason, "key-limit-exceeded");
  assert.equal(c3.cooldownMs, 10 * 60 * 1000);
  b.close();
});

test("_classifyError: sandbox, missing binary, and environment configuration errors", () => {
  const b = makeBandit();
  // CLI / binary not found (provider-level) -> ban-provider
  const c1 = b._classifyError({ status: 502, message: "CLI not found or command not found: zcode" });
  assert.equal(c1.action, "ban-provider");
  assert.equal(c1.reason, "provider-misconfigured");

  // Spawn ENOENT error -> ban-provider for zc / binary missing
  const c2 = b._classifyError({ status: 500, message: "spawn zcode ENOENT", provider: "zc" });
  assert.equal(c2.action, "ban-provider");
  assert.equal(c2.reason, "provider-misconfigured");

  // Playwright / browser executable doesn't exist
  const c3 = b._classifyError({ status: 500, message: "Executable doesn't exist at /path/to/chrome" });
  assert.equal(c3.action, "ban-model");
  assert.equal(c3.reason, "environment-error");

  // Sandbox path / configuration errors
  const c4 = b._classifyError({ status: 502, message: "bridge sandbox transport is not configured" });
  assert.equal(c4.action, "ban-provider");
  assert.equal(c4.reason, "provider-misconfigured");
  b.close();
});

test("selectModel: explores unobserved catalog models with N=0 via optimistic UCB1 scoring", async () => {
  const b = makeBandit();
  seedCatalog(b, "p1/tested-model", "p1");
  b.db.prepare("INSERT INTO models (id, provider, N, sum_reward) VALUES (?, ?, ?, ?)").run("p1/tested-model", "p1", 10, 5.0);

  seedCatalog(b, "p2/unobserved-catalog-model", "p2");

  const selected = new Set();
  for (let i = 0; i < 20; i++) {
    const chosen = await b.selectModel(false);
    if (chosen) selected.add(chosen);
  }

  assert.ok(selected.has("p2/unobserved-catalog-model"), "unobserved catalog model should be explored");
  b.close();
});
