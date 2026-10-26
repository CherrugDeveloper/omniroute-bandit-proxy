# OmniRoute Bandit Proxy

> Workspace audit and documentation update performed on 2026-10-26. Verified system/service files, production scripts, config files, dashboard UI, and recent cleanup audit findings. No superfluous files found, plans directory already removed, .gitignore validation issue with bandit_state.db documented.

> **v1.1.83 (2026-10-26)**: Bug fixes & logic improvements — fixed `totalObservations` counter timing, enhanced `resetGlobalCounters()` to clear logs and reset learning state, refined model filtering for chat-capable models (e.g., gpt-4o), added token limit validation.


## Panoramica

OmniRoute Bandit Proxy è un sistema middleware che funge da proxy tra l'estensione Zoo Code di VS Code e il proxy omniroute. Fornisce funzionalità di gestione dei modelli per Zoo Code, con un algoritmo di selezione dei modelli basato su bandit e un sistema di scoring.

## Caratteristiche Principali

### 1. Algoritmo Bandit
- **UCB1 con discount**: Selezione dei modelli con esplorazione-esploitation bilanciata
- **Aggiornamento con discount**: Dà più peso alle osservazioni recenti
- **Sistema di reward**: `reward = max(0, 1.0 - durata_sec / 30)`
- **Classificazione errori**: 404, timeout, 5xx, rate limit, ban permanente, ecc.

### 2. Gestione dei Modelli
- **Catalogo**: Pool completo dei modelli disponibili (ricostruito ad ogni avvio, include flag `supports_tools` e `supports_image_generation`)
- **Modelli**: Modelli provati almeno una volta (N, sum_reward, fails, cooldown, permanent, degraded)
- **Modelli training**: Statistiche training (isolate da modelli - non inquinano UCB1 prod)
- **Provider history**: Stato per provider (fails, cooldown, permanent, needs_attention, pointer)

### 3. Session Affinity & Image Generation
- **Pin session**: Calcola `sessionKey = md5(system_prompt + primo_user_message)`
- **TTL 30 min**: Pin valido per 30 minuti
- **Invalidazione pin**: Se il modello pinnato fallisce (5xx, timeout), il pin viene rimosso
- **Image Generation Support**: Rilevamento automatico delle richieste di generazione immagini e routing dedicato tramite [`POST /v1/images/generations`](src/index.mjs:1) o conversione trasparente su chat completions.
- **Rilevamento rigoroso (3 regole)** in [`isImageGenerationRequest()`](src/index.mjs:50) per evitare i falsi positivi `400 Image generation requests are not supported`:
  1. **R1 - model id immagine**: `dall-e`, `stable-diffusion`, `midjourney`, `flux`, `imagen`, `sdxl`, `sd-xl`, `playground`, `aihorde` → sempre richiesta immagine.
  2. **R2 - shape del payload**: `prompt` senza `messages` → richiesta immagine **solo** se presenti `n`/`size`/`response_format` oppure se manca del tutto `model`. Un modello chat (es. `gpt-4o`) con campo `prompt` resta una normale chat completion.
  3. **R3 - intento esplicito**: frasi esplicite (`generate image`, `text to image`, ...) oppure il regex [`STRICT_IMAGE_INTENT_RE`](src/index.mjs:47) che richiede il sostantivo immagine **immediatamente dopo** il verbo (articolo opzionale + fino a 2 aggettivi).

### 4. Sistema di Modalità
- **14 modalità Zoo Code**: Riconosce le modalità di Zoo Code analizzando il system prompt
- **Profili soft bias**: Moltiplicatore sullo score UCB1 per ogni profilo
- **Auto-discovery**: Prompt mai visti → salvati in `config/modes.discovered.json`

### 5. Dashboard
- **Live Logs**: Streaming aggiornato ogni secondo
- **Metriche**: Richieste, osservazioni, modelli, provider, errori
- **Modalità**: Signature attive + discovery in attesa
- **Specchietto Valutazione Modelli**: Integrazione nel pannello superiore di [`public/dashboard.html`](public/dashboard.html:823) per la visualizzazione in tempo reale delle valutazioni, considerazioni e motivi di scarto dei modelli

### 6. Comportamento del Bandit

#### Reward

    reward = max(0, 1.0 - durata_sec / 30)

Una risposta in 1s → 0.97, in 10s → 0.67, in 30s+ → 0.

#### Aggiornamento UCB1 (con discount)

    N          = N * 0.99 + 1        (successo)
    sum_reward = sum_reward * 0.99 + reward

Il discount factor 0.99 pesa di più le osservazioni recenti.

#### Classificazione errori

| Errore | Azione | Scope |
|--------|--------|-------|
| 404 model not found / not supported | Ban permanente | Modello |
| Assignment to constant variable (bug upstream) | Ban permanente | Modello |
| 429 rate limit | Cooldown (durata da reset_seconds) | Modello |
| Timeout / abort | Cooldown 10 min | Modello |
| 5xx generico su modello | Cooldown 10 min | Modello |
| **10× 5xx consecutivi** | **Cooldown 1h + degraded** | **Modello** (non più ban permanente) |
| 429 quota exhausted (account) | Cooldown (durata dal messaggio) | Provider |
| 402 insufficient funds / billing error | Ban permanente (quota-exhausted) | Provider |
| Anti-abuse / 418 / captcha | Cooldown 6h | Provider |
| Auth mancante, Playwright, transport, CLI obsoleto, spawn ENOENT (provider [`zc`](src/bandit.mjs:750), [`cfp`](src/bandit.mjs:931)) | Ban-provider (provider-misconfigured) | Provider |
| **Cloudflare Playground (cfp) 502 "browser session failed"** | **Cooldown 5 min** | **Provider** (transient, non ban permanente) |
| 403 account banned/suspended | Ban permanente | Provider |
| **400 "not supported" (image block format mismatch)** | **Ban-model (model-incompatible)** | **Modello** (capability mismatch, non unavailability) |
| input-too-long / stream_early_eof | skip-feedback (nessuna penalità) | — |

#### Circuit breaker

| Trigger | Azione |
|---------|--------|
| 3 fail stesso provider **in una richiesta prod** | Cooldown provider 5 min |
| 3 timeout stesso provider **nel ciclo di training** | Skip provider per il resto del ciclo |
| 5 errori 5xx stesso provider **nel ciclo di training** | Skip provider per il resto del ciclo |

#### Retry loop

Per ogni richiesta il proxy tenta piu modelli (fino a `providerCount * 4 + 100`, max 500) finche non trova un successo o esaurisce il tempo (`MAX_TOTAL_MS`). Ogni modello che fallisce viene aggiunto a un `excluded` set locale per la richiesta corrente.

#### Timeout streaming

Tre livelli di timeout, per gestire provider lenti o piantati:

| Variabile | Default | Cosa fa |
|-----------|---------|---------|
| `UPSTREAM_TIMEOUT_MS` | 20000 | Timeout connessione (primi byte) |
| `STREAM_IDLE_MS` | 60000 | Idle timeout **content-based** — abort se nessun chunk con contenuto per N sec (ignora ping SSE) |
| `STREAM_MAX_MS` | 180000 | Hard cap assoluto — abort dopo N sec anche se lo stream è attivo |

**Perché 3 livelli**: un modello reasoning su contesto 160k può streammare attivamente per minuti; l'idle non scatta, ma il hard cap sì.

### 7. Training isolation

Il training daemon **non inquina** il bandit di produzione:

- I feedback di training scrivono in `models_train` (tabella separata)
- `selectModel` legge da `models` (prod) se N ≥ 1, altrimenti usa `models_train` × 0.3 come prior
- Zero impatto sul comportamento di Zoo Code

**Priorità Zoo**: il daemon fa `/v1/inflight` prima di ogni test; se Zoo ha richieste in-flight, aspetta (max 60s, poi procede con 1 test).

**Avvio training** (senza toccare modalità prod):

    cd scripts
    EXCLUDE_PROVIDERS=gemini,felo TIMEOUT_MS=15000 DELAY_MS=5000 \
      CYCLE_DELAY=60000 SKIP_TESTED=false ZOO_MAX_WAIT_MS=60000 \
      ./train-ctl.sh start

### 8. Health check attivo

Ogni 10 minuti, il proxy testa in batch i modelli "malati":
- `permanent = 1` (bannati)
- `cooldown_until > now + 1h` (cooldown lunghi)
- **`degraded = 1`** (score ridotto, altrimenti mai riselezionati)

Se rispondono, vengono riabilitati automaticamente. Silenzioso: log solo su riavvii e errori.

### 9. Dashboard

Apri:

    http://127.0.0.1:8080/dashboard?token=<DASHBOARD_TOKEN>

Il token viene salvato in `localStorage` per il riuso nelle tab successive.

#### Cosa mostra

- **Richieste** e **Osservazioni** (successi) totali
- **Modelli** e **Provider**: attivi / in cool / bannati / degraded / totali / in catalogo
- Tab **Live Logs**: streaming aggiornato ogni secondo
- Tab **Modelli**: N, avg reward, score UCB1, fails, cooldown, azioni
- Tab **Modalità**: signature attive + discovery in attesa con pulsanti Etichetta/Scarta
- **Flat mode sorting**: click su un header → tabella unica ordinata globalmente (bottone Raggruppa per tornare)
- **Toggle 🐛 Debug verbose** in alto a destra

#### Debug verbose (toggle)

Attiva/disattiva log dettagliati **senza restart**:

- `[SESSION-KEY]` — preview del system prompt e user message
- `[CONTEXT]` — dettagli autoCompress
- `[MSGS]` — conteggio tool_results, asst_tc, ultimo tool result
- `[RESPONSE-STREAM]` — dettagli stream (tool_calls found, names)

**Default**: spento al restart (per non loggare dati utente).

#### Badge di stato

| Badge | Significato |
|-------|-------------|
| Attivo | Nel pool, selezionabile |
| Cooldown | Temporaneamente escluso, timer attivo |
| Degraded | Score ridotto per errori transitori recenti |
| Da configurare | Problema di configurazione (auth, CLI, Playwright) |
| Ignorato | Disabilitato permanentemente (ban o azione manuale) |

### 10. Esecuzione come servizio systemd

File di servizio attuale: [`omniroute-bandit-proxy.service`](omniroute-bandit-proxy.service) verifica:
- `WorkingDirectory=/home/marco/Files/Workspace_vscode/omniroute-bandit-proxy`
- `ExecStart=/usr/bin/node .../src/index.mjs`
- `EnvironmentFile=-.../.env`
- `Restart=on-failure`, `RestartSec=10`

Crea `/etc/systemd/system/omniroute-bandit-proxy.service`:

    [Unit]
    Description=OmniRoute Bandit Proxy - Multi-Armed Bandit reverse proxy router for dynamic LLM traffic distribution
    After=network.target

    [Service]
    Type=simple
    WorkingDirectory=/home/marco/Files/Workspace_vscode/omniroute-bandit-proxy
    ExecStart=/usr/bin/node /home/marco/Files/Workspace_vscode/omniroute-bandit-proxy/src/index.mjs
    Restart=on-failure
    RestartSec=10
    EnvironmentFile=-/home/marco/Files/Workspace_vscode/omniroute-bandit-proxy/.env
    StandardOutput=journal
    StandardError=journal

    [Install]
    WantedBy=default.target

Poi:

    sudo systemctl daemon-reload
    sudo systemctl enable omniroute-bandit-proxy
    sudo systemctl start omniroute-bandit-proxy

### 11. Script di utilità

Produzione e manutenzione scripts in [`scripts/`](scripts/):
- [`scripts/switch-mode.sh`](scripts/switch-mode.sh) - Cambia modalità prod/train-gentle/train/stop/status
- [`scripts/train-ctl.sh`](scripts/train-ctl.sh) - Controllo training daemon
- [`scripts/train-daemon.mjs`](scripts/train-daemon.mjs) - Training round-robin warm-up
- [`scripts/restart.sh`](scripts/restart.sh) - Restart servizio + feedback
- [`scripts/restart-safe.sh`](scripts/restart-safe.sh) - Restart sicuro
- [`scripts/free-port-emergency.sh`](scripts/free-port-emergency.sh) - Emergency port release
- [`scripts/check-db.mjs`](scripts/check-db.mjs) - Diagnostica database
- [`scripts/inspect-db.mjs`](scripts/inspect-db.mjs) - Ispezione completa DB
- [`scripts/inspect-bans.mjs`](scripts/inspect-bans.mjs) - Ispezione ban/cooldown
- [`scripts/fix-db.mjs`](scripts/fix-db.mjs) - Fix database
- [`scripts/fix-vision.mjs`](scripts/fix-vision.mjs) - Fix vision

| Script | Cosa fa |
|--------|---------|
| `scripts/restart.sh` | Restart servizio + feedback su stdout |
| `scripts/switch-mode.sh prod` | Modalità prod (EXPLOIT_ONLY=true, <2s) |
| `scripts/switch-mode.sh train-gentle` | Avvia daemon training in parallelo |
| `scripts/switch-mode.sh stop` | Ferma daemon training |
| `scripts/switch-mode.sh status` | Stato + metriche rapide |
| `scripts/train-ctl.sh start/stop/status/logs` | Controllo diretto training daemon |
| `scripts/check-db.mjs` | Diagnostica database (provider history, meta, catalog) |
| `scripts/inspect-db.mjs` | Ispezione completa database (models, catalog, meta, tools, free) |

### 12. Controllo del rumore di log e polling efficiente

Il proxy include [`src/log-throttle.mjs`](src/log-throttle.mjs:1) per ridurre il rumore di console e migliorare l'efficienza del polling:

- **Throttling per endpoint**: `DASHBOARD_STATS_LOG_INTERVAL_MS` (default 60s) e `MODELS_LOG_THROTTLE_MS` (default 60s) limitano la frequenza dei log di `/v1/dashboard/stats` e `GET /v1/models`.
- **CORS/debug silenzioso**: `CORS_DEBUG=false` disabilita il log della riga CORS/debug per ogni richiesta in ingresso.
- **Verbose debug con TTL**: `DEBUG_VERBOSE=false` e `DEBUG_VERBOSE_TTL_MS=900000` (15 min) attivano log dettagliati che scadono automaticamente.
- **Ring buffer denylist**: `LOG_BUFFER_DENYLIST` (pipe-separated tag names) esclude tag come `CORS/DEBUG|DEBUG AUTH|DEBUG server|PROXY` dal ring buffer `/v1/logs`, mantenendoli solo sul terminale.

Configura queste variabili in `.env` (vedi `.env.example` per i valori di default).

### 14. Struttura del progetto

    src/
      index.mjs            Server Express, proxy handler, endpoint
      bandit.mjs           Classe DiscountedUCB1Bandit (logica + SQLite)
      modes-registry.mjs   Registry modalità + soft bias + discovery
      health-check.mjs     Probe periodici su modelli degradati/bannati
      notifier.mjs         Webhook Slack/Discord/Telegram
      log-throttle.mjs     Throttling log, denylist ring buffer, verbose TTL
      provider-quota.mjs   Quota tracking rolling window per provider
      request-tracker.mjs  Track active requests
    public/
      dashboard.html       Dashboard single-file UI
      manifest.json        PWA manifest
      sw.js                Service worker
      icons/               App icons
    config/
      bandit.json          Fallback models chain (6 models)
      modes.json           Registry 14 modalità (pattern + profile)
      provider-limits.json Rate limits per provider (RPM/RPD/ITPM)
    scripts/
      train-daemon.mjs     Training round-robin warm-up
      train-ctl.sh         Start/stop/logs daemon
      switch-mode.sh       Cambio modalità prod/train
      restart.sh           Restart servizio
      check-db.mjs         Diagnostica database
      inspect-db.mjs       Ispezione completa database

### 13. Schema SQLite

Sei tabelle, tutte create/migrate automaticamente all'avvio:

| Tabella | Ruolo |
|---------|-------|
| `catalog` | Pool completo dei modelli disponibili (ricostruito ad ogni avvio) |
| `models` | Modelli provati almeno una volta (N, sum_reward, fails, cooldown, permanent, degraded) |
| `models_train` | Statistiche training (isolate da `models` — non inquinano UCB1 prod) |
| `provider_history` | Stato per provider (fails, cooldown, permanent, needs_attention, pointer) |
| `meta` | Contatori globali (totalRequests, totalObservations) |
| `request_logs` | Ring buffer log richieste (timestamp, model, provider, status, latency_ms, tokens_in, tokens_out, error_type) |

### 14. Sviluppo e Build

Comandi da [`package.json`](package.json):
- `npm start` - Avvia il proxy server su 127.0.0.1:8080
- `npm run dev` - Avvia con auto-reload (`--watch`)
- `npm run check` - Valida sintassi TypeScript e JavaScript (`node --check`)
- `npm test` - Esegue tutti i test via `node --test tests/*.test.mjs __tests__/*.test.mjs`

Environment variables critiche (vedi [` .env.example`]( .env.example)):
- `OMNIROUTE_API_KEY`, `OMNIROUTE_BASE_URL`, `DASHBOARD_TOKEN`
- `EXCLUDE_PAID`, `ONLY_FREE`, `EXCLUDE_THINKING`, `EXPLOIT_ONLY`
- `HEALTH_CHECK_INTERVAL_MS`, `SESSION_TTL_MS` (default 1800000 = 30min)
- `UPSTREAM_TIMEOUT_MS` (20000), `STREAM_IDLE_MS` (60000), `STREAM_MAX_MS` (180000)

    # Avvio con auto-reload su modifiche
    npm run dev

    # Check sintassi di tutti i file JS
    npm run check

### 15. Note operative

- Il **catalogo viene ricostruito ad ogni avvio**: se aggiungi/rimuovi modelli in OmniRoute, basta riavviare il proxy.
- I dati di apprendimento (in `models`) **non vengono toccati** dal resync del catalogo.
- Il DB `bandit.db` e' persistente. Per ricominciare da zero: cancella `bandit.db` e riavvia.
- Il proxy usa `127.0.0.1` come bind: mettilo dietro un reverse proxy (nginx/caddy) se vuoi esporlo in rete.
- Le signature delle modalità (`config/modes.signatures.json`) sono **machine-specific** e non vanno committate.
- Il training daemon può girare **in parallelo** al proxy senza toccare la produzione.

### 16. Deployment & Configurazione

File di deployment verificati:
- [`omniroute-bandit-proxy.service`](omniroute-bandit-proxy.service) - Systemd service (Restart=on-failure, EnvironmentFile=-.env)
- [`nginx.conf`](nginx.conf) - Reverse proxy config per dashboard e API
- [`netlify.toml`](netlify.toml) - Netlify redirects per /v1/* API e SPA fallback
- [`firebase.json`](firebase.json) - Firebase Hosting rewrites per dashboard
- [`vercel.json`](vercel.json) - Vercel rewrites

Dashboard UI: [`public/dashboard.html`](public/dashboard.html) single-file con 6 tab, live logs, metriche, modelli, modalità, ecc. Icone in [`public/icons/`](public/icons/).

Cleanup audit 2026-10-26:
- No superfluous files found
- Plans directory already removed
- .gitignore validation issue: bandit_state.db tracked despite *.db ignore pattern

### 17. Licenza

MIT - vedi [`LICENSE`](LICENSE).

### 18. Autore

**Marco** - [@CherrugDeveloper](https://github.com/CherrugDeveloper)