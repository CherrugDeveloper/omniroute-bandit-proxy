import express from "express";
import { DiscountedUCB1Bandit } from "./bandit.js";

const app = express();

// Inizializzazione del Bandit UCB1 con persitenza SQLite WAL
const bandit = new DiscountedUCB1Bandit();

// Registriamo i modelli di default
const defaultModels = [
  "gpt-4o", "gpt-4o-mini", "claude-3-5-sonnet", "claude-3-opus", "gemini-1.5-pro", "gemini-1.5-flash"
];
bandit.registerModels(defaultModels);

// Middleware CORS e body parser
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
  res.header("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Logger universale
app.use((req, res, next) => {
  console.log(`[PROXY INCOMING] ${req.method} ${req.url}`);
  next();
});

// Endpoint /v1/models con metadata rigorosi per Zod / Zoo Code
app.get(["/v1/models", "/models"], (req, res) => {
  const models = defaultModels.map(id => ({
    id: id,
    object: "model",
    created: Math.floor(Date.now() / 1000),
    owned_by: "bandit",
    context_window: 128000,
    max_tokens: 8192
  }));

  res.setHeader("Content-Type", "application/json");
  return res.status(200).json({ object: "list", data: models });
});

// Endpoint POST chat/completions guidato dal Bandit
app.post(["/v1/chat/completions", "/chat/completions"], (req, res) => {
  const { messages, stream } = req.body || {};
  const lastMessage = Array.isArray(messages) && messages.length > 0 
    ? messages[messages.length - 1].content 
    : "";

  // Selezione intelligente del modello tramite Bandit UCB1
  const selectedModel = bandit.selectModel() || "gpt-4o";
  console.log(`[BANDIT ROUTING] Modello selezionato: ${selectedModel} | Prompt length: ${lastMessage.length}`);

  const responseText = `[OmniRoute Bandit] Elaborato tramite ${selectedModel}. Risposta generata con successo.`;

  // Simulazione feedback positivo immediato per il bandit
  bandit.recordFeedback(selectedModel, true, 0.25, 45.0);

  if (stream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    
    const chunk = {
      id: "chatcmpl-" + Date.now(),
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: selectedModel,
      choices: [{ index: 0, delta: { content: responseText }, finish_reason: null }]
    };
    res.write("data: " + JSON.stringify(chunk) + "\n\n");
    
    const endChunk = {
      id: "chatcmpl-" + Date.now(),
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: selectedModel,
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
    };
    res.write("data: " + JSON.stringify(endChunk) + "\n\n");
    res.write("data: [DONE]\n\n");
    return res.end();
  }

  return res.json({
    id: "chatcmpl-" + Date.now(),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: selectedModel,
    choices: [{
      index: 0,
      message: { role: "assistant", content: responseText },
      finish_reason: "stop"
    }],
    usage: { prompt_tokens: lastMessage.length, completion_tokens: 15, total_tokens: lastMessage.length + 15 }
  });
});

// Gestione errori globale
app.use((err, req, res, next) => {
  console.error("[ERROR]", err);
  res.status(500).json({ error: err.message || "Internal Server Error" });
});

app.listen(8080, "0.0.0.0", () => {
  console.log("[PROXY] OmniRoute Bandit Proxy attivo su http://0.0.0.0:8080");
});
