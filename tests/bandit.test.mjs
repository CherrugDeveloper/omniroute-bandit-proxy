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
  assert.equal(c.cooldownMs, 5 * 60 * 1000); // 5 minuti
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

test("_classifyError: 402 insufficient funds -> cooldown-provider 6h", () => {
  const b = makeBandit();
  const c = b._classifyError({ status: 402, message: "Insufficient account funds" });
  assert.equal(c.action, "cooldown-provider");
  assert.equal(c.reason, "no-credit");
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

test("selectModel: sceglie un modello dal catalogo e registra il provider", () => {
  const b = makeBandit();
  seedCatalog(b, "p1/model-a", "p1");
  const chosen = b.selectModel();
  assert.equal(chosen, "p1/model-a");
  const model = b.db.prepare("SELECT * FROM models WHERE id = ?").get("p1/model-a");
  assert.ok(model, "modello registrato in models");
  assert.equal(model.provider, "p1");
  const prov = b.db.prepare("SELECT * FROM provider_history WHERE provider = ?").get("p1");
  assert.ok(prov, "provider registrato in provider_history");
  b.close();
});

test("selectModel: rispetta excludeSet", () => {
  const b = makeBandit();
  seedCatalog(b, "p1/a", "p1");
  seedCatalog(b, "p1/b", "p1");
  // Escludi a → deve scegliere b
  const chosen = b.selectModel(new Set(["p1/a"]));
  assert.equal(chosen, "p1/b");
  b.close();
});

test("selectModel: nessun provider disponibile -> null", () => {
  const b = makeBandit();
  const chosen = b.selectModel();
  assert.equal(chosen, null);
  b.close();
});

test("selectModel: provider in cooldown non viene scelto", () => {
  const b = makeBandit();
  seedCatalog(b, "p1/a", "p1");
  seedCatalog(b, "p2/a", "p2");
  // Metti p1 in cooldown 1 ora
  b.db.prepare("INSERT INTO provider_history (provider, cooldown_until) VALUES (?, ?)").run("p1", Date.now() + 3600000);
  const chosen = b.selectModel();
  assert.equal(chosen, "p2/a");
  b.close();
});

test("selectModel: provider needs_attention non viene scelto", () => {
  const b = makeBandit();
  seedCatalog(b, "p1/a", "p1");
  seedCatalog(b, "p2/a", "p2");
  b.db.prepare("INSERT INTO provider_history (provider, needs_attention) VALUES (?, 1)").run("p1");
  const chosen = b.selectModel();
  assert.equal(chosen, "p2/a");
  b.close();
});

test("selectModel: provider permanent non viene scelto", () => {
  const b = makeBandit();
  seedCatalog(b, "p1/a", "p1");
  seedCatalog(b, "p2/a", "p2");
  b.db.prepare("INSERT INTO provider_history (provider, permanent) VALUES (?, 1)").run("p1");
  const chosen = b.selectModel();
  assert.equal(chosen, "p2/a");
  b.close();
});

// ============================================================
// recordFeedback
// ============================================================

test("recordFeedback: successo incrementa N e sum_reward", () => {
  const b = makeBandit();
  seedCatalog(b, "p1/a", "p1");
  b.selectModel(); // registra p1/a
  const before = b.db.prepare("SELECT N, sum_reward FROM models WHERE id='p1/a'").get();
  b.recordFeedback("p1/a", true, 0.9, null);
  const after = b.db.prepare("SELECT N, sum_reward FROM models WHERE id='p1/a'").get();
  assert.ok(after.N > before.N, "N aumentato");
  assert.ok(after.sum_reward > before.sum_reward, "sum_reward aumentato");
  assert.equal(after.N, 1); // N=0 prima, 0*0.99+1 = 1
  assert.ok(Math.abs(after.sum_reward - 0.9) < 0.001);
  b.close();
});

test("recordFeedback: successo resetta fails", () => {
  const b = makeBandit();
  seedCatalog(b, "p1/a", "p1");
  b.selectModel();
  b.db.prepare("UPDATE models SET fails = 3 WHERE id='p1/a'").run();
  b.recordFeedback("p1/a", true, 0.8, null);
  const m = b.db.prepare("SELECT fails FROM models WHERE id='p1/a'").get();
  assert.equal(m.fails, 0);
  b.close();
});

test("recordFeedback: fallimento generico -> cooldown modello", () => {
  const b = makeBandit();
  seedCatalog(b, "p1/a", "p1");
  b.selectModel();
  const now = Date.now();
  b.recordFeedback("p1/a", false, 0, { status: 502, message: "Bad gateway" });
  const m = b.db.prepare("SELECT cooldown_until, fails FROM models WHERE id='p1/a'").get();
  assert.ok(m.cooldown_until > now, "cooldown impostato");
  assert.equal(m.fails, 1);
  b.close();
});

test("recordFeedback: 404 model -> ban permanente", () => {
  const b = makeBandit();
  seedCatalog(b, "p1/a", "p1");
  b.selectModel();
  b.recordFeedback("p1/a", false, 0, { status: 404, message: "model does not exist" });
  const m = b.db.prepare("SELECT permanent FROM models WHERE id='p1/a'").get();
  assert.equal(m.permanent, 1);
  b.close();
});

test("recordFeedback: quota exhausted -> cooldown provider", () => {
  const b = makeBandit();
  seedCatalog(b, "p1/a", "p1");
  b.selectModel();
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

test("recordFeedback: 5xx su un modello non mette in cooldown il provider", () => {
  const b = makeBandit();
  seedCatalog(b, "p1/a", "p1");
  seedCatalog(b, "p1/b", "p1");
  b.selectModel(); // registra un provider
  b.recordFeedback("p1/a", false, 0, { status: 502, message: "Bad gateway" });
  const p = b.db.prepare("SELECT cooldown_until FROM provider_history WHERE provider='p1'").get();
  assert.equal(p.cooldown_until, 0, "provider NON in cooldown");
  // il modello p1/b è ancora selezionabile
  const chosen = b.selectModel(new Set(["p1/a"]));
  assert.equal(chosen, "p1/b");
  b.close();
});
