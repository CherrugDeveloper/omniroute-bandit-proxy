import express from "express";
import "dotenv/config";
import { EventEmitter } from "events";
import path from "path";
import { fileURLToPath } from "url";
import { DiscountedUCB1Bandit } from "./bandit.mjs";
import { HealthChecker } from "./health-check.mjs";
import { Notifier } from "./notifier.mjs";

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
  const isPolling = req.path.startsWith("/v1/metrics") || req.path.startsWith("/v1/logs") || req.path.startsWith("/v1/active");
  if (isApi && !isPolling) {
    console.log(`[PROXY] ${req.method} ${req.path}`);
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

let requestCounter = 0;
function newRequestId() {
  return `req-${Date.now()}-${++requestCounter}`;
}

function trackRequestStart(id, meta) {
  activeRequests.set(id, {
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
  return Array.from(activeRequests.values()).map(r => ({
    ...r,
    elapsedMs: now - r.startTime,
    elapsedSec: Math.round((now - r.startTime) / 100) / 10
  })).sort((a, b) => b.startTime - a.startTime);
}

// Ultime richieste completate (per mostrare activity quando idle)
const recentRequests = new RingBuffer(5);

function trackRequestComplete(id, meta) {
  const r = activeRequests.get(id);
  if (r) {
    recentRequests.push({
      ...r,
      ...meta,
      endedAt: Date.now(),
      durationSec: Math.round((Date.now() - r.startTime) / 100) / 10
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

app.get("/v1/metrics", requireAuth, (req, res) => {
  try {
    res.json(bandit.getMetrics());
  } catch (e) {
    console.error("[API] Errore /v1/metrics:", e.message);
    res.status(500).json({ error: e.message });
  }
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
  const upstreamTimeoutMs = parseInt(process.env.UPSTREAM_TIMEOUT_MS) || 60000;

  bandit.recordRequest(); // +1 per ogni richiesta ricevuta

  // === Stima token e (eventuale) auto-compress del contesto ===
  const autoCompress = String(req.get("x-auto-compress") || "").toLowerCase() === "true";
  let estimatedTokens = bandit.estimateTokens(req.body);
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
    console.log(`[TOOLS] Richiesta di summarization rilevata → tool_calls non obbligatori`);
  }
  if (requireTools) {
    console.log(`[TOOLS] Richiesta con ${req.body.tools.length} tools → solo modelli tool-capable`);
  }
  let attempt = 0;
  let controller = null;
  let timeoutHandle = null;

  const providerCount = bandit.getProviderCount();
  const maxAttempts = forceModel ? 1 : Math.min(500, providerCount * 4 + 100);
  const startedAt = Date.now();
  const MAX_TOTAL_MS = parseInt(process.env.MAX_TOTAL_MS) || 10 * 60 * 1000;

  const cleanup = () => {
    if (timeoutHandle) { clearTimeout(timeoutHandle); timeoutHandle = null; }
    if (controller) { controller.abort(); controller = null; }
  };

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
      model = bandit.selectModel(excluded, null, estimatedTokens, requireTools);
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
        bandit.recordFeedback(model, false, 0, { message: txt, status: r.status });
        excluded.add(model);
        trackRequestUpdate(requestId, { status: `error-${r.status}`, lastError: txt.slice(0, 100) });
        continue;
      }

      if (stream) {
        // Se gli header sono già stati inviati (stream già aperto), non possiamo ritentare
        if (res.headersSent) {
          console.error(`[RETRY BLOCKED] headers già inviati per ${model}, stream chiuso`);
          bandit.recordFeedback(model, false, 0, { message: "stream already started" });
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
        let accumulated = "";   // ← NUOVO: accumula tutto il testo

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            if (value) {
              const chunk = dec.decode(value, { stream: true });

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

          if (!streamFailed && streamStarted) {
            // validazione
            const streamInvalid = validateStreamAccumulated(accumulated, { requireTools });
            if (requireTools) {
              const tcMatches = accumulated.match(/"tool_calls"/g);
              console.log(`[RESPONSE-STREAM] ${model} | tool_calls found: ${tcMatches?.length || 0}`);
            }
            if (streamInvalid) {
              console.error(`[STREAM INVALID] ${model}: ${streamInvalid}`);
              bandit.recordFeedback(model, false, 0, { message: streamInvalid });
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
            bandit.recordFeedback(model, true, rewardScore, null);
            console.log(`[SUCCESS] ${model} in ${dur.toFixed(2)}s (reward: ${rewardScore.toFixed(3)})`);
            trackRequestUpdate(requestId, { status: "success", lastDurationSec: dur });
          } else if (streamFailed) {
            bandit.recordFeedback(model, false, 0, { message: "stream error" });
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
          bandit.recordFeedback(model, false, 0, { message: e.message });
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
          bandit.recordFeedback(model, false, 0, { message: invalidReason });
          excluded.add(model);
          continue;
        }

        const rewardScore = Math.max(0, 1.0 - (dur / 30));
        bandit.recordFeedback(model, true, rewardScore, null);
        console.log(`[SUCCESS] ${model} in ${dur.toFixed(2)}s (reward: ${rewardScore.toFixed(3)})`);
        trackRequestUpdate(requestId, { status: "success", lastDurationSec: dur });
        cleanup();
        return res.json(data);
      }
    } catch (e) {
      if (timeoutHandle) { clearTimeout(timeoutHandle); timeoutHandle = null; }

      if (e.name === "AbortError") {
        console.error(`[ABORT] ${model}: timeout or client disconnect`);
        bandit.recordFeedback(model, false, 0, { message: "timeout/abort" });
      } else {
        console.error(`[FETCH ERR] ${model}: ${e.message}`);
        bandit.recordFeedback(model, false, 0, { message: e.message });
      }
      excluded.add(model);
    }
  }

  cleanup();
  res.status(502).json({ error: { message: `${attempt - 1} tentativi esauriti su ${maxAttempts}`, status: 502 } });
});

// ========================================
// ERROR HANDLERS GLOBALI
// ========================================

process.on("unhandledRejection", (reason) => {
  console.error("[UNHANDLED REJECTION]", reason);
  process.exit(1);
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

  app.listen(PORT, "127.0.0.1", () => {
    console.log(`[PROXY] ✓ Server avviato su http://127.0.0.1:${PORT}`);
    console.log(`[DASHBOARD] ✓ Dashboard disponibile su http://127.0.0.1:${PORT}/dashboard`);
    console.log(`[CONFIG] Timeout upstream: ${process.env.UPSTREAM_TIMEOUT_MS || 60000}ms`);
    if (!REQUIRE_AUTH) {
  console.warn("[SECURITY] DASHBOARD_TOKEN non configurato: le API di controllo sono esposte senza autenticazione");
} else {
  console.log("[SECURITY] Auth attiva sulle API di controllo");
}
  });
  if (String(process.env.HEALTH_CHECK_ENABLED || "true").toLowerCase() === "true") {
    healthChecker.start();
  } else {
    console.log("[HEALTH] Health check disabilitato (HEALTH_CHECK_ENABLED=false)");
  }
}

startServer().catch(err => {
  console.error("[FATAL] Impossibile avviare server:", err);
  bandit.close();
  process.exit(1);
});
