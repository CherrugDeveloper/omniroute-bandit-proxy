import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from 'url';
import { DiscountedUCB1Bandit } from "./bandit.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "50mb" }));

// Serviamo i file statici della PWA (manifest, sw, icone)
app.use(express.static(path.join(__dirname, '../public')));

const PORT = process.env.PORT || 8080;
const bandit = new DiscountedUCB1Bandit();

const logBuffer = [];
const MAX_LOGS = 100;

function pushLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  const line = `[${timestamp}] ${message}`;
  logBuffer.push(line);
  if (logBuffer.length > MAX_LOGS) {
    logBuffer.shift();
  }
}

const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => {
  const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
  originalLog(...args);
  pushLog(msg);
};

console.error = (...args) => {
  const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
  originalError(...args);
  pushLog(`ERROR: ${msg}`);
};

app.use((req, res, next) => {
  if (!req.url.startsWith("/v1/metrics") && !req.url.startsWith("/v1/logs")) {
    console.log(`[PROXY INCOMING] ${req.method} ${req.url}`);
  }
  next();
});

app.get("/dashboard", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OmniRoute Bandit Dashboard</title>
    <link rel="manifest" href="/manifest.json">
    <meta name="theme-color" content="#161b22">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0d1117; color: #c9d1d9; margin: 0; padding: 20px; }
        h1 { color: #58a6ff; border-bottom: 1px solid #30363d; padding-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
        h3 { margin-top: 0; color: #8b949e; }
        .card { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 20px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #30363d; }
        th { background: #21262d; color: #8b949e; }
        tr:hover { background: #1f6feb1a; }
        .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .badge-active { background: #238636; color: white; }
        .badge-cooldown { background: #9e6a03; color: white; }
        .badge-banned { background: #da3633; color: white; }
        pre#logs-container { background: #010409; border: 1px solid #30363d; border-radius: 6px; padding: 15px; height: 250px; overflow-y: auto; font-family: monospace; font-size: 12px; color: #7ee787; margin: 0; }
        #install-btn { background: #238636; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; display: none; }
        #install-btn:hover { background: #2ea043; }
    </style>
</head>
<body>
    <h1>
        <span>OmniRoute Bandit Dashboard</span>
        <button id="install-btn">Installa PWA</button>
    </h1>
    
    <div class="card">
        <h3>Stato Generale</h3>
        <p><strong>Totale Richieste Processate:</strong> <span id="total-req">...</span></p>
        <p><strong>Ultimo aggiornamento:</strong> <span id="last-update">...</span></p>
    </div>

    <div class="card">
        <h3>Stato Provider & Rotazione</h3>
        <table>
            <thead>
                <tr>
                    <th>Provider</th>
                    <th>Fallimenti Consecutivi</th>
                    <th>Stato / Cooldown Provider</th>
                </tr>
            </thead>
            <tbody id="providers-table">
                <tr><td colspan="3">Caricamento provider in corso...</td></tr>
            </tbody>
        </table>
    </div>

    <div class="card">
        <h3>Modelli Monitorati (Ordinati per UCB1 Score)</h3>
        <table>
            <thead>
                <tr>
                    <th>Modello</th>
                    <th>Provider</th>
                    <th>Selezioni (N)</th>
                    <th>Media Reward (Avg)</th>
                    <th>Score UCB1</th>
                    <th>Fallimenti</th>
                    <th>Stato Modello</th>
                </tr>
            </thead>
            <tbody id="models-table">
                <tr><td colspan="7">Caricamento dati in corso...</td></tr>
            </tbody>
        </table>
    </div>

    <div class="card">
        <h3>Live Proxy Logs</h3>
        <pre id="logs-container">Caricamento log in corso...</pre>
    </div>

    <script>
        // Registrazione Service Worker per PWA
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js')
                    .then(reg => console.log('Service Worker registrato con successo:', reg.scope))
                    .catch(err => console.error('Registrazione Service Worker fallita:', err));
            });
        }

        let deferredPrompt;
        const installBtn = document.getElementById('install-btn');

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            installBtn.style.display = 'block';
        });

        installBtn.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                console.log('Utente ha accettato l\\'installazione PWA');
            }
            deferredPrompt = null;
            installBtn.style.display = 'none';
        });

        function formatRemainingTime(seconds) {
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = Math.floor(seconds % 60);
            let parts = [];
            if (h > 0) parts.push(\`\${h}h\`);
            if (m > 0 || h > 0) parts.push(\`\${m}m\`);
            parts.push(\`\${s}s\`);
            return parts.join(' ');
        }

        async function fetchMetrics() {
            try {
                const res = await fetch("/v1/metrics");
                const data = await res.json();
                document.getElementById("total-req").innerText = data.totalRequests;
                document.getElementById("last-update").innerText = new Date().toLocaleTimeString();
                
                const nowSec = Date.now() / 1000;

                const provTable = document.getElementById("providers-table");
                provTable.innerHTML = "";
                if (data.providers && data.providers.length > 0) {
                    data.providers.forEach(p => {
                        let statusBadge = '<span class="badge badge-active">Attivo</span>';
                        if (p.permanent) {
                            statusBadge = '<span class="badge badge-banned">Bandito Definitivamente</span>';
                        } else if (p.cooldownUntil && p.cooldownUntil > nowSec) {
                            const remaining = p.cooldownUntil - nowSec;
                            statusBadge = \`<span class="badge badge-cooldown">Cooldown (\${formatRemainingTime(remaining)})</span>\`;
                        }

                        const tr = document.createElement("tr");
                        tr.innerHTML = \`
                            <td><strong>\${p.provider}</strong></td>
                            <td>\${p.fails}</td>
                            <td>\${statusBadge}</td>
                        \`;
                        provTable.appendChild(tr);
                    });
                } else {
                    provTable.innerHTML = '<tr><td colspan="3">Nessun provider registrato</td></tr>';
                }

                const tbody = document.getElementById("models-table");
                tbody.innerHTML = "";
                
                data.models.forEach(m => {
                    let statusBadge = '<span class="badge badge-active">Attivo</span>';
                    if (m.permanent) {
                        statusBadge = '<span class="badge badge-banned">Bandito</span>';
                    } else if (m.cooldownUntil && m.cooldownUntil > nowSec) {
                        const remaining = m.cooldownUntil - nowSec;
                        statusBadge = \`<span class="badge badge-cooldown">Cooldown (\${formatRemainingTime(remaining)})</span>\`;
                    }
                    
                    const tr = document.createElement("tr");
                    tr.innerHTML = \`
                        <td><strong>\${m.id}</strong></td>
                        <td>\${m.provider}</td>
                        <td>\${m.N.toFixed(1)}</td>
                        <td>\${m.avg.toFixed(3)}</td>
                        <td>\${m.score === Infinity ? "Infinity (Nuovo)" : m.score.toFixed(3)}</td>
                        <td>\${m.fails}</td>
                        <td>\${statusBadge}</td>
                    \`;
                    tbody.appendChild(tr);
                });
            } catch (err) {
                console.error("Errore caricamento metriche:", err);
            }
        }

        async function fetchLogs() {
            try {
                const res = await fetch("/v1/logs");
                const logs = await res.json();
                const container = document.getElementById("logs-container");
                const isAtBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 10;
                
                container.innerText = logs.join("\\n");
                
                if (isAtBottom) {
                    container.scrollTop = container.scrollHeight;
                }
            } catch (err) {
                console.error("Errore caricamento log:", err);
            }
        }
        
        fetchMetrics();
        fetchLogs();
        setInterval(fetchMetrics, 3000);
        setInterval(fetchLogs, 2000);
    </script>
</body>
</html>`);
});

app.get("/v1/metrics", (req, res) => {
  try {
    res.json(bandit.getMetrics());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/v1/logs", (req, res) => {
  res.json(logBuffer);
});

app.post(["/v1/chat/completions", "/chat/completions"], async (req, res) => {
  const { messages, stream } = req.body || {};
  const omnirouteBaseUrl = process.env.OMNIROUTE_BASE_URL || "http://localhost:20128/v1";
  const omnirouteApiKey = process.env.OMNIROUTE_API_KEY;

  const excludedModelsForRequest = new Set();
  const maxAttempts = 15;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;
    const selectedModel = bandit.selectModel(excludedModelsForRequest);
    
    if (!selectedModel) {
      console.error("[BANDIT] Nessun modello disponibile nel pool (tutti esclusi o in cooldown per questa richiesta).");
      return res.status(503).json({
        error: { message: "No available models left in pool due to failures/cooldowns", status: 503 }
      });
    }

    console.log(`[BANDIT] Selezionato modello: ${selectedModel} | Tentativo richiesta n. ${attempt}`);
    const startTime = Date.now();

    try {
      const upstreamPayload = {
        ...req.body,
        model: selectedModel,
        stream: Boolean(stream)
      };

      const headers = { "Content-Type": "application/json" };
      if (omnirouteApiKey) headers["Authorization"] = `Bearer ${omnirouteApiKey}`;

      const upstreamResponse = await fetch(`${omnirouteBaseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(upstreamPayload)
      });

      const durationSec = (Date.now() - startTime) / 1000;

      if (!upstreamResponse.ok) {
        const errText = await upstreamResponse.text();
        console.error(`[OMNIROUTE ERROR] HTTP ${upstreamResponse.status} su ${selectedModel}: ${errText}`);
        
        bandit.recordFeedback(selectedModel, false);
        excludedModelsForRequest.add(selectedModel);
        continue;
      }

      if (stream) {
        const reader = upstreamResponse.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedText = "";
        let hasError = false;

        const { value, done } = await reader.read();
        if (!done && value) {
          const firstChunkText = decoder.decode(value, { stream: true });
          accumulatedText += firstChunkText;
          if (
            accumulatedText.includes('"error"') || 
            accumulatedText.includes('"code":400') || 
            accumulatedText.includes('"status":400') ||
            accumulatedText.includes('Bad Request')
          ) {
            hasError = true;
          }
        }

        if (hasError) {
          console.error(`[UPSTREAM STREAM ERROR DETECTED] ${selectedModel} ha restituito un errore nello stream.`);
          bandit.recordFeedback(selectedModel, false);
          excludedModelsForRequest.add(selectedModel);
          continue;
        }

        bandit.recordFeedback(selectedModel, true, durationSec, 30.0);
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        
        if (value) res.write(value);

        try {
          while (true) {
            const { done: chunkDone, value: chunkVal } = await reader.read();
            if (chunkDone) break;
            res.write(chunkVal);
          }
        } catch (streamErr) {
          console.error("[STREAM ERROR]", streamErr);
        } finally {
          res.end();
        }
        return;
      }

      const data = await upstreamResponse.json();
      const isErrorPayload = 
        data.error || 
        data.code === 400 || 
        data.status === 400 || 
        (data.choices && data.choices.length === 0) ||
        (data.error && data.error.code);

      if (isErrorPayload) {
        console.error(`[UPSTREAM APP ERROR / 400] ${selectedName_Or_Model = selectedModel} ha risposto con errore logico:`, JSON.stringify(data));
        bandit.recordFeedback(selectedModel, false);
        excludedModelsForRequest.add(selectedModel);
        continue;
      }

      bandit.recordFeedback(selectedModel, true, durationSec, 30.0);
      return res.json(data);

    } catch (err) {
      console.error("[PROXY FETCH EXCEPTION]", err);
      bandit.recordFeedback(selectedModel, false);
      excludedModelsForRequest.add(selectedModel);
    }
  }

  return res.status(502).json({
    error: {
      message: `All model attempts exhausted for this request after ${attempt} tries.`,
    }
  });
});

bandit.fetchAndSyncModels().then(() => {
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`[PROXY] OmniRoute Bandit Proxy attivo su http://127.0.0.1:${PORT}`);
    console.log(`[DASHBOARD] Pannello disponibile su http://127.0.0.1:${PORT}/dashboard`);
  });
});
