import express from "express";
import { createHash } from "node:crypto";
import "dotenv/config";
import { EventEmitter } from "events";
import path from "path";
import { fileURLToPath } from "url";
import { DiscountedUCB1Bandit } from "./bandit.mjs";
import { HealthChecker } from "./health-check.mjs";
import { Notifier } from "./notifier.mjs";
import { initRegistry, detectProfile, listDiscovered, labelDiscovered, registryStats, registrySignatures, dismissDiscovered } from './modes-registry.mjs';

EventEmitter.defaultMaxListeners = 50;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "50mb" }));

// ========================================
// VALIDAZIONE RISPOSTA
// ========================================
function validateNonStreamResponse(data, opts = {}) {
  const requireTools = opts.requireTools === true;
  if (!data || typeof data !== "object") return "empty response body";

  // Errori espliciti ovunque nel body
  if (data.error) return "body.error: " + (data.error.message || JSON.stringify(data.error).slice(0, 100));
  if (data.code && data.code >= 400) return "body.code: " + data.code;
  if (data.type === "error") return "body.type=error";

  // Struttura choices
  if (!Array.isArray(data.choices) || data.choices.length === 0) return "no choices";

  const ch = data.choices[0];
  if (!ch || !ch.message) return "no message in choice[0]";

  // Contenuto vuoto (né content né tool_calls né reasoning)
  const content = ch.message.content;
  const toolCalls = ch.message.tool_calls;
  const reasoning = ch.message.reasoning_content || ch.message.reasoning;

  const hasText = typeof content === "string" && content.trim().length > 0;
  const hasTools = Array.isArray(toolCalls) && toolCalls.length > 0;
  const hasReasoning = typeof reasoning === "string" && reasoning.trim().length > 0;

  if (!hasText && !hasTools) {
    // Se ha solo reasoning, è un reasoning model troncato (max_tokens)
    if (hasReasoning) return "only reasoning, no content (max_tokens too low?)";
    return "empty content";
  }

  // Finish reason anomali
  const fr = ch.finish_reason;
  if (fr === "content_filter") return "content_filter";
  // "length" è ok se ha contenuto; è solo un warning

    // Rileva "errore" mascherato da risposta normale (200 OK con contenuto di avviso)
  if (typeof content === "string" && /run out of usage|out of credits|quota exceeded|insufficient.*balance|upgrade.*plan/i.test(content)) {
    return "provider-quota-exceeded: " + content.slice(0, 100);
  }
  // === Se la richiesta aveva tools, il modello DEVE aver chiamato almeno un tool ===
  if (requireTools && !hasTools) {
    // Eccezione: se il modello ha esplicitamente rifiutato, non è colpa sua
    const t = (content || "").toLowerCase();
    const legitRefusal = /(non posso|cannot|can't|not able|refuse|sorry.*can't)/i.test(t);
    if (!legitRefusal) {
      return "no-tool-call-but-required (model ignored tools)";
    }
  }
 
  return null;  // valida
}

function validateStreamAccumulated(raw, opts = {}) {
  const requireTools = opts.requireTools === true;
            // DEBUG risposta stream
            if (requireTools) {
              const toolCallMatches = raw.match(/"tool_calls"/g);
              const toolNames = [...raw.matchAll(/"name"\s*:\s*"([^"]+)"/g)].map(m => m[1]).slice(0, 5);
              console.log(`[RESPONSE-STREAM] tool_calls found: ${toolCallMatches?.length || 0} | names: ${toolNames.join(", ")}`);
            }
  if (!raw || raw.length === 0) return "empty stream";

  // Cerca errori nel payload SSE
  if (/^\s*data:\s*\{\s*"error"/m.test(raw)) return "SSE contains error";
  if (/\b"finish_reason"\s*:\s*"content_filter"/.test(raw)) return "content_filter";

  // Estrai l'ultimo data: {...} utile e verifica se ha contenuto
  const lines = raw.split("\n").filter(l => l.startsWith("data: "));
  if (lines.length === 0) return "no SSE data lines";

  let hasContent = false;
  let hasTools = false;
  for (const line of lines) {
    const json = line.slice(6).trim();
    if (json === "[DONE]") continue;
    try {
      const obj = JSON.parse(json);
      if (obj.error) return "SSE chunk error: " + (obj.error.message || "").slice(0, 100);
      const delta = obj.choices?.[0]?.delta;
      if (!delta) continue;
      if (typeof delta.content === "string" && delta.content.length > 0) hasContent = true;
      if (Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) hasTools = true;
    } catch {}
  }
  if (requireTools && !hasTools) {
    // Controlla se c'è stato un rifiuto legittimo nel testo accumulato
    const legitRefusal = /(non posso|cannot|can't|not able|refuse)/i.test(raw);
    if (!legitRefusal) {
      return "no-tool-call-but-required (model ignored tools)";
    }
  }

  if (!hasContent && !hasTools) return "stream has no content nor tool_calls";
  return null;  // valida
}

// ========================================
// CONTEXT COMPRESSION (sliding window per agent di coding)
// ========================================
// Mantiene: system + primo user + ultimi N messaggi.
// Rispetta i confini dei blocchi tool_call/tool result (non li spezza mai).
function compressBody(body, targetTokens) {
  if (!body || typeof body !== "object") return null;
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length < 6) return null;

  // 1. Prendi system + primo user (parte "fissa")
  const head = [];
  let i = 0;
  while (i < messages.length && messages[i].role === "system") {
    head.push(messages[i]);
    i++;
  }
  if (i < messages.length && messages[i].role === "user") {
    head.push(messages[i]);
    i++;
  }

  // 2. Trova un boundary sicuro per la coda:
  //    non deve iniziare con un "tool" orfano (deve essere user o assistant senza tool_calls pendenti).
  const TAIL_TARGET = 8;
  let tailStart = Math.max(i, messages.length - TAIL_TARGET);
  while (tailStart > i && tailStart < messages.length) {
    const m = messages[tailStart];
    if (m.role === "user" || (m.role === "assistant" && !m.tool_calls)) break;
    tailStart++;
  }
  // Se ci siamo spostati troppo avanti, non è comprimibile in modo sicuro
  if (tailStart >= messages.length - 1) return null;
  if (tailStart <= i) return null;

  // 3. Verifica che head non finisca con un assistant con tool_calls (orfano)
  //    Se sì, rimuovi l'ultimo elemento di head.
  while (head.length > 0 && head[head.length - 1].role === "assistant" && head[head.length - 1].tool_calls) {
    head.pop();
  }

  const tail = messages.slice(tailStart);
  const omitted = tailStart - i;

  const compressed = [
    ...head,
    {
      role: "user",
      content: `[Sistema: ${omitted} messaggi intermedi omessi per ridurre il contesto. Se hai bisogno di dettagli su passaggi precedenti, chiedili esplicitamente.]`
    },
    ...tail
  ];

  const newBody = { ...body, messages: compressed };
  // Verifica dimensione risultante
  const s = JSON.stringify(newBody);
  const newTokens = Math.ceil(s.length / 3);
  if (newTokens > targetTokens) return null;

  return { body: newBody, omitted };
}
// Access log: solo le route API (v1), escludendo metriche e log (che vengono
// pollate ogni secondo dalla dashboard). Esclude anche gli asset statici.
app.use((req, res, next) => {
  const isApi = req.path.startsWith("/v1/");
  const isPolling = req.path.startsWith("/v1/metrics")
    || req.path.startsWith("/v1/logs")
    || req.path.startsWith("/v1/active")
    || req.path.startsWith("/v1/modes")
    || req.path.startsWith("/v1/debug/status")
    || req.path.startsWith("/v1/inflight");
  if (isApi && !isPolling) {
    let suffix = '';
    if (req.method === 'POST' && req.path === '/v1/chat/completions') {
      suffix = req.get('x-source') === 'training' ? ' [TRAIN]' : ' [ZOO]';
    }
    console.log(`[PROXY] ${req.method} ${req.path}${suffix}`);
  }
  next();
});

app.use((req, res, next) => {
  if (req.path === "/manifest.json") {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  }
  next();
});

app.use(express.static(path.join(__dirname, "../public")));

const bandit = new DiscountedUCB1Bandit();

const notifier = new Notifier({
  urls: (process.env.WEBHOOK_URLS || "").split(",").map(s => s.trim()).filter(Boolean),
  enabled: String(process.env.WEBHOOK_ENABLED || "true").toLowerCase() === "true",
  throttleMs: parseInt(process.env.WEBHOOK_THROTTLE_MS || "300000", 10),
  telegramChatId: process.env.TELEGRAM_CHAT_ID || null
});
bandit.notifier = notifier;

const PORT = process.env.PORT || 8080;
const healthChecker = new HealthChecker(bandit, {
  baseUrl: process.env.OMNIROUTE_BASE_URL || "http://127.0.0.1:20128/v1",
  apiKey: process.env.OMNIROUTE_API_KEY || "",
  intervalMs: parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || "600000", 10),
  batchSize: parseInt(process.env.HEALTH_CHECK_BATCH_SIZE || "20", 10),
  timeoutMs: parseInt(process.env.HEALTH_CHECK_TIMEOUT_MS || "15000", 10),
  verbose: String(process.env.HEALTH_CHECK_VERBOSE || "false").toLowerCase() === "true"
});

// ========================================
// AUTH
// ========================================

const DASHBOARD_TOKEN = (process.env.DASHBOARD_TOKEN || "").trim();
const REQUIRE_AUTH = DASHBOARD_TOKEN.length > 0;

function requireAuth(req, res, next) {
  if (!REQUIRE_AUTH) return next();
  const token = req.get("x-api-token") || req.query.token;
  if (token !== DASHBOARD_TOKEN) {
    return res.status(401).json({ error: { message: "Unauthorized" } });
  }
  next();
}

// ========================================
// RING BUFFER PER LOG CIRCOLARI
// ========================================

class RingBuffer {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.buffer = [];
    this.index = 0;
  }

  push(item) {
    if (this.buffer.length < this.maxSize) {
      this.buffer.push(item);
    } else {
      this.buffer[this.index] = item;
      this.index = (this.index + 1) % this.maxSize;
    }
  }

  getAll() {
    if (this.buffer.length < this.maxSize) {
      return [...this.buffer];
    }
    return [...this.buffer.slice(this.index), ...this.buffer.slice(0, this.index)];
  }
}

const logBuffer = new RingBuffer(200);

// ========================================
// ACTIVE REQUESTS TRACKER
// ========================================
// Traccia le richieste in corso con: modello scelto, tentativo, tempo, tier
const activeRequests = new Map(); // id -> { id, model, attempt, startTime, clientIp, stream, tier, compressed }
// Toggle debug verbose (in memoria, si resetta al restart)
let debugVerbose = false;
// === SESSION AFFINITY ===
// Mappa sessionKey → { model, ts }
// Garantisce che la stessa conversazione usi sempre lo stesso modello
// (evita che il bandit cambi modello a metà task, perdendo artifact/tool state)
const sessionModels = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min

function computeSessionKey(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return null;

  // Prendi il system prompt (o, se manca, il primo user message)
  const sys = messages.find(m => m.role === "system");
  const firstUser = messages.find(m => m.role === "user");

  const sysStr = sys
    ? (typeof sys.content === "string" ? sys.content : JSON.stringify(sys.content))
    : "";
  const userStr = firstUser
    ? (typeof firstUser.content === "string" ? firstUser.content : JSON.stringify(firstUser.content))
    : "";

  // 🎯 Usa SOLO il prefisso stabile:
  // - system: primi 800 char (l'header "You are Zoo..." è lì)
  // - user:   primi 300 char (la richiesta originale dell'utente è lì)
  // Tutto ciò che viene dopo è contesto dinamico che cambia ad ogni turno.
  const stableSys  = sysStr.slice(0, 800);
  const stableUser = userStr.slice(0, 300);

  if (!stableSys && !stableUser) return null;

  return createHash("md5")
    .update(stableSys + "|" + stableUser)
    .digest("hex")
    .slice(0, 16);
}

let requestCounter = 0;
function newRequestId() {
  return `req-${Date.now()}-${++requestCounter}`;
}

function trackRequestStart(id, meta) {
  activeRequests.set(id, {
    source: meta.source || 'zoo',
    id,
    startTime: Date.now(),
    ...meta
  });
}

function trackRequestUpdate(id, patch) {
  const r = activeRequests.get(id);
  if (r) Object.assign(r, patch);
}

function trackRequestEnd(id) {
  activeRequests.delete(id);
}

function getActiveRequestsSnapshot() {
  const now = Date.now();
  return Array.from(activeRequests.values()).map(r => {
    const info = r.model ? bandit.getModelInfo(r.model) : null;
    const rank = r.model ? bandit.getModelRank(r.model) : null;
    return {
      ...r,
      elapsedMs: now - r.startTime,
      elapsedSec: Math.round((now - r.startTime) / 100) / 10,
      N: info?.N ?? null,
      avg: info?.avg ?? null,
      trend: info?.trend ?? 'flat',
      rank,
    };
  }).sort((a, b) => b.startTime - a.startTime);
}

// Ultime richieste completate (per mostrare activity quando idle)
const recentRequests = new RingBuffer(5);

function trackRequestComplete(id, meta) {
  const r = activeRequests.get(id);
  if (r) {
    const info = r.model ? bandit.getModelInfo(r.model) : null;
    const rank = r.model ? bandit.getModelRank(r.model) : null;
    recentRequests.push({
      ...r,
      ...meta,
      endedAt: Date.now(),
      durationSec: Math.round((Date.now() - r.startTime) / 100) / 10,
      N: info?.N ?? null,
      avg: info?.avg ?? null,
      trend: info?.trend ?? 'flat',
      rank,
    });
  }
}

function pushLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  logBuffer.push(`[${timestamp}] ${message}`);
}

// ========================================
// CONSOLE OVERRIDE CON TRUNCATURA
// ========================================

const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

function serializeArgs(args) {
  return args.map(arg => {
    if (typeof arg === "string") return arg;
    if (arg instanceof Error) return arg.stack || arg.message;
    try {
      const str = JSON.stringify(arg);
      return str && str.length > 1000 ? str.substring(0, 1000) + "... (truncated)" : str;
    } catch {
      return String(arg);
    }
  }).join(" ");
}

console.log = (...args) => { originalLog(...args); pushLog(serializeArgs(args)); };
console.error = (...args) => { originalError(...args); pushLog("ERROR: " + serializeArgs(args)); };
console.warn = (...args) => { originalWarn(...args); pushLog("WARN: " + serializeArgs(args)); };

// ========================================
// MIDDLEWARE
// ========================================

app.use((req, res, next) => {
  if (req.method === "POST" && req.path.includes("/chat/completions")) {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: { message: "Invalid request body" } });
    }
    if (!req.body.messages && !req.body.prompt && !req.body.model) {
      return res.status(400).json({ error: { message: "Missing required fields" } });
    }
  }
  next();
});

// ========================================
// ROUTES
// ========================================

app.get("/dashboard", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.sendFile(path.join(__dirname, "../public/dashboard.html"));
});
app.get('/v1/debug/status', requireAuth, (req, res) => {
  res.json({ verbose: debugVerbose });
});

app.post('/v1/debug/toggle', requireAuth, express.json(), (req, res) => {
  const desired = req.body?.verbose;
  debugVerbose = typeof desired === 'boolean' ? desired : !debugVerbose;
  console.log(`[DEBUG] verbose=${debugVerbose}`);
  res.json({ verbose: debugVerbose });
});
app.get('/v1/modes', requireAuth, (req, res) => {
  res.json({ stats: registryStats(), discovered: listDiscovered() });
});
app.post('/v1/modes/label', requireAuth, express.json(), (req, res) => {
  const { sig, name, profile } = req.body || {};
  const r = labelDiscovered(sig, name, profile);
  res.status(r.ok ? 200 : 400).json(r);
});
app.get('/v1/modes/signatures', requireAuth, (req, res) => {
  res.json({ signatures: registrySignatures() });
});
app.delete('/v1/modes/discovered/:sig', requireAuth, (req, res) => {
  const ok = dismissDiscovered(req.params.sig);
  res.status(ok ? 200 : 404).json({ ok });
});

app.delete('/v1/sessions/:key', requireAuth, (req, res) => {
  const key = req.params.key;
  const existed = sessionModels.delete(key);
  res.json({ deleted: existed, key });
});

app.get("/v1/metrics", requireAuth, (req, res) => {
  try {
    res.json(bandit.getMetrics());
  } catch (e) {
    console.error("[API] Errore /v1/metrics:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/v1/sessions", requireAuth, (req, res) => {
  const now = Date.now();
  const sessions = Array.from(sessionModels.entries()).map(([k, v]) => ({
    key: k.slice(0, 8),
    model: v.model,
    ageSec: Math.round((now - v.ts) / 1000)
  }));
  res.json({ count: sessions.length, sessions });
});

app.get("/v1/health-check/status", requireAuth, (req, res) => {
  res.json(healthChecker.getStatus());
});

app.get("/v1/logs", requireAuth, (req, res) => {
  try {
    res.json(logBuffer.getAll());
  } catch (e) {
    console.error("[API] Errore /v1/logs:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Endpoint per il training daemon: quante richieste Zoo sono in-flight adesso?
// Non protetto da auth: il daemon gira in locale su 127.0.0.1.
app.get("/v1/inflight", (req, res) => {
  res.json({ count: activeRequests.size, ts: Date.now() });
});

app.get("/v1/active", requireAuth, (req, res) => {
  try {
    res.json({
      count: activeRequests.size,
      requests: getActiveRequestsSnapshot(),
      recent: recentRequests.getAll().slice(-3)  // ultime 3
    });
  } catch (e) {
    console.error("[API] Errore /v1/active:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post("/v1/reset/model/:id", requireAuth, (req, res) => {
  try {
    bandit.resetModel(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error("[API] Errore reset model:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post("/v1/block/model/:id", requireAuth, (req, res) => {
  try {
    const ok = bandit.blockModel(req.params.id);
    res.json({ ok });
  } catch (e) {
    console.error("[API] Errore block model:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post("/v1/reset/counters", requireAuth, (req, res) => {
  try {
    bandit.resetGlobalCounters();
    res.json({ ok: true });
  } catch (e) {
    console.error("[API] Errore reset counters:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post("/v1/reset/provider/:p", requireAuth, (req, res) => {
  try {
    bandit.resetProvider(req.params.p);
    res.json({ ok: true });
  } catch (e) {
    console.error("[API] Errore reset provider:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post("/v1/provider/retry/:p", requireAuth, (req, res) => {
  try {
    const ok = bandit.clearProviderAttention(req.params.p);
    res.json({ ok });
  } catch (e) {
    console.error("[API] Errore retry provider:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post("/v1/provider/ignore/:p", requireAuth, (req, res) => {
  try {
    const ok = bandit.ignoreProvider(req.params.p);
    res.json({ ok });
  } catch (e) {
    console.error("[API] Errore ignore provider:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========================================
// PROXY ENDPOINT
// ========================================

app.post(["/v1/chat/completions", "/chat/completions"], async (req, res) => {
  const { stream } = req.body || {};
  const requestId = newRequestId();

  trackRequestStart(requestId, {
    source: (req.get("x-source") === "training") ? "training" : "zoo",
    model: null,
    attempt: 0,
    stream: !!stream,
    status: "starting",
    clientIp: req.ip || req.connection?.remoteAddress || "?"
  });

  // Cleanup a fine richiesta (success, error, disconnect)
  res.once("finish", () => { trackRequestComplete(requestId); trackRequestEnd(requestId); });
  res.once("close", () => { trackRequestComplete(requestId); trackRequestEnd(requestId); });
  const baseUrl = process.env.OMNIROUTE_BASE_URL || "http://127.0.0.1:20128/v1";
  const apiKey = process.env.OMNIROUTE_API_KEY;

  bandit.recordRequest(); // +1 per ogni richiesta ricevuta
  // === Stima token e (eventuale) auto-compress del contesto ===
  let estimatedTokens = bandit.estimateTokens(req.body);
  // Hard cap: se il contesto stimato supera 150k token, rifiuta
  const MAX_CONTEXT_TOKENS = parseInt(process.env.MAX_CONTEXT_TOKENS || "150000");
  if (estimatedTokens > MAX_CONTEXT_TOKENS) {
    console.warn(`[REJECT] Contesto ${estimatedTokens} > ${MAX_CONTEXT_TOKENS} → 413`);
    return res.status(413).json({
      error: {
        message: `Context too large (${estimatedTokens} tokens). Max ${MAX_CONTEXT_TOKENS}. Compress or start new chat.`,
        type: "context_too_large",
        status: 413
      }
    });
  }
  // Timeout proporzionale: contesti grandi → prefill più lungo.
  // Scala linearmente (100k = 2x, 200k+ = 3x, cap 3x).
  const baseTimeout = parseInt(process.env.UPSTREAM_TIMEOUT_MS) || 20000;
  const tokenScale = Math.max(1, Math.min(3, Math.ceil((estimatedTokens || 0) / 100000)));
  const upstreamTimeoutMs = baseTimeout * tokenScale;
  if (tokenScale > 1 && debugVerbose) {
    console.log(`[TIMEOUT] scala ${tokenScale}x → ${upstreamTimeoutMs}ms (tokens=${estimatedTokens})`);
  }
  const autoCompress = String(req.get("x-auto-compress") || "").toLowerCase() === "true";
  if (debugVerbose) console.log(`[CONTEXT] autoCompress=${autoCompress} header="${req.get("x-auto-compress") || "<assente>"}" tokens=${estimatedTokens} maxCatalog=${bandit.maxCatalogInput()}`);
  // Debug sessione
  const sessionDebug = {
    user: req.body?.user || null,
    ip: req.ip || req.connection?.remoteAddress || "?",
    ua: (req.get("user-agent") || "").substring(0, 40),
    convHeader: req.get("x-conversation-id") || req.get("x-session-id") || null,
    firstMsgHash: req.body?.messages?.[0]?.content?.substring?.(0, 60) || null
  };
  console.log(`[SESSION] ${JSON.stringify(sessionDebug)}`);
  const maxCatalog = bandit.maxCatalogInput();

  if (autoCompress && maxCatalog > 0 && estimatedTokens > maxCatalog) {
    console.log(`[CONTEXT] Richiesta ${estimatedTokens} token > max catalogo ${maxCatalog}, tentativo di compressione`);
    const compressed = compressBody(req.body, maxCatalog);
    if (compressed) {
      req.body = compressed.body;
      estimatedTokens = bandit.estimateTokens(req.body);
      console.log(`[CONTEXT] Compresso: ${compressed.omitted} messaggi rimossi, ora ${estimatedTokens} token`);
    } else {
      console.warn(`[CONTEXT] Compressione non possibile, procedo con contesto originale`);
    }
  }
  // Header x-force-model: bypassa UCB1 al primo tentativo (per training manuale)
  const forceModel = (req.get("x-force-model") || "").trim();
  const feedbackSource = (req.get("x-source") || "").toLowerCase() === "training" ? "training" : "prod";
    // === Session key per affinity ===
  const sessionKey = computeSessionKey(req.body?.messages);
  if (sessionKey) {
    const sys = req.body?.messages?.find(m => m.role === "system");
    const usr = req.body?.messages?.find(m => m.role === "user");
    const sysPreview = (typeof sys?.content === "string" ? sys.content : JSON.stringify(sys?.content || "")).slice(0, 120);
    const usrPreview = (typeof usr?.content === "string" ? usr.content : JSON.stringify(usr?.content || "")).slice(0, 80);
    if (debugVerbose) console.log(`[SESSION-KEY] ${sessionKey.slice(0,8)} | sys="${sysPreview}" | usr="${usrPreview}"`);
    const msgs = req.body?.messages || [];
    const toolResults = msgs.filter(m => m.role === 'tool').length;
    const asstTc = msgs.filter(m => m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0).length;
    const lastTool = msgs.filter(m => m.role === 'tool').slice(-1)[0];
    const lastToolPreview = typeof lastTool?.content === 'string' ? lastTool.content.slice(0, 150) : '<none>';
    //console.log(`[MSGS] total=${msgs.length} tool_results=${toolResults} asst_tc=${asstTc} lastTool="${lastToolPreview.replace(/\n/g, ' ')}"`);
  }

  // === MODE / PROFILE ===
  const sysMsg = req.body?.messages?.find(m => m.role === 'system');
  const sysText = (typeof sysMsg?.content === 'string') ? sysMsg.content : '';
  const modeResult = detectProfile(sysText);
  const profile = modeResult.profile;
  if (modeResult.mode) {
    console.log(`[MODE] ${modeResult.mode} → profile=${profile} (${modeResult.source}${modeResult.sig ? ' sig=' + modeResult.sig.slice(0,8) : ''})`);
  } else if (modeResult.source === 'unknown') {
    console.log(`[MODE] unknown → registrata per labeling (sig=${modeResult.sig.slice(0,8)})`);
  }

  if (forceModel) {
    console.log(`[FORCE] Modello forzato: ${forceModel}`);
  }

  const excluded = new Set();
  // requireTools: richiede tool calls SOLO se:
  //   1. la richiesta ha tools
  //   2. il system prompt NON è di summarization (Zoo Code summarizza il contesto senza tool)
  const hasTools = Array.isArray(req.body?.tools) && req.body.tools.length > 0;
  const firstMsg = req.body?.messages?.[0]?.content || "";
  const firstMsgStr = typeof firstMsg === "string" ? firstMsg : JSON.stringify(firstMsg);
  const isSummarization = /summariz|summariz|condense|context.*compress|riassunt/i.test(firstMsgStr.slice(0, 500));
  const requireTools = hasTools && !isSummarization;

  if (hasTools && isSummarization) {
    console.log(`[TOOLS] Richiesta di summarization rilevata → rimuovo tools dal body`);
    // Per summarization, il modello deve rispondere con TESTO.
    // Se gli passiamo i tools, tende a chiamarli anche se non serve.
    delete req.body.tools;
    delete req.body.tool_choice;
    delete req.body.parallel_tool_calls;
  }
  if (requireTools) {
    console.log(`[TOOLS] Richiesta con ${req.body.tools.length} tools → solo modelli tool-capable`);
  }
  let attempt = 0;
  let controller = null;
  // Timer streaming — dichiarati fuori da if(stream) così il catch esterno può accedervi
  const STREAM_IDLE_MS = parseInt(process.env.STREAM_IDLE_MS || "60000", 10);
  const isSummarizer = (profile === 'summarizer');
  const STREAM_MAX_MS = parseInt(process.env.STREAM_MAX_MS || (isSummarizer ? "60000" : "180000"), 10);
  let idleTimer = null;
  let hardCapTimer = null;
  let lastMeaningfulByte = Date.now();
  let timeoutHandle = null;

  const providerCount = bandit.getProviderCount();
  const maxAttempts = forceModel ? 1 : Math.min(500, providerCount * 4 + 100);
  const startedAt = Date.now();
  const MAX_TOTAL_MS = parseInt(process.env.MAX_TOTAL_MS) || 10 * 60 * 1000;

  const cleanup = () => {
    if (timeoutHandle) { clearTimeout(timeoutHandle); timeoutHandle = null; }
    if (controller) { controller.abort(); controller = null; }
  };
  // Circuit breaker: contatore fallimenti per provider in questa richiesta.
  // Al 3° fail, mette in cooldown il provider (5 min) → il while salta i suoi modelli.
  const providerFailCount = new Map();
  const PROVIDER_FAIL_THRESHOLD = 3;

  function noteProviderFail(modelId) {
    const prov = modelId.split('/')[0];
    const n = (providerFailCount.get(prov) || 0) + 1;
    providerFailCount.set(prov, n);
    if (n === PROVIDER_FAIL_THRESHOLD) {
      console.log(`[BANDIT] Provider ${prov} ha fallito ${n} volte in questa richiesta → cooldown 5min`);
      try { bandit._forceProviderCooldown(prov, 5 * 60 * 1000, "cascade-fail"); } catch (_) {}
    }
  }

  let clientDisconnected = false;
  res.once("close", () => {
    if (!res.writableEnded) {
      clientDisconnected = true;
      cleanup();
    }
  });

  while (++attempt <= maxAttempts) {
    if (clientDisconnected) {
      console.log(`[BANDIT] Client disconnesso, stop retry (dopo ${attempt - 1} tentativi)`);
      cleanup();
      return;
    }
    if (Date.now() - startedAt > MAX_TOTAL_MS) {
      console.warn(`[BANDIT] Limite tempo totale (${MAX_TOTAL_MS}ms) raggiunto dopo ${attempt} tentativi`);
      cleanup();
      return res.status(504).json({ error: { message: "Gateway timeout: nessun modello disponibile in tempo utile", status: 504 } });
    }

    let model;
    if (attempt === 1 && forceModel) {
      if (!bandit.isModelAvailable(forceModel)) {
        cleanup();
        return res.status(404).json({
          error: { message: `Modello forzato ${forceModel} non disponibile in catalogo`, status: 404 }
        });
      }
      model = forceModel;
} else {
  // === SESSION AFFINITY ===
  let pinnedEntry = null;
  if (sessionKey) {
    const entry = sessionModels.get(sessionKey);
    if (entry && (Date.now() - entry.ts) < SESSION_TTL_MS) {
      pinnedEntry = entry;              // ← l'OGGETTO, non .model
    } else if (entry) {
      sessionModels.delete(sessionKey); // scaduto
    }
  }

  const pinnedValid = pinnedEntry
    && !excluded.has(pinnedEntry.model)
    && bandit.isModelAvailable(pinnedEntry.model);

  if (pinnedValid) {
    model = pinnedEntry.model;
    pinnedEntry.ts = Date.now();        // rinnova TTL (sliding)
    console.log(`[AFFINITY] ↻ ${model} (sessione ${sessionKey.slice(0, 8)})`);
  } else {
    model = bandit.selectModel(excluded, null, estimatedTokens, requireTools, profile);
    if (model && sessionKey) {
      sessionModels.set(sessionKey, { model, ts: Date.now() });
      console.log(`[AFFINITY] ⊕ pin ${model} (sessione ${sessionKey.slice(0, 8)})`);
    }
  }
}
    if (!model) {
      console.warn(`[BANDIT] 503: nessun modello disponibile (requireTools=${requireTools}, tokens=${estimatedTokens}, attempt=${attempt})`);
      notifier.notify("system.no_models", "Nessun modello disponibile: tutti in cooldown/ban o needs_attention", {
        estimatedTokens,
        attempt
      }).catch(() => {});
      cleanup();
      return res.status(503).json({ error: { message: "No models available", status: 503 } });
    }

    console.log(`[BANDIT] Selezionato ${model} (tentativo ${attempt})`);

    // === AUTO-COMPRESS per il modello specifico ===
    let requestBody = req.body;
    if (autoCompress) {
      const modelMaxInput = bandit.getModelMaxInput(model);   // nuovo metodo
      if (modelMaxInput > 0 && estimatedTokens > modelMaxInput) {
        console.log(`[CONTEXT] Richiesta ${estimatedTokens} tok > ${model} max ${modelMaxInput} tok → comprimo`);
        const compressed = compressBody(req.body, modelMaxInput - 500);
        if (compressed) {
          requestBody = compressed.body;
          const newTokens = bandit.estimateTokens(requestBody);
          console.log(`[CONTEXT] Compresso: ${compressed.omitted} messaggi rimossi, ora ${newTokens} tok`);
          estimatedTokens = newTokens;
        } else {
          console.warn(`[CONTEXT] Compressione impossibile per ${model}, salto`);
          // Se il modello che ha fallito era il pin della sessione → unpin
          if (sessionKey) {
            const entry = sessionModels.get(sessionKey);
            if (entry && entry.model === model) {
              console.log(`[AFFINITY] ✗ pin ${model} fallito → unpin`);
              sessionModels.delete(sessionKey);
            }
          }
          noteProviderFail(model);
          excluded.add(model);
          continue;
        }
      }
    }
    trackRequestUpdate(requestId, {
      model,
      attempt,
      status: "fetching",
    });
    const start = Date.now();
    controller = new AbortController();

    timeoutHandle = setTimeout(() => {
      console.warn(`[TIMEOUT] ${model} superato timeout (${upstreamTimeoutMs}ms)`);
      controller.abort();
    }, upstreamTimeoutMs);

    try {
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

      const r = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...requestBody, model, stream: !!stream }),
        signal: controller.signal
      });

      clearTimeout(timeoutHandle);
      timeoutHandle = null;
      const dur = (Date.now() - start) / 1000;

      if (!r.ok || r.status === 499) {
        const txt = await r.text().catch(() => "");
        console.error(`[UPSTREAM ${r.status}] ${model}: ${txt.substring(0, 200)}`);
        bandit.recordFeedback(model, false, 0, { message: txt, status: r.status }, { source: feedbackSource });
        noteProviderFail(model);
        excluded.add(model);
        trackRequestUpdate(requestId, { status: `error-${r.status}`, lastError: txt.slice(0, 100) });
        continue;
      }

      if (stream) {
        // Se gli header sono già stati inviati (stream già aperto), non possiamo ritentare
        if (res.headersSent) {
          console.error(`[RETRY BLOCKED] headers già inviati per ${model}, stream chiuso`);
          bandit.recordFeedback(model, false, 0, { message: "stream already started" }, { source: feedbackSource });
          cleanup();
          try { res.end(); } catch (_) {}
          return;
        }

        const reader = r.body.getReader();
        const dec = new TextDecoder();

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        let streamFailed = false;
        let streamStarted = false;
        let firstChunk = true;
        let accumulated = "";
        hardCapTimer = setTimeout(() => {
          console.error(`[TIMEOUT] ${model}: stream superato hard cap ${STREAM_MAX_MS/1000}s → abort`);
          console.error(`[HARDCAP] timer fired, controller.signal.aborted=${controller?.signal?.aborted}, STREAM_MAX_MS=${STREAM_MAX_MS}`);
          try {
            if (controller && !controller.signal.aborted) {
              controller.abort(new Error('stream-hard-cap'));
            }
          } catch (e) { console.error(`[HARDCAP] abort failed: ${e.message}`); }
          try { reader.cancel().catch(() => {}); } catch (_) {}
        }, STREAM_MAX_MS);
        if (hardCapTimer.unref) hardCapTimer.unref();
        // Idle timeout: scatta solo se NESSUN CONTENUTO REALE per N sec.
        // I ping SSE (`: keep-alive\n\n`) NON resettano il timer.
        const resetIdle = () => {
          if (idleTimer) clearTimeout(idleTimer);
          idleTimer = setTimeout(() => {
            const elapsed = Math.round((Date.now() - lastMeaningfulByte) / 1000);
            console.error(`[TIMEOUT] ${model}: stream idle ${elapsed}s senza contenuto → abort`);
            try {
              if (controller && !controller.signal.aborted) {
                controller.abort(new Error('stream-idle-timeout'));
              }
            } catch (e) { console.error(`[TIMEOUT] abort failed: ${e.message}`); }
            try { reader.cancel().catch(() => {}); } catch (_) {}
          }, STREAM_IDLE_MS);
          if (idleTimer.unref) idleTimer.unref();
        };
        // Un chunk è "utile" solo se contiene contenuto reale.
        // Ping/commenti SSE iniziano con `:` e vanno ignorati.
        const isMeaningfulChunk = (c) => {
          const stripped = c.replace(/^:\s*.*$/gm, '').replace(/\s+/g, '');
          return stripped.length > 0;
        };
        resetIdle();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            if (value) {
              const chunk = dec.decode(value, { stream: true });

              // Reset idle SOLO se il chunk ha contenuto reale
              if (isMeaningfulChunk(chunk)) {
                lastMeaningfulByte = Date.now();
                resetIdle();
              }

              if (firstChunk && (chunk.includes('"error"') || chunk.includes('"code"'))) {
                streamFailed = true;
                console.error(`[STREAM ERR] ${model}: ${chunk.substring(0, 200)}`);
                res.write(`data: ${JSON.stringify({ error: "Stream error" })}\n\n`);
                break;
              }
              firstChunk = false;
              streamStarted = true;
              accumulated += chunk;
              res.write(chunk);
            }
          }
          if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
          if (hardCapTimer) { clearTimeout(hardCapTimer); hardCapTimer = null; }
          if (!streamFailed && streamStarted) {
            // validazione
            const streamInvalid = validateStreamAccumulated(accumulated, { requireTools });
            if (requireTools) {
              const tcMatches = accumulated.match(/"tool_calls"/g);
              console.log(`[RESPONSE-STREAM] ${model} | tool_calls found: ${tcMatches?.length || 0}`);
            }
            if (streamInvalid) {
              console.error(`[STREAM INVALID] ${model}: ${streamInvalid}`);
              bandit.recordFeedback(model, false, 0, { message: streamInvalid }, { source: feedbackSource });
              // Header già inviati: NON possiamo cambiare modello.
              // Chiudiamo lo stream con un errore e usciamo.
              try {
                res.write(`data: ${JSON.stringify({ error: { message: "Stream invalid: " + streamInvalid } })}\n\n`);
                res.write(`data: [DONE]\n\n`);
              } catch (_) {}
              cleanup();
              try { res.end(); } catch (_) {}
              return;
            }

            const rewardScore = Math.max(0, 1.0 - (dur / 30));
            bandit.recordFeedback(model, true, rewardScore, null, { source: feedbackSource });
            console.log(`[SUCCESS] ${model} in ${dur.toFixed(2)}s (reward: ${rewardScore.toFixed(3)})`);
            trackRequestUpdate(requestId, { status: "success", lastDurationSec: dur });
          } else if (streamFailed) {
            bandit.recordFeedback(model, false, 0, { message: "stream error" }, { source: feedbackSource });
            // Header già inviati → non si può ritentare
            cleanup();
            try { res.end(); } catch (_) {}
            return;
          }

          res.end();
          cleanup();
          return;
        } catch (e) {
          console.error(`[STREAM ABORT] ${model}: ${e.message}`);
          bandit.recordFeedback(model, false, 0, { message: e.message }, { source: feedbackSource });
          noteProviderFail(model);
          excluded.add(model);
          reader.cancel().catch(() => {});
          if (!res.writableEnded) res.end();
          continue;
        }
      } else {
        const data = await r.json();

        // === VALIDAZIONE RISPOSTA ===
        const invalidReason = validateNonStreamResponse(data, { requireTools });
        // DEBUG: log risposta modello (solo se ha tools)
        if (requireTools) {
          const msg = data.choices?.[0]?.message;
          const tc = msg?.tool_calls;
          const content = msg?.content;
          console.log(`[RESPONSE] ${model} | tool_calls: ${tc?.length || 0} | content: ${(content || "").substring(0, 100)}`);
          if (tc && tc.length > 0) {
            console.log(`[RESPONSE] tool chiamati: ${tc.map(t => t.function?.name).join(", ")}`);
          }
        }
        if (invalidReason) {
          console.error(`[APP ERR] ${model}: ${invalidReason}`);
          bandit.recordFeedback(model, false, 0, { message: invalidReason }, { source: feedbackSource });
          noteProviderFail(model);
          excluded.add(model);
          continue;
        }

        const rewardScore = Math.max(0, 1.0 - (dur / 30));
        bandit.recordFeedback(model, true, rewardScore, null, { source: feedbackSource });
        console.log(`[SUCCESS] ${model} in ${dur.toFixed(2)}s (reward: ${rewardScore.toFixed(3)})`);
        trackRequestUpdate(requestId, { status: "success", lastDurationSec: dur });
        cleanup();
        return res.json(data);
      }
    } catch (e) {
      if (timeoutHandle) { clearTimeout(timeoutHandle); timeoutHandle = null; }

      if (e.name === "AbortError") {
        if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
        console.error(`[ABORT] ${model}: timeout or client disconnect`);
        bandit.recordFeedback(model, false, 0, { message: "timeout/abort" }, { source: feedbackSource });
      } else {
        console.error(`[FETCH ERR] ${model}: ${e.message}`);
        bandit.recordFeedback(model, false, 0, { message: e.message }, { source: feedbackSource });
      }
      noteProviderFail(model);
      excluded.add(model);
    }
  }

  cleanup();
  res.status(502).json({ error: { message: `${attempt - 1} tentativi esauriti su ${maxAttempts}`, status: 502 } });
});

// ========================================
// ERROR HANDLERS GLOBALI
// ========================================

let unhandledRejectionCount = 0;
process.on("unhandledRejection", (reason) => {
  unhandledRejectionCount++;
  console.error(`[UNHANDLED REJECTION #${unhandledRejectionCount}]`, reason?.message || reason);
  // Non terminiamo il processo: un errore in una richiesta non deve uccidere il proxy.
  // Se gli errori sono troppi (>20 in 60s), allora c'è un bug serio → crash pulito.
  if (unhandledRejectionCount > 20) {
    console.error("[FATAL] Troppi unhandled rejection, termino per evitare loop");
    process.exit(1);
  }
  // Reset contatore dopo 60s senza errori
  setTimeout(() => { unhandledRejectionCount = 0; }, 60000).unref();
});

process.on("uncaughtException", (error) => {
  console.error("[UNCAUGHT EXCEPTION]", error);
  bandit.close();
  process.exit(1);
});

process.on("SIGTERM", () => {
  healthChecker.stop();
  console.log("[SHUTDOWN] SIGTERM ricevuto, chiusura graceful...");
  bandit.close();
  process.exit(0);
});

process.on("SIGINT", () => {
  healthChecker.stop();
  console.log("[SHUTDOWN] SIGINT ricevuto, chiusura graceful...");
  bandit.close();
  process.exit(0);
});

// ========================================
// STARTUP
// ========================================

async function startServer() {
  try {
    console.log("[INIT] Sincronizzazione modelli in corso...");
    await bandit.fetchAndSyncModels();
    console.log("[INIT] Modelli sincronizzati con successo");
  } catch (err) {
    console.error("[INIT] Errore sincronizzazione:", err.message);
    console.log("[INIT] Retry in 5 secondi...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    return startServer();
  }

  initRegistry();
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`[PROXY] ✓ Server avviato su http://127.0.0.1:${PORT}`);
    console.log(`[DASHBOARD] ✓ Dashboard disponibile su http://127.0.0.1:${PORT}/dashboard`);
    console.log(`[CONFIG] Timeout upstream: ${process.env.UPSTREAM_TIMEOUT_MS || 60000}ms`);
    if (!REQUIRE_AUTH) {
      console.warn("[SECURITY] DASHBOARD_TOKEN non configurato: le API di controllo sono esposte senza autenticazione");
    } else {
      console.log("[SECURITY] Auth attiva sulle API di controllo");
    }

    // Health check parte DOPO che il server è in ascolto
    if (String(process.env.HEALTH_CHECK_ENABLED || "true").toLowerCase() === "true") {
      healthChecker.start();
    } else {
      console.log("[HEALTH] Health check disabilitato (HEALTH_CHECK_ENABLED=false)");
    }
        // Cleanup sessioni scadute ogni 5 min
    setInterval(() => {
      const now = Date.now();
      let removed = 0;
      for (const [k, v] of sessionModels.entries()) {
        if (now - v.ts > SESSION_TTL_MS) {
          sessionModels.delete(k);
          removed++;
        }
      }
      if (removed > 0) console.log(`[AFFINITY] Cleanup: rimosse ${removed} sessioni scadute`);
    }, 5 * 60 * 1000).unref();
  });
}

startServer().catch(err => {
  console.error("[FATAL] Impossibile avviare server:", err);
  bandit.close();
  process.exit(1);
});
