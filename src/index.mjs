import express from "express";
import { createHash } from "node:crypto";
import * as tracker from "./request-tracker.mjs";
console.log("[STARTUP] Server loading index.mjs");
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { DiscountedUCB1Bandit } from "./bandit.mjs";
import { HealthChecker, sanitizeBaseUrl, buildEndpointUrl } from "./health-check.mjs";
import { Notifier } from "./notifier.mjs";
import { initRegistry, detectProfile, listDiscovered, labelDiscovered, registryStats, registrySignatures, dismissDiscovered } from './modes-registry.mjs';
import { createThrottledLogger, isLowValueNoise, buildDenylistRegex, isCorsDebugEnabled, isDebugVerboseEnabled, readDebugVerboseTtlMs, createTtlFlag, isPollingPath } from "./log-throttle.mjs";
import fs from "node:fs";
EventEmitter.defaultMaxListeners = 50;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use((req, res, next) => {
  // R1: this middleware sits upstream of every other layer, so it used to log
  // one line per request — including every dashboard poll.  Opt-in via
  // CORS_DEBUG=true (default: silent).
  if (isCorsDebugEnabled()) {
    console.log(`[CORS/DEBUG] Incoming ${req.method} ${req.path} from origin: ${req.headers.origin || 'direct/same-origin'}`);
  }
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-token");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});
app.use(express.json({ limit: "50mb" }));

/** Model-id fragments that identify an image-generation model. */
const IMAGE_MODEL_PATTERNS = [
  'dall-e', 'stable-diffusion', 'midjourney', 'flux',
  'imagen', 'sdxl', 'sd-xl', 'playground', 'aihorde'
];

/**
 * Strict verb + image-noun adjacency.
 *
 * The previous heuristic ("any ambiguous verb anywhere" + "any image noun anywhere")
 * produced false positives on ordinary coding prompts such as
 * "design the new icon for the app" or "Can you render the scene for me?".
 * Now the noun must directly follow the verb (article + up to 2 adjectives allowed).
 */
const STRICT_IMAGE_INTENT_RE =
  /\b(?:draw|paint|render|visualize|illustrate|sketch|generate|create|make)\s+(?:an?\s+)?(?:[a-z][\w-]*\s+){0,2}?(?:portrait|painting|picture|image|artwork|illustration|landscape|wallpaper|avatar|banner|sunset)\b/i;

export function isImageGenerationRequest(body) {
   // Handle null or undefined body
   if (!body) {
     return false;
   }

   const modelId = body.model ? String(body.model).toLowerCase() : null;
   const isImageModel =
     !!modelId &&
     (IMAGE_MODEL_PATTERNS.some(pattern => modelId.includes(pattern)) || modelId.startsWith('aihorde/'));

   const hasImageParams =
     (body.n !== undefined && typeof body.n === 'number' && body.n > 0) ||
     (body.size && /^\d+x\d+$/.test(body.size)) ||
     (body.response_format && ['b64_json', 'url'].includes(body.response_format));

   // R1 - the requested model is an image-generation model: always an image request.
   if (isImageModel) {
     console.log(`[DEBUG] isImageGenerationRequest: image model id (${modelId}) -> true`);
     return true;
   }

   // R2 - image-generation payload shape: a `prompt` without any `messages`.
   if (body.prompt && (!body.messages || body.messages.length === 0)) {
     // Validate image-specific parameters if present
     const hasInvalidImageParams =
       (body.n !== undefined && (typeof body.n !== 'number' || body.n <= 0)) ||
       (body.size && !/^\d+x\d+$/.test(body.size)) ||
       (body.response_format && !['b64_json', 'url'].includes(body.response_format));

     if (hasInvalidImageParams) {
       console.log(`[DEBUG] isImageGenerationRequest: prompt without messages but invalid image params -> false`);
       return false;
     }

     // Image-specific parameters (n / size / response_format) confirm the intent.
     if (hasImageParams) {
       console.log(`[DEBUG] isImageGenerationRequest: prompt without messages + image params -> true`);
       return true;
     }

     // No model at all: cannot be a routed chat completion -> treat as image request.
     if (!modelId) {
       console.log(`[DEBUG] isImageGenerationRequest: prompt without messages and without model -> true`);
       return true;
     }

     // A chat model (gpt-4o, ...) with a `prompt` field and no image params is a
     // regular chat request: NEVER classify it as image generation (false positive).
     console.log(`[DEBUG] isImageGenerationRequest: prompt + chat model (${modelId}) without image params -> false (not image gen)`);
     return false;
   }

   // R3 - explicit image generation intent inside the last user message.
   if (Array.isArray(body.messages) && body.messages.length > 0) {
     const lastUserMessage = body.messages
       .filter(m => m.role === 'user')
       .pop();

     if (lastUserMessage && lastUserMessage.content) {
       const content = typeof lastUserMessage.content === 'string'
         ? lastUserMessage.content
         : JSON.stringify(lastUserMessage.content);

       const contentLower = content.toLowerCase();

       const explicitImagePhrases = [
         'generate image', 'create image', 'generate a picture', 'create a picture',
         'make a picture', 'generate picture', 'text to image', 'image from text',
         'create artwork', 'generate artwork', 'make an image', 'generate an image',
         'create an image'
       ];

       if (explicitImagePhrases.some(phrase => contentLower.includes(phrase))) {
         console.log(`[DEBUG] isImageGenerationRequest: explicit phrase match: ${contentLower}`);
         return true;
       }

       if (STRICT_IMAGE_INTENT_RE.test(content)) {
         console.log(`[DEBUG] isImageGenerationRequest: strict verb+noun intent match: ${contentLower.slice(0, 160)}`);
         return true;
       }
     }
   }

   return false;
 }

export function convertImageGenerationToChatCompletion(imageGenResponse) {
  // Check for missing or empty data array
  if (!imageGenResponse || !imageGenResponse.data || !Array.isArray(imageGenResponse.data) || imageGenResponse.data.length === 0) {
    // Fallback to basic structure if conversion fails
    return {
      id: 'chatcmpl-' + Math.random().toString(36).substr(2, 9),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'image-generation',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: '[Image generated successfully]'
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    };
  }

  // We know we have at least one element in the data array
  // Extract the first image URL or base64 data
  const firstImage = imageGenResponse.data[0];
  let imageContent = '';

  if (firstImage && firstImage.url) {
    imageContent = firstImage.url;
  } else if (firstImage && firstImage.b64_json) {
    imageContent = `data:image/png;base64,${firstImage.b64_json}`;
  } else {
    imageContent = '[Image generated]';
  }

  return {
    id: 'chatcmpl-' + Math.random().toString(36).substr(2, 9),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: imageGenResponse.model || 'image-generation',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: imageContent
      },
      finish_reason: 'stop'
    }],
    usage: {
      prompt_tokens: imageGenResponse.usage?.prompt_tokens || 0,
      completion_tokens: imageGenResponse.usage?.completion_tokens || 0,
      total_tokens: imageGenResponse.usage?.total_tokens || 0
    }
  };
}

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
    if (/^\s*data:\s*\{\s*"error"/m.test(raw)) {
      // Estrai la riga data: che contiene "error" — NON la prima riga data: {...}
      // (il primo data: può essere un keepalive con delta vuoto)
      let payload = "";
      for (const line of raw.split("\n")) {
        const t = line.trim();
        if (t.startsWith("data:") && t.includes('"error"')) {
          payload = t.slice(5).trim();
          break;
        }
      }
      if (!payload) payload = raw.slice(0, 2000);

      let innerMessage = "";
      let status = 0;
      let code = "";
      try {
        const parsed = JSON.parse(payload);
        const errObj = parsed.error || {};
        innerMessage = errObj.message || "";
        code = errObj.code || "";
        if (code === "model_shutdown") status = 410;
        else if (code === "model_not_found") status = 400;
        else if (/unknown provider for model|not supported|model_not_found/i.test(innerMessage)) status = 400;
        else if (/does not exist|not found|no longer available/i.test(innerMessage)) status = 404;
        else if (/quota|rate limit/i.test(innerMessage)) status = 429;
      } catch (_) {}
      console.error(`[SSE ERROR RAW] ${payload.slice(0, 600)}`);
      return { reason: "SSE contains error", status, message: innerMessage || payload.slice(0, 500) };
    }
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
// Compressione d'emergenza: pochi messaggi ma uno è enorme (system/env_details).
// Tronca il messaggio più grande finché il totale scende sotto targetTokens.
function truncateBiggestMessage(body, targetTokens) {
  if (!body || typeof body !== "object") return null;
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) return null;

  const msgText = (m) => {
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) return m.content.map(p => p?.text || "").join("\n");
    return JSON.stringify(m.content || "");
  };
  const msgTokens = (m) => Math.ceil(msgText(m).length / 3);

  // Trova il messaggio più grande
  let idx = 0;
  for (let k = 1; k < messages.length; k++) {
    if (msgTokens(messages[k]) > msgTokens(messages[idx])) idx = k;
  }
  const big = messages[idx];
  const bigText = msgText(big);
  const bigTokens = msgTokens(big);

  // Se è già piccolo, non c'è nulla da tagliare
  if (bigTokens < 2000) return null;

  // Calcola quanti char tenere: proporzione rispetto al target
  const totalTokens = messages.reduce((s, m) => s + msgTokens(m), 0);
  const keepRatio = Math.max(0.15, Math.min(0.9, targetTokens / Math.max(1, totalTokens)));
  const keepChars = Math.max(2000, Math.ceil(bigText.length * keepRatio));
  const removedChars = bigText.length - keepChars;
  const removedTokens = Math.ceil(removedChars / 3);

  const truncated = bigText.slice(0, keepChars)
    + `\n\n[... troncato: ${removedTokens} token rimossi per limite contesto ...]`;

  const newMsg = Array.isArray(big.content)
    ? { ...big, content: [{ type: "text", text: truncated }] }
    : { ...big, content: truncated };

  const newMessages = messages.slice();
  newMessages[idx] = newMsg;
  const newBody = { ...body, messages: newMessages };
  return { body: newBody, omitted: 0, truncatedBig: true, removedTokens };
}
// ========================================
// CONTEXT COMPRESSION (sliding window per agent di coding)
// ========================================
// Mantiene: system + primo user + ultimi N messaggi.
// Rispetta i confini dei blocchi tool_call/tool result (non li spezza mai).
function compressBody(body, targetTokens) {
  if (!body || typeof body !== "object") return null;
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) return null;
  // Con pochi messaggi (2-5), la compressione strutturale non ha nulla da rimuovere.
  // Tronca direttamente il messaggio più grande.
  if (messages.length < 6) {
    return truncateBiggestMessage(body, targetTokens);
  }
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
  // Iterative reduction instead of recursive calls to prevent Maximum call stack size exceeded
  let currentBody = newBody;
  let totalOmitted = omitted;
  let iterations = 0;
  
  while (iterations < 10) {
    const s = JSON.stringify(currentBody);
    const newTokens = Math.ceil(s.length / 3);
    if (newTokens <= targetTokens) break;

    const nextRes = truncateBiggestMessage(currentBody, targetTokens);
    if (!nextRes || !nextRes.body) break;
    currentBody = nextRes.body;
    totalOmitted += (nextRes.omitted || 0);
    iterations++;
  }

  return { body: currentBody, omitted: totalOmitted };
}
// Access log: solo le route API (v1), escludendo metriche e log (che vengono
// pollate ogni secondo dalla dashboard). Esclude anche gli asset statici.
app.use((req, res, next) => {
  if (req.path === "/manifest.json") {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  }
  next();
});

// R4: consolidated throttling helpers (see src/log-throttle.mjs).
// Both the dashboard-stats and the /v1/models log lines use the SAME helper
// factory; only the window differs.  Env var names are preserved.
const MODELS_LOG_THROTTLE_MS = parseInt(process.env.MODELS_LOG_THROTTLE_MS || "60000", 10);
const DASHBOARD_STATS_LOG_INTERVAL_MS = parseInt(process.env.DASHBOARD_STATS_LOG_INTERVAL_MS || "60000", 10);
// R3: throttles the "[DEBUG server] /v1/dashboard/stats serving stats:" line.
const dashboardStatsLogger = createThrottledLogger("dashboard-stats", DASHBOARD_STATS_LOG_INTERVAL_MS);
// R4: throttles the "[API] GET /v1/models ..." line.
const modelsLogger = createThrottledLogger("models", MODELS_LOG_THROTTLE_MS);
// R2: the middleware-level [DASHBOARD_STATS_DEBUG] diagnostic line.
const dashboardStatsDebugLogger = createThrottledLogger("dashboard-stats-debug", DASHBOARD_STATS_LOG_INTERVAL_MS);

// Single entry point: canonical per-request log + optional verbose body inspection
app.use((req, res, next) => {
  const isApi = req.path.startsWith("/v1/");
  // R5: use consolidated isPollingPath helper from log-throttle.mjs
  const isPolling = isPollingPath(req.path);
  if (req.path === '/v1/dashboard/stats') {
    const { log, message, suppressed } = dashboardStatsDebugLogger.decide(
      `[DASHBOARD_STATS_DEBUG] isApi=${isApi}, isPolling=${isPolling}, condition=${isApi && !isPolling}`
    );
    if (log && (isDebugVerbose() || process.env.DASHBOARD_STATS_DEBUG === 'true')) {
      console.log(message + (suppressed > 0 ? ` (soppresse ${suppressed} richieste precedenti)` : ""));
    }
  }
  if (isApi && !isPolling) {
    let suffix = '';
    if (req.method === 'POST' && req.path === '/v1/chat/completions') {
      suffix = req.get('x-source') === 'training' ? ' [TRAIN]' : ' [ZOO]';
    }
    if (isDebugVerbose()) {
      console.log(`[DEBUG] Incoming ${req.method} ${req.path}${suffix} source=${req.get('x-source') || '-'} client=${req.ip || req.connection?.remoteAddress || '?'}`);
    } else {
      console.log(`[PROXY] ${req.method} ${req.path}${suffix}`);
    }
  }
  next();
});

// API routes must be registered before static middleware to avoid 404s for /v1/* paths
// Static files served after API routes

const bandit = new DiscountedUCB1Bandit();

const notifier = new Notifier({
  urls: (process.env.WEBHOOK_URLS || "").split(",").map(s => s.trim()).filter(Boolean),
  enabled: String(process.env.WEBHOOK_ENABLED || "true").toLowerCase() === "true",
  throttleMs: parseInt(process.env.WEBHOOK_THROTTLE_MS || "300000", 10),
  telegramChatId: process.env.TELEGRAM_CHAT_ID || null
});
bandit.notifier = notifier;

const PORT = process.env.PORT || 8080;
// Parse per-provider health check intervals from environment variable
// Format: "openrouter=180000,groq=600000,nvidia=300000,gemini=300000,mistral=300000"
function parseProviderIntervals(envVar) {
  const intervals = {};
  if (!envVar) return intervals;
  
  const pairs = envVar.split(',');
  for (const pair of pairs) {
    const [provider, interval] = pair.split('=');
    if (provider && interval) {
      const parsed = parseInt(interval.trim(), 10);
      if (!isNaN(parsed) && parsed > 0) {
        intervals[provider.trim()] = parsed;
      }
    }
  }
  return intervals;
}

const providerIntervals = parseProviderIntervals(process.env.HEALTH_CHECK_PROVIDER_INTERVALS_MS);

const healthChecker = new HealthChecker(bandit, {
  baseUrl: sanitizeBaseUrl(process.env.OMNIROUTE_BASE_URL, "http://127.0.0.1:20128/v1"),
  apiKey: process.env.OMNIROUTE_API_KEY || "",
  intervalMs: parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || "300000", 10),
  providerIntervals,
  batchSize: parseInt(process.env.HEALTH_CHECK_BATCH_SIZE || "20", 10),
  timeoutMs: parseInt(process.env.HEALTH_CHECK_TIMEOUT_MS || "15000", 10),
  verbose: String(process.env.HEALTH_CHECK_VERBOSE || "false").toLowerCase() === "true"
});

// ========================================
// AUTH
// ========================================

const DASHBOARD_TOKEN = (process.env.DASHBOARD_TOKEN || process.env.OMNIROUTE_API_KEY || "").trim();
const isPlaceholderToken = !DASHBOARD_TOKEN || DASHBOARD_TOKEN === "your_api_key_here" || DASHBOARD_TOKEN === "YourSecureTokenHere";
const REQUIRE_AUTH = !isPlaceholderToken && DASHBOARD_TOKEN.length > 0;

function requireAuth(req, res, next) {
  if (!REQUIRE_AUTH) return next();
  const token = req.get("x-api-token") || req.query.token;
  const validToken = (process.env.DASHBOARD_TOKEN || "").trim() || (process.env.OMNIROUTE_API_KEY || "").trim();
  const match = token === validToken || (process.env.DASHBOARD_TOKEN && token === process.env.DASHBOARD_TOKEN.trim()) || (process.env.OMNIROUTE_API_KEY && token === process.env.OMNIROUTE_API_KEY.trim());
  if (isDebugVerbose()) {
    console.log(`[DEBUG AUTH] Checking auth for ${req.path}: REQUIRE_AUTH=${REQUIRE_AUTH}, tokenProvided=${Boolean(token)}, match=${match}`);
  }
  if (!match) {
    if (isDebugVerbose()) {
      console.warn(`[DEBUG server] Unauthorized access attempt to ${req.path}. Token provided: ${Boolean(token)}, expected length: ${validToken.length}, received length: ${token ? token.length : 0}`);
    }
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

  clear() {
    this.buffer = [];
    this.index = 0;
  }

  replaceLast(item) {
    if (this.buffer.length === 0) return;
    const lastIdx = (this.buffer.length < this.maxSize) ?
                    (this.buffer.length - 1) :
                    ((this.index - 1 + this.maxSize) % this.maxSize);
    this.buffer[lastIdx] = item;
  }
}

const logBuffer = new RingBuffer(1000);

// ========================================
// ACTIVE REQUESTS TRACKER
// ========================================
// Traccia le richieste in corso con: modello scelto, tentativo, tempo, tier
// Toggle debug verbose (in memoria, si resetta al restart)
// R2: seeded from DEBUG_VERBOSE env (default false) and expires after
// DEBUG_VERBOSE_TTL_MS (default 15 min = 900000ms).
const debugFlag = createTtlFlag(
  isDebugVerboseEnabled(),
  readDebugVerboseTtlMs()
);

function isDebugVerbose() {
  return debugFlag.isActive();
}
// === SESSION AFFINITY ===
// Mappa sessionKey → { model, ts }
// Garantisce che la stessa conversazione usi sempre lo stesso modello
// (evita che il bandit cambi modello a metà task, perdendo artifact/tool state)
const sessionModels = new Map();
// Sessione → Map<modelId, failCount>. Un modello che sbaglia 2+ tool call
// nella stessa sessione non viene più ripinnato finché la sessione è attiva.
const sessionBlacklist = new Map();
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
// Moltiplicatore reward basato sul tipo di tool chiamato.
// I modelli che rispondono con "ask_followup_question" invece di agire
// prendono reward bassi → UCB1 li declassa.
function computeToolRewardMultiplier(toolNames, hasWrittenInSession) {
  if (!toolNames || toolNames.length === 0) return 0.6;
  const first = String(toolNames[0] || '').toLowerCase();

  if (first === 'ask_followup_question') return 0.5;
  if (first === 'update_todo_list') return 0.8;

  // attempt_completion senza mai aver scritto → conclusione prematura
  if (first === 'attempt_completion') {
    return hasWrittenInSession ? 1.0 : 0.3;
  }

  // Delegare ad un'altra mode è sempre un'azione valida
  if (first === 'new_task') return 1.0;

  // Tool di scrittura/modifica: reward pieno
  const writeTools = ['apply_diff','write_to_file','replace_in_file',
                      'execute_command','insert_content'];
  if (writeTools.includes(first)) return 1.0;

  // Tool di lettura/ricerca: neutro
  const readTools = ['read_file','list_files','search_files','codebase_search'];
  if (readTools.includes(first)) return 1.0;

  return 0.9;
}

// Ritorna true se almeno un assistant message nella history ha chiamato
// un tool di scrittura. Serve per capire se attempt_completion è prematuro.
function sessionHasWritten(messages) {
  const writeTools = new Set(['apply_diff','write_to_file','replace_in_file',
                              'execute_command','insert_content']);
  const msgs = messages || [];

  // Pass 1: raccogli gli id dei tool_call di scrittura
  const writeCallIds = new Set();
  for (const m of msgs) {
    if (m.role !== 'assistant' || !Array.isArray(m.tool_calls)) continue;
    for (const tc of m.tool_calls) {
      const name = (tc.function?.name || tc.name || '').toLowerCase();
      if (writeTools.has(name) && tc.id) writeCallIds.add(tc.id);
    }
  }

  // Fallback legacy: nessun id → comportamento originale (qualsiasi write call → true)
  if (writeCallIds.size === 0) {
    for (const m of msgs) {
      if (m.role !== 'assistant' || !Array.isArray(m.tool_calls)) continue;
      for (const tc of m.tool_calls) {
        const name = (tc.function?.name || tc.name || '').toLowerCase();
        if (writeTools.has(name)) return true;
      }
    }
    return false;
  }

  // Pass 2: cerca i tool_result associati e marca quelli falliti
  const FAIL_RE = /unable to apply all diff|unable to apply any part|no sufficiently similar|edit unsuccessful/i;
  const failedIds = new Set();
  for (const m of msgs) {
    if (m.role !== 'tool') continue;
    const id = m.tool_call_id || m.toolCallId;
    if (!id || !writeCallIds.has(id)) continue;
    const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '');
    if (FAIL_RE.test(c)) failedIds.add(id);
  }

  // True se almeno un write call NON è fallito
  for (const id of writeCallIds) {
    if (!failedIds.has(id)) return true;
  }
  return false;
}
function trackRequestStart(id, meta) {
  tracker.trackRequestStart(id, meta);
}

function trackRequestUpdate(id, patch) {
  tracker.trackRequestUpdate(id, patch);
}

function trackRequestEnd(id) {
  tracker.trackRequestEnd(id);
}

function getActiveRequestsSnapshot() {
  const now = Date.now();
  return tracker.getActiveRequestsValues().map(r => {
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
  const r = tracker.getRequest(id);
  if (r) {
    const info = r.model ? bandit.getModelInfo(r.model) : null;
    const rank = r.model ? bandit.getModelRank(r.model) : null;
    recentRequests.push({
      ...r,
      ...meta,
      status: r.status || meta?.status || 'success',
      lastError: r.lastError || meta?.lastError || null,
      endedAt: Date.now(),
      durationSec: Math.round((Date.now() - r.startTime) / 100) / 10,
      N: info?.N ?? null,
      avg: info?.avg ?? null,
      trend: info?.trend ?? 'flat',
      rank,
      selectionHistory: r.selectionHistory || bandit.getLastSelectionHistory(),
      triedModels: r.triedModels || []
    });
  }
}

function pushLog(message) {
   // R6: ring-buffer denylist — low-value polling/debug noise is kept on the
   // terminal but excluded from the ring buffer (unless LOG_BUFFER_DENYLIST overrides).
   const denylistRegex = buildDenylistRegex(process.env.LOG_BUFFER_DENYLIST);
   if (isLowValueNoise(message, denylistRegex)) {
     return;
   }
   // Event grouping: if the same message repeats within 5 seconds, increment counter instead of new log entry
   const now = Date.now();
   if (global.lastLogMessage === message && global.lastLogTime && (now - global.lastLogTime) < 5000) {
      // Same message within 5 seconds, increment counter
      global.logMessageCount++;
      // Update the last entry in logBuffer to show the count
      const lastEntry = logBuffer.getAll().pop();
      if (lastEntry && lastEntry.includes(message)) {
        // Replace the last entry with grouped version
        logBuffer.replaceLast(`[${new Date().toLocaleTimeString()}] ${message} (x${global.logMessageCount + 1})`);
      }
   } else {
      // New message or timeout exceeded, reset counter and log normally
      if (global.logMessageCount > 0) {
        // If we had a grouped message, add it with its final count
        const groupedMessage = `${global.lastLogMessage} (x${global.logMessageCount + 1})`;
        logBuffer.push(`[${new Date().toLocaleTimeString()}] ${groupedMessage}`);
      }
      global.lastLogMessage = message;
      global.logMessageCount = 0;
      global.lastLogTime = now;
      const timestamp = new Date().toLocaleTimeString();
      logBuffer.push(`[${timestamp}] ${message}`);
   }
}

// Consolidated request outcome log
function logSuccess(model, dur, opts = {}) {
  const { stream, toolNames, hasWritten, rewardScore, baseReward } = opts;
  const tag = stream ? "[SUCCESS-STREAM]" : "[SUCCESS]";
  console.log(`${tag} ${model} in ${dur.toFixed(2)}s ` +
              `(reward: ${(rewardScore || 0).toFixed(3)} = base ${(baseReward || 0).toFixed(3)} ` +
              `x ${(toolNames ? 0.6 : 1).toFixed(1)} tool=${toolNames?.[0] || 'none'} hasWritten=${hasWritten ?? '?'})`);
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
      console.warn(`[API] 400 Error: Invalid request body from ${req.ip || req.connection?.remoteAddress}`);
      // Don't insert into request_logs here - started_at will be set after model selection
      bandit._incrMeta("totalRequests");
      bandit.recordRequestError(400, "Invalid request body");
      return res.status(400).json({ error: { message: "Invalid request body" } });
    }
    if (!req.body.messages && !req.body.prompt && !req.body.model) {
      console.warn(`[API] 400 Error: Missing required fields from ${req.ip || req.connection?.remoteAddress}`);
      // Don't insert into request_logs here - started_at will be set after model selection
      bandit._incrMeta("totalRequests");
      bandit.recordRequestError(400, "Missing required fields");
      return res.status(400).json({ error: { message: "Missing required fields" } });
    }
  }
  next();
});

// ========================================
// ROUTES
// ========================================

app.get("/", (req, res) => {
  const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  res.redirect("/dashboard" + query);
});

app.get("/dashboard", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.sendFile(path.join(__dirname, "../public/dashboard.html"));
});
app.get('/v1/debug/status', requireAuth, (req, res) => {
  res.json({ verbose: debugFlag.isEnabled() });
});
app.get('/v1/version', (req, res) => {
  try {
    let version = 'dev';
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
      if (pkg.version) version = 'v' + pkg.version;
    } catch {}
    try {
      const changelog = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
      const m = changelog.match(/^##\s+(v[\d.]+)/m);
      if (m && m[1]) version = m[1];
    } catch {}
    res.json({ version });
  } catch {
    res.json({ version: 'dev' });
  }
});
app.get('/v1/changelog', (req, res) => {
  try {
    const content = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
    res.json({ changelog: content });
  } catch {
    res.json({ changelog: '# Changelog\n\nNessun changelog disponibile.' });
  }
});
app.post('/v1/debug/toggle', requireAuth, express.json(), (req, res) => {
  const desired = req.body?.verbose;
  const next = typeof desired === 'boolean' ? desired : !debugFlag.isEnabled();
  debugFlag.set(next);
  console.log(`[DEBUG] verbose=${debugFlag.isEnabled()}`);
  res.json({ verbose: debugFlag.isEnabled() });
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

app.get("/v1/dashboard/stats", requireAuth, (req, res) => {
  try {
    const stats = bandit.getDashboardStats();
    const { log, message, suppressed } = dashboardStatsLogger.decide(
      `[DEBUG server] /v1/dashboard/stats serving stats: ${JSON.stringify({
        totalRequests: stats.totalRequests,
        totalObservations: stats.totalObservations,
        modelsActive: stats.modelsActive,
        totalModels: stats.totalModels
      })}`
    );
    if (log) {
      console.log(message + (suppressed > 0 ? ` (soppresse ${suppressed} richieste precedenti)` : ""));
    }
    res.json(stats);
  } catch (e) {
    console.error("[API] Errore /v1/dashboard/stats:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/v1/consideration", requireAuth, (req, res) => {
  try {
    res.json({ consideration: bandit.getLastSelectionHistory() });
  } catch (e) {
    console.error("[API] Errore /v1/consideration:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/v1/consideration-logs", requireAuth, (req, res) => {
  try {
    res.json({ consideration: bandit.getLastSelectionHistory() });
  } catch (e) {
    console.error("[API] Errore /v1/consideration-logs:", e.message);
    res.status(500).json({ error: e.message });
  }
});


app.get("/v1/models", requireAuth, (req, res) => {
  try {
    const source = req.query.source || "prod";
    const filters = {
      provider: req.query.provider,
      status: req.query.status,
      minN: req.query.minN !== undefined ? parseInt(req.query.minN) : undefined,
      minAvg: req.query.minAvg !== undefined ? parseFloat(req.query.minAvg) : undefined,
      search: req.query.search,
      limit: req.query.limit !== undefined ? parseInt(req.query.limit) : undefined
    };
    const models = bandit.getModels(source, filters);

    const { log, message, suppressed } = modelsLogger.decide(
      `[API] GET /v1/models source=${source} results=${models.length}`
    );
    if (log) {
      console.log(message + (suppressed > 0 ? ` (soppresse ${suppressed} richieste precedenti)` : ""));
    }

    res.json({ models });
  } catch (e) {
    console.error("[API] Errore /v1/models:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/v1/models/summary", requireAuth, (req, res) => {
  try {
    const source = req.query.source || "prod";
    const summary = bandit.getModelsSummary(source);
    res.json(summary);
  } catch (e) {
    console.error("[API] Errore /v1/models/summary:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/v1/providers", requireAuth, (req, res) => {
  try {
    const providers = bandit.getProviders();
    res.json({ providers });
  } catch (e) {
    console.error("[API] Errore /v1/providers:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/v1/quota", requireAuth, (req, res) => {
  try {
    const quotaData = bandit.quota.snapshot();
    res.json({ quota: quotaData });
  } catch (e) {
    console.error("[API] Errore /v1/quota:", e.message);
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
  res.json({ count: tracker.getActiveRequestsCount(), ts: Date.now() });
});

app.get("/v1/active", requireAuth, (req, res) => {
  try {
    res.json({
      count: tracker.getActiveRequestsCount(),
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
    recentRequests.clear();
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
// SCRIPT MANAGER ENDPOINTS
// ========================================

app.get("/v1/scripts", requireAuth, (req, res) => {
  try {
    const scriptsDir = path.join(__dirname, "../scripts");
    const files = fs.readdirSync(scriptsDir);
    const scripts = files
      .filter(f => f.endsWith('.mjs') || f.endsWith('.sh'))
      .map(f => {
        const fullPath = path.join(scriptsDir, f);
        const stats = fs.statSync(fullPath);
        return {
          name: f,
          path: fullPath,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          isExecutable: (stats.mode & 0o111) !== 0,
          type: f.endsWith('.mjs') ? 'javascript' : 'shell'
        };
      });
    res.json({ scripts });
  } catch (e) {
    console.error("[API] Errore lettura script:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post("/v1/scripts/execute", requireAuth, express.json(), (req, res) => {
  try {
    const { scriptPath, args = [] } = req.body || {};
    if (!scriptPath) {
      return res.status(400).json({ error: "scriptPath richiesto" });
    }

    // Validazione del percorso per prevenire path traversal
    const scriptsDir = path.join(__dirname, "../scripts");
    const normalizedPath = path.normalize(scriptPath);
    const absolutePath = path.join(scriptsDir, normalizedPath);

    if (!absolutePath.startsWith(scriptsDir)) {
      return res.status(403).json({ error: "Percorso non autorizzato" });
    }

    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: "Script non trovato" });
    }

    // Esecuzione dello script
    const isShell = absolutePath.endsWith('.sh');

    let command, options;
    if (isShell) {
      command = "bash";
      options = { shell: true };
    } else {
      command = "node";
      options = {};
    }

    const child = spawn(command, [absolutePath, ...args], {
      cwd: scriptsDir,
      stdio: ["pipe", "pipe", "pipe"],
      ...options
    });

    const output = {
      pid: child.pid,
      command: `${command} ${absolutePath} ${args.join(' ')}`,
      startTime: Date.now(),
      status: "running"
    };

    let stdoutData = "";
    let stderrData = "";

    const writeOutputFile = () => {
      const outputFile = path.join(scriptsDir, `.script-output-${child.pid}.json`);
      const currentOutput = {
        ...output,
        stdout: stdoutData,
        stderr: stderrData,
        endTime: output.endTime || Date.now(),
        duration: (output.endTime || Date.now()) - output.startTime
      };
      try {
        fs.writeFileSync(outputFile, JSON.stringify(currentOutput, null, 2));
      } catch (err) {
        console.error("[API] Errore scrittura output script in tempo reale:", err.message);
      }
    };

    child.stdout?.on("data", (data) => {
      stdoutData += data.toString();
      writeOutputFile();
    });

    child.stderr?.on("data", (data) => {
      stderrData += data.toString();
      writeOutputFile();
    });

    child.on("close", (code) => {
      output.status = "completed";
      output.exitCode = code;
      output.stdout = stdoutData;
      output.stderr = stderrData;
      output.endTime = Date.now();
      output.duration = output.endTime - output.startTime;

      // Salva l'output in un file per riferimento
      const outputFile = path.join(scriptsDir, `.script-output-${child.pid}.json`);
      fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
    });

    res.json(output);
  } catch (e) {
    console.error("[API] Errore esecuzione script:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/v1/scripts/output/:pid", requireAuth, (req, res) => {
  try {
    const { pid } = req.params;
    const scriptsDir = path.join(__dirname, "../scripts");
    const outputFile = path.join(scriptsDir, `.script-output-${pid}.json`);

    if (!fs.existsSync(outputFile)) {
      return res.status(404).json({ error: "Output script non trovato" });
    }

    const output = JSON.parse(fs.readFileSync(outputFile, "utf8"));
    res.json(output);
  } catch (e) {
    console.error("[API] Errore lettura output script:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// ========================================
// PROXY ENDPOINTS
// ========================================

app.post("/v1/images/generations", async (req, res) => {
  const requestId = newRequestId();
  const { prompt, model, n, size, response_format, user } = req.body || {};

  if (!prompt) {
    return res.status(400).json({ error: { message: "Prompt is required" } });
  }

  trackRequestStart(requestId, {
    source: "zoo",
    model: model || null,
    status: "starting",
    clientIp: req.ip || req.connection?.remoteAddress || "?"
  });

  res.once("finish", () => { trackRequestComplete(requestId); trackRequestEnd(requestId); });
  res.once("close", () => { trackRequestComplete(requestId); trackRequestEnd(requestId); });

  // Increment totalRequests counter but don't insert into request_logs yet
  bandit._incrMeta("totalRequests");

  try {
    const selected = await bandit.selectModel(new Set(), 0, false, true);
    // Record started_at AFTER model selection to exclude selection time from latency
    bandit.recordRequestStarted(selected, bandit._getProvider(selected));

    if (!selected) {
      const errMsg = "No image generation models available";
      console.warn(`[API] 503 Error: ${errMsg}`);
      trackRequestUpdate(requestId, { status: "error-503", lastError: errMsg });
      return res.status(503).json({ error: { message: errMsg } });
    }

    // TODO: Implement upstream call and response formatting
    res.status(501).json({ error: { message: "Not implemented yet" } });
  } catch (e) {
    console.error("[API] Errore images/generations:", e.message);
    res.status(500).json({ error: { message: e.message } });
  }
});

app.post(["/v1/chat/completions", "/chat/completions"], async (req, res) => {
  const { stream } = req.body || {};
  const requestId = newRequestId();

  trackRequestStart(requestId, {
    source: (req.get("x-source") === "training") ? "training" :
            (req.get("x-source") === "changelog") ? "changelog" : "zoo",
    model: null,
    attempt: 0,
    stream: !!stream,
    status: "starting",
    clientIp: req.ip || req.connection?.remoteAddress || "?"
  });

  // Cleanup a fine richiesta (success, error, disconnect)
  res.once("finish", () => { trackRequestComplete(requestId); trackRequestEnd(requestId); });
  res.once("close", () => { trackRequestComplete(requestId); trackRequestEnd(requestId); });
  const baseUrl = sanitizeBaseUrl(process.env.OMNIROUTE_BASE_URL, "http://127.0.0.1:20128/v1");
  const apiKey = process.env.OMNIROUTE_API_KEY;

  // Increment totalRequests counter but don't insert into request_logs yet
  // started_at will be set after model selection to exclude selection time from latency
  bandit._incrMeta("totalRequests");
  // === Image generation requests are not allowed via chat completions ===
  if (isImageGenerationRequest(req.body)) {
    const errMsg = "Image generation requests are not supported via chat completions endpoint. Use /v1/images/generations instead.";
    console.warn(`[API] 400 Error: ${errMsg}`);
    // DIAGNOSTIC: dump the offending payload shape to identify the false-positive trigger
    console.warn(`[DIAG-IMGGEN] model=${req.body?.model} keys=${JSON.stringify(Object.keys(req.body || {}))} hasPrompt=${!!req.body?.prompt} hasMessages=${Array.isArray(req.body?.messages) ? req.body.messages.length : "none"} n=${JSON.stringify(req.body?.n)} size=${JSON.stringify(req.body?.size)} response_format=${JSON.stringify(req.body?.response_format)}`);
    if (Array.isArray(req.body?.messages) && req.body.messages.length > 0) {
      const lastUser = req.body.messages.filter(m => m.role === "user").pop();
      console.warn(`[DIAG-IMGGEN] lastUserContent=${JSON.stringify(String(lastUser?.content || "").slice(0, 300))}`);
    }
    bandit.recordRequestError(400, errMsg, req.body?.model || null, null);
    trackRequestUpdate(requestId, { status: "error-400", lastError: errMsg, model: req.body?.model || null });
    return res.status(400).json({
      error: {
        message: errMsg,
        type: "unsupported_request",
        status: 400
      }
    });
  }
  // === Stima token e (eventuale) auto-compress del contesto ===
  let estimatedTokens = bandit.estimateTokens(req.body);
  // Hard cap: se il contesto stimato supera 150k token, rifiuta
  const MAX_CONTEXT_TOKENS = parseInt(process.env.MAX_CONTEXT_TOKENS || "150000");
  // Timeout proporzionale: contesti grandi → prefill più lungo.
  // Scala linearmente (100k = 2x, 200k+ = 3x, cap 3x).
  const baseTimeout = parseInt(process.env.UPSTREAM_TIMEOUT_MS) || 20000;
  const tokenScale = Math.max(1, Math.min(3, Math.ceil((estimatedTokens || 0) / 100000)));
  const upstreamTimeoutMs = baseTimeout * tokenScale;
  if (tokenScale > 1 && isDebugVerbose()) {
    console.log(`[TIMEOUT] scala ${tokenScale}x → ${upstreamTimeoutMs}ms (tokens=${estimatedTokens})`);
  }
  const autoCompress = String(req.get("x-auto-compress") || "").toLowerCase() === "true";
  if (isDebugVerbose()) console.log(`[CONTEXT] autoCompress=${autoCompress} header="${req.get("x-auto-compress") || "<assente>"}" tokens=${estimatedTokens} maxCatalog=${bandit.maxCatalogInput()}`);

    // === MAX_CONTEXT_TOKENS check (con compress d'emergenza se autoCompress) ===
    if (estimatedTokens > MAX_CONTEXT_TOKENS) {
      if (autoCompress) {
        const compressed = compressBody(req.body, MAX_CONTEXT_TOKENS - 500);
        if (compressed && compressed.body) {
          const newTokens = bandit.estimateTokens(compressed.body);
          console.log(`[CONTEXT] Globale ${estimatedTokens} > ${MAX_CONTEXT_TOKENS} → compresso a ${newTokens}`);
          req.body = compressed.body;
          estimatedTokens = newTokens;
        }
      }
      if (estimatedTokens > MAX_CONTEXT_TOKENS) {
        const errMsg = `Context too large (${estimatedTokens} tokens). Max ${MAX_CONTEXT_TOKENS}. Compress or start new chat.`;
        console.warn(`[REJECT] Contesto ${estimatedTokens} > ${MAX_CONTEXT_TOKENS} → 413`);
        bandit.recordRequestError(413, errMsg, req.body?.model || null, null);
        trackRequestUpdate(requestId, { status: "error-413", lastError: errMsg, model: req.body?.model || null });
        return res.status(413).json({
          error: {
            message: `Context too large (${estimatedTokens} tokens). Max ${MAX_CONTEXT_TOKENS}. Compress or start new chat.`,
            type: "context_too_large",
            status: 413
          }
        });
      }
    }
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
  // Initialize attempt counter before session affinity code that references it
  let attempt = 0;
    const fallbackTried = new Set();
    // === Session key per affinity ===
  let sessionKey = computeSessionKey(req.body?.messages);
  if (sessionKey) {
    const sys = req.body?.messages?.find(m => m.role === "system");
    const usr = req.body?.messages?.find(m => m.role === "user");
    const sysPreview = (typeof sys?.content === "string" ? sys.content : JSON.stringify(sys?.content || "")).slice(0, 120);
    const usrPreview = (typeof usr?.content === "string" ? usr.content : JSON.stringify(usr?.content || "")).slice(0, 80);
    if (isDebugVerbose()) console.log(`[SESSION-KEY] ${sessionKey.slice(0,8)} | sys="${sysPreview}" | usr="${usrPreview}"`);
  }

  // === MODE / PROFILE ===
  const sysMsg = req.body?.messages?.find(m => m.role === 'system');
  const sysText = (typeof sysMsg?.content === 'string') ? sysMsg.content : '';
  const modeResult = detectProfile(sysText);
  // === STRUGGLING DETECTION ===
  // Guarda gli ultimi 8 messaggi (user + assistant), esclude l'ultimo
  // <environment_details> che è sempre presente.
  const allMsgs = req.body?.messages || [];
  const lastMsgs = allMsgs.slice(-8);
  let isStruggling = false;
  let strugglingReason = '';
  for (const m of lastMsgs) {
    const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '');
    // Salta l'ultimo messaggio con environment_details
    if (/<environment_details>/i.test(c) && /Current Time/i.test(c)) continue;
    if (/edit unsuccessful|no sufficiently similar|repetition limit|unable to apply all diff|apply_diff.{0,50}(fail|error|unsuccessful)/i.test(c)) {
      isStruggling = true; strugglingReason = 'apply_diff fail'; break;
    }
    const isToolMessage = m.role === 'tool' || m.role === 'function' || m.tool_call_id || m.name === 'tool';
    if (isToolMessage) {
      if (/tool (execution )?failed|tool.{0,20}(error|abort)|"status"\s*:\s*"(error|failed)"|"is_error"\s*:\s*true/i.test(c)) {
        isStruggling = true; strugglingReason = 'tool failed'; break;
      }
    }
    if (/<error>[\s\S]{0,300}<\/(error|tool_result)>/i.test(c) && (isToolMessage || /tool_result|tool_call/i.test(c))) {
      isStruggling = true; strugglingReason = 'tool error'; break;
    }
    if (/"status"\s*:\s*"error"/i.test(c) && (isToolMessage || /tool_result/i.test(c))) {
      isStruggling = true; strugglingReason = 'status error'; break;
    }
  }
  if (isStruggling) {
    console.log(`[AFFINITY] Attempt ${attempt}: ⚠ Session struggling (${strugglingReason})`);
  }
    // === LOOP DETECTION: 3+ ask_followup_question consecutivi negli assistant ===
    let isAskLoop = false;
    let loopModelHint = '';
    {
      const assistants = allMsgs.filter(m => m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0);
      const last3 = assistants.slice(-3);
      if (last3.length === 3) {
        const allAsks = last3.every(m => m.tool_calls.every(tc => {
          const name = (tc.function?.name || tc.name || '').toLowerCase();
          return name === 'ask_followup_question';
        }));
        if (allAsks) {
          isAskLoop = true;
          loopModelHint = 'ask_followup_question×3';
          console.log(`[AFFINITY] Attempt ${attempt}: ⚠ Loop detected: 3 ask_followup_question consecutivi → changing model`);
        }
      }
    }
  if (isDebugVerbose()) {
    const lastMsg = allMsgs[allMsgs.length - 1];
    const lastContent = lastMsg?.content
      ? (typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content))
      : '<none>';
    const asstTcCount = allMsgs.filter(m => m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0).length;
    const toolResultCount = allMsgs.filter(m => {
      const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '');
      return /<tool_result>/i.test(c);
    }).length;
    console.log(`[MSGS] total=${allMsgs.length} asst_tc=${asstTcCount} tool_result_msgs=${toolResultCount} lastRole=${lastMsg?.role} lastContent="${lastContent.slice(0, 250).replace(/\n/g, ' ')}"`);
  }
  // === MSGS-ERR: dump diagnostico ===
  if (isDebugVerbose()) {
    const rolesSummary = {};
    for (const mm of allMsgs) rolesSummary[mm.role] = (rolesSummary[mm.role] || 0) + 1;
    console.log(`[MSGS] total=${allMsgs.length} roles=${JSON.stringify(rolesSummary)}`);

    // Ultimi 3 messaggi role:tool — mostro il loro contenuto
    const toolMsgs = allMsgs.filter(m => m.role === 'tool');
    const lastTools = toolMsgs.slice(-3);
    for (let i = 0; i < lastTools.length; i++) {
      const tm = lastTools[i];
      const c = typeof tm.content === 'string' ? tm.content : JSON.stringify(tm.content || '');
      const preview = c.slice(0, 300).replace(/\n/g, ' ');
      console.log(`[MSGS-TOOL#${i + 1}] name=${tm.name || '?'} content="${preview}"`);
    }
  }

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
  const cooledDownThisRequest = new Set();
  let controller = null;
  let model;  // <-- FIX: declare model before while loop (used at line 1272)
  // Timer streaming — dichiarati fuori da if(stream) così il catch esterno può accedervi
  const STREAM_IDLE_MS = parseInt(process.env.STREAM_IDLE_MS || "60000", 10);
  const isSummarizer = (profile === 'summarizer');
  const STREAM_MAX_MS = parseInt(process.env.STREAM_MAX_MS || (isSummarizer ? "60000" : "180000"), 10);
  let idleTimer = null;
  let hardCapTimer = null;
  let lastMeaningfulByte = Date.now();
  let timeoutHandle = null;
  let retryDelay = 0; // Exponential backoff delay in milliseconds

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
      try {
        bandit._forceProviderCooldown(prov, 5 * 60 * 1000, "cascade-fail");
        cooledDownThisRequest.add(prov);
      } catch (_) {}
    }
    // Update consecutive failures in database for circuit breaker
    try {
      bandit._updateConsecutiveProviderFailures(prov, n);
    } catch (e) {
      console.error(`[BANDIT] Errore aggiornamento consecutive failures per provider ${prov}: ${e.message}`);
    }
  }

  let clientDisconnected = false;
  res.once("close", () => {
    if (!res.writableEnded) {
      clientDisconnected = true;
      cleanup();
    }
  });

  let retriesExhausted = false;
  while (++attempt <= maxAttempts) {
    if (attempt >= maxAttempts) {
      retriesExhausted = true;
    }
    if (clientDisconnected) {
      console.log(`[BANDIT] Client disconnesso, stop retry (dopo ${attempt - 1} tentativi)`);
      cleanup();
      return;
    }

    // Trigger fallback if retries are exhausted for felo/* models
    if (retriesExhausted && model?.startsWith('felo/')) {
      const fallbackModels = bandit.getFallbackModels();
      if (fallbackModels.length > 0) {
        const fallbackModel = fallbackModels[0];
          if (fallbackTried.has(fallbackModel) || !bandit.isModelAvailable(fallbackModel)) {
            console.error(`[FALLBACK] ${fallbackModel} non disponibile o già tentato → 503`);
            cleanup();
            return res.status(503).json({ error: { message: "No models available", status: 503 } });
          }
          fallbackTried.add(fallbackModel);
        console.log(`[FALLBACK] Attempt ${attempt}: Fallback to ${fallbackModel} due to retries exhausted for ${model}`);
        model = fallbackModel;
        retriesExhausted = false; // Reset flag after fallback
      } else {
        console.error(`[FALLBACK] Attempt ${attempt}: No fallback models configured`);
        cleanup();
        return res.status(503).json({ error: { message: "No models available", status: 503 } });
      }
    }
    if (Date.now() - startedAt > MAX_TOTAL_MS) {
      console.warn(`[BANDIT] Limite tempo totale (${MAX_TOTAL_MS}ms) raggiunto dopo ${attempt} tentativi`);
      cleanup();
      return res.status(504).json({ error: { message: "Gateway timeout: nessun modello disponibile in tempo utile", status: 504 } });
    }

    if (attempt === 1 && forceModel) {
      if (!bandit.isModelAvailable(forceModel)) {
        cleanup();
        return res.status(404).json({
          error: { message: `Modello forzato ${forceModel} non disponibile in catalogo`, status: 404 }
        });
      }
      model = forceModel;
  } else {
  // === SESSION AFFINITY DISABLE CHECK ===
  // Disabilita session affinity finché monitored models count < catalog models count
  // Monitored models = sessionModels.size (entries tracked per session)
  // Catalog models = total models in catalog table
  // This ensures we only enable affinity when we have enough models monitored
  if (sessionModels.size < bandit.db.prepare("SELECT COUNT(*) as total FROM catalog").get().total) {
    sessionKey = null;
    console.log(`[AFFINITY DISABLE] Monitored models (${sessionModels.size}) < catalog models (${bandit.db.prepare("SELECT COUNT(*) as total FROM catalog").get().total}), bypassing session affinity`);
  }

  // === SESSION AFFINITY ===
  // Se la sessione è struggling, rimuovi il pin per riselezionare
  // Se la sessione è struggling, penalizza il modello pinnato E rimuovi il pin
  if ((isStruggling || isAskLoop) && sessionKey) {
    const entry = sessionModels.get(sessionKey);
    if (entry) {
      // Accumula fail nella blacklist di sessione (Nuanced approach: persistent or severe errors only)
      let bl = sessionBlacklist.get(sessionKey);
      if (!bl) { bl = new Map(); sessionBlacklist.set(sessionKey, bl); }
      let record = bl.get(entry.model);
      if (!record || typeof record === 'number') {
        const prevFails = typeof record === 'number' ? record : 0;
        record = { fails: prevFails, severe: false, lastReason: '' };
        bl.set(entry.model, record);
      }
      record.fails += 1;
      const reason = isAskLoop ? `loop ${loopModelHint}` : (strugglingReason || 'struggling');
      record.lastReason = reason;

      // Mark severe if status 400/404/422 or severe error
      if (isAskLoop || /status 400|status 404|status 422|context window|validation/i.test(reason)) {
        record.severe = true;
      }

      console.log(`[AFFINITY] Attempt ${attempt}: Unpin ${entry.model} (${reason}, fails=${record.fails}) → exclude and select another`);
      excluded.add(entry.model);       // Force UCB1 to choose another
      sessionModels.delete(sessionKey);

      // Ban only if persistent (fails >= 3) or severe (status 400, 422, loop, etc.)
      const isBanned = isAskLoop || record.severe || record.fails >= 3;
      if (isBanned) {
        console.log(`[AFFINITY] Attempt ${attempt}: 🚫 ${entry.model} BANNED in session ${sessionKey.slice(0,8)} (reason: ${reason}, fails: ${record.fails}, severe: ${record.severe})`);
      }
    }
  }
  let pinnedEntry = null;
  if (sessionKey) {
    const entry = sessionModels.get(sessionKey);
    if (entry && (Date.now() - entry.ts) < SESSION_TTL_MS) {
      pinnedEntry = entry;              // ← l'OGGETTO, non .model
    } else if (entry) {
      sessionModels.delete(sessionKey); // scaduto
    }
  }

  // Aggiungi al set di esclusione i modelli bannati in questa sessione (fails >= 3 or severe) PRIMA di validare il pin
  if (sessionKey) {
    const bl = sessionBlacklist.get(sessionKey);
    if (bl) {
      for (const [modelId, record] of bl) {
        const isBanned = typeof record === 'number' ? record >= 3 : (record.severe || record.fails >= 3);
        if (isBanned) excluded.add(modelId);
      }
    }
  }

  const pinnedMaxInput = pinnedEntry ? bandit.getModelMaxInput(pinnedEntry.model) : 0;
  const pinnedTokenCapacityValid = !pinnedEntry || pinnedMaxInput <= 0 || estimatedTokens <= pinnedMaxInput;

  const pinnedValid = pinnedEntry
    && !excluded.has(pinnedEntry.model)
    && bandit.isModelAvailable(pinnedEntry.model)
    && pinnedTokenCapacityValid;

  if (pinnedValid) {
    model = pinnedEntry.model;
    pinnedEntry.ts = Date.now();        // rinnova TTL (sliding)
    console.log(`[AFFINITY] ↻ ${model} (sessione ${sessionKey.slice(0, 8)})`);
  } else {
    if (pinnedEntry && !pinnedTokenCapacityValid) {
      console.log(`[AFFINITY] ✗ pin ${pinnedEntry.model} rimosso (token capacity insufficient: tokens=${estimatedTokens} > max=${pinnedMaxInput})`);
      sessionModels.delete(sessionKey);
      excluded.add(pinnedEntry.model);
    }
    model = await bandit.selectModel(excluded, estimatedTokens, requireTools, false, profile, cooledDownThisRequest);
    if (model && sessionKey) {
      sessionModels.set(sessionKey, { model, ts: Date.now() });
      if (sessionModels.size > 10000) {
        const firstKey = sessionModels.keys().next().value;
        sessionModels.delete(firstKey);
        sessionBlacklist.delete(firstKey);
      }
      console.log(`[AFFINITY] ⊕ pin ${model} (sessione ${sessionKey.slice(0, 8)})`);
    }
  }
}

// Record started_at AFTER model selection to exclude selection time from latency
if (model) {
  bandit.recordRequestStarted(model, bandit._getProvider(model));
}

trackRequestUpdate(requestId, {
  model,
  attempt,
  triedModels: Array.from(excluded),
  selectionHistory: bandit.getLastSelectionHistory()
});
    if (!model) {
      console.warn(`[BANDIT] Attempt ${attempt}: selectModel returned null - no models available or filtering exhausted all models (requireTools=${requireTools}, tokens=${estimatedTokens}, excluded=${excluded.size})`);
      notifier.notify("system.no_models", "Nessun modello disponibile: tutti in cooldown/ban o needs_attention", {
        estimatedTokens,
        attempt
      }).catch(() => {});

      // Check if fallback models are available
      const fallbackModels = bandit.getFallbackModels();
      if (fallbackModels.length > 0) {
        let selectedFallbackModel = null;

        // Pass 1: standard check (available with tokens, tools if required, not image gen, not tried)
        for (const fallbackModel of fallbackModels) {
          // Skip if already tried
          if (fallbackTried.has(fallbackModel)) {
            console.log(`[FALLBACK] Skipping fallback model ${fallbackModel}: already tried`);
            continue;
          }

          // Check if model is available (passing estimatedTokens for token capacity check)
          if (!bandit.isModelAvailable(fallbackModel, estimatedTokens)) {
            console.log(`[FALLBACK] Skipping fallback model ${fallbackModel}: not available in catalog/status or exceeds token limit`);
            continue;
          }

          // Check if model supports tools when required
          if (requireTools) {
            const modelInfo = bandit.db.prepare(
              `SELECT supports_tools FROM catalog WHERE id = ?`
            ).get(fallbackModel);

            if (!modelInfo || modelInfo.supports_tools !== 1) {
              console.log(`[FALLBACK] Skipping fallback model ${fallbackModel}: does not support tools (required)`);
              continue;
            }
          }

          // Check if model supports chat and is not an image/audio/embedding/non-chat model
          const modelInfoCap = bandit.db.prepare(
            `SELECT supports_chat, supports_image_generation, supports_audio_generation, capability FROM catalog WHERE id = ?`
          ).get(fallbackModel);
          const lowerFallbackId = fallbackModel.toLowerCase();
          const isNonChatFallback = (modelInfoCap && (modelInfoCap.supports_chat === 0 || modelInfoCap.capability !== 'chat_completion' || modelInfoCap.supports_image_generation === 1 || modelInfoCap.supports_audio_generation === 1)) ||
            lowerFallbackId.startsWith('aihorde/') || lowerFallbackId.includes('aihorde') ||
            /(^|[-_/])(dall-e|stable-diffusion|imagen|sdxl|flux|midjourney|image-generation|playground|aihorde|tts|speech|stt|whisper|voice|audio|embed|embedding|rerank|moderation)([-_/]|$)/i.test(lowerFallbackId) ||
            /image/i.test(lowerFallbackId);
          if (isNonChatFallback) {
            console.log(`[FALLBACK] Skipping fallback model ${fallbackModel}: non-chat / image / audio / embedding model`);
            continue;
          }

          // Model passes all checks
          selectedFallbackModel = fallbackModel;
          break;
        }

        // Pass 2: if requireTools=true and Pass 1 found nothing, relax tool requirement for fallback models
        if (!selectedFallbackModel && requireTools) {
          console.log(`[FALLBACK] Pass 2: Relaxing tool requirement for fallback models (requireTools=true)`);
          for (const fallbackModel of fallbackModels) {
            if (fallbackTried.has(fallbackModel)) continue;
            if (!bandit.isModelAvailable(fallbackModel, estimatedTokens)) continue;

            const modelInfoCap = bandit.db.prepare(
              `SELECT supports_chat, supports_image_generation, supports_audio_generation, capability FROM catalog WHERE id = ?`
            ).get(fallbackModel);
            const lowerFallbackId = fallbackModel.toLowerCase();
            const isNonChatFallback = (modelInfoCap && (modelInfoCap.supports_chat === 0 || modelInfoCap.capability !== 'chat_completion' || modelInfoCap.supports_image_generation === 1 || modelInfoCap.supports_audio_generation === 1)) ||
              lowerFallbackId.startsWith('aihorde/') || lowerFallbackId.includes('aihorde') ||
              /(^|[-_/])(dall-e|stable-diffusion|imagen|sdxl|flux|midjourney|image-generation|playground|aihorde|tts|speech|stt|whisper|voice|audio|embed|embedding|rerank|moderation)([-_/]|$)/i.test(lowerFallbackId) ||
              /image/i.test(lowerFallbackId);
            if (isNonChatFallback) continue;

            console.warn(`[FALLBACK] Emergency relaxation: bypassing tool requirement for fallback model ${fallbackModel}`);
            selectedFallbackModel = fallbackModel;
            break;
          }
        }

        // Pass 3: Final emergency fallback tier across all fallback models (ignoring token limits and tool requirements, but strictly excluding image/non-chat models)
        if (!selectedFallbackModel) {
          console.warn(`[FALLBACK] Pass 3: Final emergency fallback tier across all fallback models`);
          for (const fallbackModel of fallbackModels) {
            if (fallbackTried.has(fallbackModel)) continue;

            const modelInfoCap = bandit.db.prepare(
              `SELECT supports_chat, supports_image_generation, supports_audio_generation, capability FROM catalog WHERE id = ?`
            ).get(fallbackModel);
            const lowerFallbackId = fallbackModel.toLowerCase();
            const isNonChatFallback = (modelInfoCap && (modelInfoCap.supports_chat === 0 || modelInfoCap.capability !== 'chat_completion' || modelInfoCap.supports_image_generation === 1 || modelInfoCap.supports_audio_generation === 1)) ||
              lowerFallbackId.startsWith('aihorde/') || lowerFallbackId.includes('aihorde') ||
              /(^|[-_/])(dall-e|stable-diffusion|imagen|sdxl|flux|midjourney|image-generation|playground|aihorde|tts|speech|stt|whisper|voice|audio|embed|embedding|rerank|moderation)([-_/]|$)/i.test(lowerFallbackId) ||
              /image/i.test(lowerFallbackId);
            if (isNonChatFallback) {
              console.log(`[FALLBACK] Pass 3: Skipping non-chat/image fallback model ${fallbackModel}`);
              continue;
            }

            console.warn(`[FALLBACK] Final emergency fallback tier: picking fallback model ${fallbackModel}`);
            selectedFallbackModel = fallbackModel;
            break;
          }
        }

        // Pass 4: Absolute last resort fallback (reset fallbackTried and pick first non-chat fallback model)
        if (!selectedFallbackModel && fallbackModels.length > 0) {
          console.warn(`[FALLBACK] Pass 4: Resetting fallbackTried and picking suitable non-chat fallback model`);
          fallbackTried.clear();
          for (const fallbackModel of fallbackModels) {
            const modelInfoCap = bandit.db.prepare(
              `SELECT supports_chat, supports_image_generation, supports_audio_generation, capability FROM catalog WHERE id = ?`
            ).get(fallbackModel);
            const lowerFallbackId = fallbackModel.toLowerCase();
            const isNonChatFallback = (modelInfoCap && (modelInfoCap.supports_chat === 0 || modelInfoCap.capability !== 'chat_completion' || modelInfoCap.supports_image_generation === 1 || modelInfoCap.supports_audio_generation === 1)) ||
              lowerFallbackId.startsWith('aihorde/') || lowerFallbackId.includes('aihorde') ||
              /(^|[-_/])(dall-e|stable-diffusion|imagen|sdxl|flux|midjourney|image-generation|playground|aihorde|tts|speech|stt|whisper|voice|audio|embed|embedding|rerank|moderation)([-_/]|$)/i.test(lowerFallbackId) ||
              /image/i.test(lowerFallbackId);
            if (isNonChatFallback) {
              console.log(`[FALLBACK] Pass 4: Skipping non-chat/image fallback model ${fallbackModel}`);
              continue;
            }
            selectedFallbackModel = fallbackModel;
            break;
          }
        }

        if (selectedFallbackModel) {
          fallbackTried.add(selectedFallbackModel);
          console.log(`[FALLBACK] Attempt ${attempt}: Fallback to ${selectedFallbackModel} due to no available models (filtering exhausted all models)`);
          model = selectedFallbackModel;
        } else {
          console.error(`[FALLBACK] Attempt ${attempt}: All fallback options are exhausted / no suitable fallback models found (requireTools=${requireTools}, tried=${Array.from(fallbackTried).join(', ')})`);
          cleanup();
          return res.status(503).json({ error: { message: "No models available (filtering exhausted all models, fallback options exhausted)", status: 503 } });
        }
      } else {
        console.error(`[FALLBACK] Attempt ${attempt}: No fallback models configured (no models available, filtering exhausted all models)`);
        cleanup();
        return res.status(503).json({ error: { message: "No models available (no fallback models configured)", status: 503 } });
      }
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
      // Sanitize messages, strip unsupported reasoning fields, and strip tools if model doesn't support them
      const modelSupportsTools = bandit.db.prepare(`SELECT supports_tools FROM catalog WHERE id = ?`).get(model)?.supports_tools === 1;
      if (!modelSupportsTools && requestBody?.tools) {
        requestBody = { ...requestBody };
        delete requestBody.tools;
        delete requestBody.tool_choice;
        delete requestBody.parallel_tool_calls;
      }

      if (Array.isArray(requestBody?.messages)) {
        requestBody = {
          ...requestBody,
          messages: requestBody.messages.map(m => {
            if (!m || typeof m !== "object") return m;
            const copy = { ...m };
            if (copy.role === "assistant") {
              delete copy.reasoning_details;
              delete copy.reasoning_content;
              delete copy.reasoning;
            }
            if (copy.content === null || copy.content === undefined) {
              copy.content = "";
            }
            return copy;
          })
        };
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

      const endpointUrl = buildEndpointUrl(baseUrl, "/chat/completions");
      const r = await fetch(endpointUrl, {
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
        if (isDebugVerbose()) {
          console.error(`[DIAGNOSTIC] Upstream failure response: status=${r.status}, model=${model}, bodySnippet=${txt.substring(0, 200)}`);
        }
        console.error(`[UPSTREAM ${r.status}] ${model}: ${txt.substring(0, 200)}`);
        bandit.recordFeedback(model, false, 0, { message: txt, status: r.status }, { source: feedbackSource, estimatedTokens });

        if (sessionKey) {
          const entry = sessionModels.get(sessionKey);
          if (entry && entry.model === model) {
            sessionModels.delete(sessionKey);
            console.log(`[AFFINITY] ✗ pin ${model} rimosso (upstream error status ${r.status})`);
          }
        }

        // Parse Retry-After header for 429 errors
        let retryAfter = 0;
        if (r.status === 429) {
          const retryAfterHeader = r.headers.get('Retry-After');
          if (retryAfterHeader) {
            retryAfter = parseInt(retryAfterHeader, 10) * 1000; // Convert to milliseconds
            console.log(`[RETRY] Retry-After header: ${retryAfterHeader}s → ${retryAfter}ms`);
          }
        }

        // 413 / 429 / ITPM / TPM / Request too large / tokens per minute: il modello ha superato il limite di token o TPM.
        // Rimuovi il pin e mark severe in sessionBlacklist per evitare di riprovare lo stesso modello.
        if (r.status === 413 || r.status === 429 || /ITPM|tokens?\s*per\s*minute|TPM|input tokens per minute|Request too large|Requested \d+.*Limit \d+|Limit \d+.*Requested \d+/i.test(txt)) {
          if (sessionKey) {
            sessionModels.delete(sessionKey);
            let bl = sessionBlacklist.get(sessionKey);
            if (!bl) { bl = new Map(); sessionBlacklist.set(sessionKey, bl); }
            let record = bl.get(model);
            if (!record || typeof record === 'number') {
              record = { fails: (typeof record === 'number' ? record : 0) + 1, severe: true, lastReason: 'tpm-exceeded' };
            } else {
              record.severe = true;
              record.fails += 1;
              record.lastReason = 'tpm-exceeded';
            }
            bl.set(model, record);
            console.log(`[AFFINITY] 🚫 model ${model} bannato in sessione ${sessionKey.slice(0, 8)} (TPM/413 limit exceeded, status=${r.status})`);
          }
        }

        // 400 / Context window exceeded: il modello non può gestire il contesto.
        // Rimuovi il pin per evitare di riprovare lo stesso modello al prossimo turno.
        if (r.status === 400 && /context window|input tokens.*exceed|too large.*context/i.test(txt)) {
          if (sessionKey) {
            const entry = sessionModels.get(sessionKey);
            if (entry && entry.model === model) {
              sessionModels.delete(sessionKey);
              console.log(`[AFFINITY] ✗ pin ${model} rimosso (context window exceeded)`);
            }
          }
        }

        // Exponential backoff for 429 errors (only for felo/* models)
            if (r.status === 429 && model?.startsWith('felo/')) {
              const baseDelay = Math.max(retryAfter, retryDelay);
              const exponentialFactor = Math.pow(2, attempt - 1);
              retryDelay = Math.min(baseDelay * exponentialFactor, 60000); // Cap at 60 seconds
              console.log(`[RETRY] Attempt ${attempt}: 429 Error for ${model}. Retrying in ${retryDelay}ms (Retry-After: ${retryAfter}ms, exponential factor: ${exponentialFactor}x)`);
              await new Promise(resolve => setTimeout(resolve, retryDelay));
            }

        noteProviderFail(model);
        excluded.add(model);
        console.log(`[FAILURE] Attempt ${attempt}: ${model} failed with status ${r.status}. Error: ${txt.slice(0, 100)}`);
        trackRequestUpdate(requestId, { status: `error-${r.status}`, lastError: txt.slice(0, 100) });
        continue;
      }

      if (stream) {
        const reader = r.body.getReader();
        const dec = new TextDecoder();

        let firstChunkResult;
        try {
          firstChunkResult = await reader.read();
        } catch (e) {
          console.error(`[STREAM READ ERR] ${model}: ${e.message}`);
          bandit.recordFeedback(model, false, 0, { message: e.message }, { source: feedbackSource });
          noteProviderFail(model);
          excluded.add(model);
          try { reader.cancel().catch(() => {}); } catch (_) {}
          continue;
        }

        if (firstChunkResult.done) {
          console.error(`[STREAM EMPTY] ${model}: empty stream received`);
          bandit.recordFeedback(model, false, 0, { message: "empty stream" }, { source: feedbackSource });
          noteProviderFail(model);
          excluded.add(model);
          try { reader.cancel().catch(() => {}); } catch (_) {}
          continue;
        }

        const firstChunkText = dec.decode(firstChunkResult.value, { stream: true });
        if (firstChunkText.includes('"error"') || firstChunkText.includes('"code"') || firstChunkText.includes('rate_limit') || firstChunkText.includes('exceeded')) {
          console.error(`[STREAM ERR] ${model}: ${firstChunkText.substring(0, 200)}`);
          bandit.recordFeedback(model, false, 0, { message: firstChunkText }, { source: feedbackSource });
          noteProviderFail(model);
          excluded.add(model);
          try { reader.cancel().catch(() => {}); } catch (_) {}
          continue;
        }

        // Se gli header sono già stati inviati (stream già aperto), non possiamo ritentare
        if (res.headersSent) {
          console.error(`[RETRY BLOCKED] headers già inviati per ${model}, stream chiuso`);
          bandit.recordFeedback(model, false, 0, { message: "stream already started" }, { source: feedbackSource });
          cleanup();
          try { res.end(); } catch (_) {}
          return;
        }

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        let streamFailed = false;
        let streamStarted = true;
        let firstChunk = false;
        let accumulated = firstChunkText;
        res.write(firstChunkText);
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
                const details = (typeof streamInvalid === "object" && streamInvalid !== null)
                  ? streamInvalid
                  : { message: String(streamInvalid) };
                const displayMsg = details.message || details.reason || String(streamInvalid);
                console.error(`[STREAM INVALID] ${model}: ${displayMsg}`);
                bandit.recordFeedback(model, false, 0, details, { source: feedbackSource });
                // Header già inviati: NON possiamo cambiare modello.
                // Chiudiamo lo stream con un errore e usciamo.
                try {
                  res.write(`data: ${JSON.stringify({ error: { message: "Stream invalid: " + displayMsg } })}\n\n`);
                  res.write(`data: [DONE]\n\n`);
                } catch (_) {}
                cleanup();
                try { res.end(); } catch (_) {}
                return;
              }

            const baseReward = Math.max(0, 1.0 - (dur / 30));
            // Estrai i nomi dei tool chiamati dallo stream accumulato
            const streamToolNames = [...accumulated.matchAll(/"name"\s*:\s*"([^"]+)"/g)].map(m => m[1]);
            const hasWritten = sessionHasWritten(req.body?.messages);
            const mult = computeToolRewardMultiplier(streamToolNames, hasWritten);
            const rewardScore = baseReward * mult;
            bandit.recordFeedback(model, true, rewardScore, null, { source: feedbackSource });
            logSuccess(model, dur, { stream: true, toolNames: streamToolNames, hasWritten, rewardScore, baseReward });
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
          if (sessionKey) {
            const entry = sessionModels.get(sessionKey);
            if (entry && entry.model === model) {
              sessionModels.delete(sessionKey);
              console.log(`[AFFINITY] ✗ pin ${model} rimosso (stream abort/error)`);
            }
          }
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
          if (isDebugVerbose()) {
            console.log(`[RESPONSE] ${model} | tool_calls: ${tc?.length || 0} | content: ${(content || "").substring(0, 100)} ${tc && tc.length > 0 ? `tool chiamati: ${tc.map(t => t.function?.name).join(", ")}` : ''}`);
          }
        }
        if (invalidReason) {
          console.error(`[APP ERR] ${model}: ${invalidReason}`);
          if (sessionKey) {
            const entry = sessionModels.get(sessionKey);
            if (entry && entry.model === model) {
              sessionModels.delete(sessionKey);
              console.log(`[AFFINITY] ✗ pin ${model} rimosso (response invalidation)`);
            }
          }
          bandit.recordFeedback(model, false, 0, { message: invalidReason }, { source: feedbackSource });
          noteProviderFail(model);
          excluded.add(model);
          continue;
        }

        const baseReward = Math.max(0, 1.0 - (dur / 30));
        const respToolNames = (data.choices?.[0]?.message?.tool_calls || []).map(tc => tc.function?.name).filter(Boolean);
        const hasWritten = sessionHasWritten(req.body?.messages);
        const mult = computeToolRewardMultiplier(respToolNames, hasWritten);
        const rewardScore = baseReward * mult;
        bandit.recordFeedback(model, true, rewardScore, null, { source: feedbackSource });
        logSuccess(model, dur, { stream: false, toolNames: respToolNames, hasWritten, rewardScore, baseReward });
        trackRequestUpdate(requestId, { status: "success", lastDurationSec: dur });
        cleanup();
        return res.json(data);
      }
    } catch (e) {
      if (timeoutHandle) { clearTimeout(timeoutHandle); timeoutHandle = null; }

      if (sessionKey) {
        const entry = sessionModels.get(sessionKey);
        if (entry && entry.model === model) {
          sessionModels.delete(sessionKey);
          console.log(`[AFFINITY] ✗ pin ${model} rimosso (fetch error / timeout)`);
        }
      }

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

// Serve static files from public directory (manifest, icons, etc.)
app.use(express.static(path.join(__dirname, "../public")));

// SPA fallback for non-API routes (e.g. dashboard tab refresh)
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/v1/")) {
    return next();
  }
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.sendFile(path.join(__dirname, "../public/dashboard.html"));
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

async function startServer(attempt = 1) {
  const MAX_ATTEMPTS = 5;
  try {
    console.log("[INIT] Sincronizzazione modelli in corso...");
    await bandit.fetchAndSyncModels();
    console.log("[INIT] Modelli sincronizzati con successo");
  } catch (err) {
    if (attempt >= MAX_ATTEMPTS) {
      console.error(`[FATAL] Troppi tentativi falliti di sincronizzazione (${MAX_ATTEMPTS}), arresto`);
      bandit.close();
      process.exit(1);
    }
    console.error("[INIT] Errore sincronizzazione:", err.message);
    console.log(`[INIT] Ritento tra 5 secondi... (tentativo ${attempt + 1}/${MAX_ATTEMPTS})`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    return startServer(attempt + 1);
  }

  initRegistry();
  const server = app.listen(PORT, "127.0.0.1", () => {
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
          sessionBlacklist.delete(k); // pulisci anche la blacklist
          removed++;
        }
      }
      if (removed > 0) console.log(`[AFFINITY] Cleanup: rimosse ${removed} sessioni scadute`);
    }, 5 * 60 * 1000).unref();
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  startServer().catch(err => {
    console.error("[FATAL] Impossibile avviare server:", err);
    bandit.close();
    process.exit(1);
  });
}

export { sessionModels, sessionBlacklist, SESSION_TTL_MS, computeSessionKey, compressBody, truncateBiggestMessage };
