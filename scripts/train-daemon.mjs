#!/usr/bin/env node
// ============================================================
// train-daemon.mjs - Warm-up continuo del bandit in round-robin
// ============================================================
// Gira in background, testa un modello alla volta, cicla
// all'infinito sul catalogo finché non riceve SIGTERM/SIGINT.
//
// NON logga per-model: gli esiti sono visibili in dashboard (Live Logs).
//
// Env:
//   PROXY        URL del proxy (default: http://127.0.0.1:8080)
//   DB           Path SQLite (default: ./bandit.db)
//   PROVIDER     Filtra per provider (default: tutti)
//   DELAY_MS     Pausa tra richieste (default: 2000)
//   TIMEOUT_MS   Timeout richiesta (default: 60000)
//   CYCLE_DELAY  Pausa tra un ciclo e il successivo (default: 30000)
//   SKIP_TESTED  true/false - salta modelli già in `models` (default: false)
//   MAX_INPUT    Filtra solo modelli con max_input_tokens >= N (default: 0)
//   PROMPT       Prompt di test (default: "Rispondi solo con: ok")
// ============================================================

import Database from "better-sqlite3";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROXY       = process.env.PROXY       || "http://127.0.0.1:8080";
const DB_PATH     = process.env.DB          || path.join(__dirname, "..", "bandit.db");
const PROVIDER    = process.env.PROVIDER    || "";
const DELAY_MS    = parseInt(process.env.DELAY_MS   || "2000", 10);
const TIMEOUT_MS  = parseInt(process.env.TIMEOUT_MS || "60000", 10);
const CYCLE_DELAY = parseInt(process.env.CYCLE_DELAY|| "30000", 10);
const SKIP_TESTED = String(process.env.SKIP_TESTED || "false").toLowerCase() === "true";
const MAX_INPUT   = parseInt(process.env.MAX_INPUT  || "0", 10);
const EXCLUDE_PROVIDERS = String(process.env.EXCLUDE_PROVIDERS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

let running = true;
let currentModel = null;

function log(...args) {
  const t = new Date().toLocaleTimeString();
  console.log(`[${t}]`, ...args);
}

function shutdown(signal) {
  if (!running) return;
  running = false;
  log(`Ricevuto ${signal}, termino dopo la richiesta in corso...`);
  if (currentModel) log(`(richiesta pendente su ${currentModel})`);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

function loadModels() {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const where = ["1=1"];
    if (PROVIDER) where.push(`c.provider = '${PROVIDER.replace(/'/g, "''")}'`);

    if (EXCLUDE_PROVIDERS.length > 0) {
      const list = EXCLUDE_PROVIDERS.map(p => `'${p.replace(/'/g, "''")}'`).join(",");
      where.push(`c.provider NOT IN (${list})`);
    }
    where.push("(p.needs_attention IS NULL OR p.needs_attention = 0)");
    where.push("(p.permanent IS NULL OR p.permanent = 0)");
    where.push("(m.permanent IS NULL OR m.permanent = 0)");
    if (MAX_INPUT > 0) where.push(`c.max_input_tokens >= ${MAX_INPUT}`);
    if (SKIP_TESTED) where.push("c.id NOT IN (SELECT id FROM models)");
    if (String(process.env.ONLY_FREE || "false").toLowerCase() === "true") {
      where.push("c.is_free = 1");
    }
    if (String(process.env.EXCLUDE_PAID || "false").toLowerCase() === "true") {
      where.push("(m.is_paid IS NULL OR m.is_paid = 0)");
    }
        // Skip pattern non-chat (sicurezza lato client)
    where.push("c.id NOT LIKE '%:batch%'");
    where.push("c.id NOT LIKE '%tts%'");
    where.push("c.id NOT LIKE '%lyria%'");

    const rows = db.prepare(`
      SELECT c.id
      FROM catalog c
      LEFT JOIN models m ON c.id = m.id
      LEFT JOIN provider_history p ON c.provider = p.provider
      WHERE ${where.join(" AND ")}
      ORDER BY c.id ASC
    `).all();
    return rows.map(r => r.id);
  } finally {
    db.close();
  }
}

const skippedProviders = new Set();

async function testModel(model) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${PROXY}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-force-model": model },
      body: JSON.stringify({
        model: "any",
        messages: [{ role: "user", content: PROMPT }],
        stream: false,
        max_tokens: 16
      }),
      signal: controller.signal
    });
    await r.text().catch(() => "");
    return { ok: r.ok, status: r.status };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

function isProviderFlagged(provider) {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const row = db.prepare(
      "SELECT needs_attention, permanent FROM provider_history WHERE provider = ?"
    ).get(provider);
    return !!(row && (Number(row.needs_attention) || Number(row.permanent)));
  } catch {
    return false;
  } finally {
    db.close();
  }
}

async function main() {
  log("=================================================");
  log("Train daemon avviato");
  log(`  Proxy:        ${PROXY}`);
  log(`  DB:           ${DB_PATH}`);
  log(`  Provider:     ${PROVIDER || "<tutti>"}`);
  log(`  Delay:        ${DELAY_MS}ms`);
  log(`  Cycle delay:  ${CYCLE_DELAY}ms`);
  log(`  Timeout:      ${TIMEOUT_MS}ms`);
  log(`  Skip tested:  ${SKIP_TESTED}`);
  log(`  Max input:    ${MAX_INPUT}`);
  log(`  Exclude:      ${EXCLUDE_PROVIDERS.length > 0 ? EXCLUDE_PROVIDERS.join(", ") : "<nessuno>"}`);  
  log(`  PID:          ${process.pid}`);
  log("  (gli esiti per-model sono visibili sulla dashboard)");
  log("=================================================");

  let cycle = 0;
  let totalOk = 0, totalFail = 0;
  let consecutive404 = 0;

  while (running) {
    cycle++;
    const models = loadModels();
    log(`--- Ciclo #${cycle}: ${models.length} modelli da testare ---`);

    if (models.length === 0) {
      log(`Nessun modello disponibile. Aspetto ${CYCLE_DELAY}ms...`);
      await sleep(CYCLE_DELAY).catch(() => {});
      continue;
    }

    let ok = 0, fail = 0;
    skippedProviders.clear();

    for (const model of models) {
      if (!running) break;

      const provider = model.split("/")[0];

      if (skippedProviders.has(model)) continue;
      if (skippedProviders.has(provider)) continue;
      if (skippedProviders.has("COOLDOWN:" + provider)) continue;

      currentModel = model;
      const result = await testModel(model);
      currentModel = null;

      if (result.ok) {
        ok++; totalOk++;
        consecutive404 = 0;
      } else {
        fail++; totalFail++;

        // Timeout/5xx → marca il modello per skip immediato
        if (result.status === 0 || result.status >= 500) {
          skippedProviders.add(model);
        }

        if (result.status === 404) {
          consecutive404++;
          if (isProviderFlagged(provider)) {
            skippedProviders.add(provider);
            log(`  → provider ${provider} flaggato, salto il resto per questo ciclo`);
          } else {
            skippedProviders.add("COOLDOWN:" + provider);
          }
        } else {
          consecutive404 = 0;
        }

        // Se troppi 404 di fila → pausa
        if (consecutive404 >= 10) {
          log(`  → ${consecutive404} 404 di fila, pausa 60s`);
          await sleep(60000);
          consecutive404 = 0;
        }
      }

      if (running) await sleep(DELAY_MS).catch(() => {});
    }

    log(`--- Ciclo #${cycle} chiuso: OK=${ok} FAIL=${fail} (totale: OK=${totalOk} FAIL=${totalFail}) ---`);
    if (running) {
      log(`Pausa ${CYCLE_DELAY}ms prima del prossimo ciclo...`);
      await sleep(CYCLE_DELAY).catch(() => {});
    }
  }

  log("=================================================");
  log(`Train daemon terminato. Totale: OK=${totalOk} FAIL=${totalFail}`);
  log("=================================================");
}

main().catch(e => {
  console.error("Errore fatale:", e);
  process.exit(1);
});
