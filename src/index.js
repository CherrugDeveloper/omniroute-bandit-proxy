import "dotenv/config";
import express from "express";
import { DiscountedUCB1Bandit } from "./bandit.js";

const app = express();
app.use(express.json({ limit: "50mb" }));

const PORT = process.env.PORT || 8080;
const bandit = new DiscountedUCB1Bandit();

app.use((req, res, next) => {
  if (!req.url.startsWith("/v1/metrics")) {
    console.log(`[PROXY INCOMING] ${req.method} ${req.url}`);
  }
  next();
});

app.get("/dashboard", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <title>OmniRoute Bandit Dashboard</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0d1117; color: #c9d1d9; margin: 0; padding: 20px; }
        h1 { color: #58a6ff; border-bottom: 1px solid #30363d; padding-bottom: 10px; }
        .card { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 20px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #30363d; }
        th { background: #21262d; color: #8b949e; }
        tr:hover { background: #1f6feb1a; }
        .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .badge-active { background: #238636; color: white; }
        .badge-cooldown { background: #9e6a03; color: white; }
        .badge-banned { background: #da3633; color: white; }
    </style>
</head>
<body>
    <h1>OmniRoute Bandit Dashboard</h1>
    <div class="card">
        <h3>Stato Generale</h3>
        <p><strong>Totale Richieste Processate:</strong> <span id="total-req">...</span></p>
        <p><strong>Ultimo aggiornamento:</strong> <span id="last-update">...</span></p>
    </div>
    <div class="card">
        <h3>Modelli Monitorati (Ordinati per UCB1 Score)</h3>
        <table>
            <thead>
                <tr>
                    <th>Modello</th>
                    <th>Selezioni (N)</th>
                    <th>Media Reward (Avg)</th>
                    <th>Score UCB1</th>
                    <th>Fallimenti</th>
                    <th>Stato</th>
                </tr>
            </thead>
            <tbody id="models-table">
                <tr><td colspan="6">Caricamento dati in corso...</td></tr>
            </tbody>
        </table>
    </div>

    <script>
        async function fetchMetrics() {
            try {
                const res = await fetch("/v1/metrics");
                const data = await res.json();
                document.getElementById("total-req").innerText = data.totalRequests;
                document.getElementById("last-update").innerText = new Date().toLocaleTimeString();
                
                const tbody = document.getElementById("models-table");
                tbody.innerHTML = "";
                
                data.models.forEach(m => {
                    let statusBadge = '<span class="badge badge-active">Attivo</span>';
                    if (m.permanent) {
                        statusBadge = '<span class="badge badge-banned">Bandito</span>';
                    } else if (m.cooldownUntil && m.cooldownUntil > Date.now() / 1000) {
                        statusBadge = '<span class="badge badge-cooldown">Cooldown</span>';
                    }
                    
                    const tr = document.createElement("tr");
                    tr.innerHTML = \`
                        <td><strong>\${m.id}</strong></td>
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
        
        fetchMetrics();
        setInterval(fetchMetrics, 3000);
    </script>
</body>
</html>
  `);
});

app.get("/v1/metrics", (req, res) => {
  try {
    res.json(bandit.getMetrics());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(["/v1/chat/completions", "/chat/completions"], async (req, res) => {
  const { messages, stream } = req.body || {};
  
  const selectedModel = bandit.selectModel() || "gpt-4o";
  console.log(`[BANDIT] Selezionato modello: ${selectedModel} | Richiesta n. ${bandit.totalRequests}`);

  const omnirouteBaseUrl = process.env.OMNIROUTE_BASE_URL || "http://localhost:20128/v1";
  const omnirouteApiKey = process.env.OMNIROUTE_API_KEY;

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

      return res.status(upstreamResponse.status).json({
        error: {
          message: `OmniRoute upstream error: ${errText}`,
          status: upstreamResponse.status,
          model: selectedModel
        }
      });
    }

    if (stream) {
      bandit.recordFeedback(selectedModel, true, durationSec, 30.0);
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      
      const reader = upstreamResponse.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      } catch (streamErr) {
        console.error("[STREAM ERROR]", streamErr);
      } finally {
        res.end();
      }
      return;
    }

    const data = await upstreamResponse.json();

    // Se l api restituisce un errore applicativo nel JSON (es. fallimento del provider a monte)
    if (data.error || (data.choices && data.choices.length === 0)) {
      console.error(`[UPSTREAM APP ERROR] ${selectedModel} ha risposto con errore logico:`, JSON.stringify(data));
      bandit.recordFeedback(selectedModel, false);
      return res.status(400).json(data);
    }

    bandit.recordFeedback(selectedModel, true, durationSec, 30.0);
    return res.json(data);

  } catch (err) {
    console.error("[PROXY FETCH EXCEPTION]", err);
    bandit.recordFeedback(selectedModel, false);
    return res.status(502).json({
      error: {
        message: `Proxy gateway connection failed: ${err.message}`,
        model: selectedModel
      }
    });
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`[PROXY] OmniRoute Bandit Proxy attivo su http://0.0.0.0:${PORT}`);
  console.log(`[DASHBOARD] Pannello disponibile su http://localhost:${PORT}/dashboard`);
});
