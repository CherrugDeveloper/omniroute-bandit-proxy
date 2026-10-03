# OmniRoute Bandit Proxy

Reverse proxy in Node.js che distribuisce dinamicamente il traffico chat verso i modelli di un gateway **OmniRoute** (o qualsiasi gateway OpenAI-compatibile), usando un algoritmo **Multi-Armed Bandit** (Discounted UCB1).

Impara dalle risposte: premia i modelli veloci e affidabili, mette in cooldown quelli che falliscono, disabilita quelli rotti, e cerca sempre il miglior modello disponibile nel momento.

## Caratteristiche

- **Discounted UCB1**: bilancia esplorazione e sfruttamento, con reward basato sulla latenza
- **Session Affinity**: pinna un modello per conversazione — Zoo Code non perde stato (artifact_id, apply_diff context)
- **Mode/Profile system**: riconosce 14 modalità Zoo Code e usa il profilo corretto per guidare la selezione
- **Soft bias profilo↔modello**: `code` preferisce code model, `reasoning` preferisce thinking, `summarizer` preferisce modelli veloci
- **Catalog separato**: i ~1900 modelli OmniRoute sono in una tabella `catalog`, filtrati per capability chat
- **Lazy registration**: un modello entra in `models` solo la prima volta che viene usato
- **Classificatore errori**: distingue ban permanente, cooldown provider, cooldown modello, misconfigurazione
- **Circuit breaker**: 3 fail stesso provider → cooldown, evita cascate di errori
- **Training isolation**: il training daemon scrive in `models_train` (separata), non inquina il bandit di produzione
- **Needs attention**: i provider con problemi di configurazione (auth, CLI, Playwright) sono marcati e gestibili manualmente
- **Dashboard web** con contatori live, log in streaming, tab Modalità, flat mode sorting, toggle debug
- **Auth token** sulle API di controllo
- **Persistenza SQLite** di tutto lo stato (modelli, provider, contatori, training)
- **Streaming SSE** end-to-end con idle timeout content-based + hard cap
- **Retry loop** con limite dinamico e timeout totale
- **Graceful shutdown** su SIGTERM/SIGINT
- **Resiliente ai bug**: `unhandledRejection` non termina più il processo (conta e resiste a 20 errori/60s)

## Configurazione

Copia il template e compila i valori:

    cp .env.example .env

### Variabili d'ambiente

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `OMNIROUTE_API_KEY` | - | **Obbligatoria.** Chiave API del gateway OmniRoute |
| `OMNIROUTE_BASE_URL` | `https://router.omniroute.ai/v1` | Base URL del gateway |
| `PORT` | `8080` | Porta HTTP del proxy |
| `UPSTREAM_TIMEOUT_MS` | `20000` | Timeout di connessione (primi byte) |
| `STREAM_IDLE_MS` | `60000` | Idle timeout **content-based** durante streaming (ignora ping SSE) |
| `STREAM_MAX_MS` | `180000` | Hard cap assoluto streaming (3 min) |
| `MAX_TOTAL_MS` | `600000` | Timeout totale per l'intero retry loop (10 min) |
| `DATABASE_PATH` | `bandit.db` | Percorso del file SQLite |
| `DASHBOARD_TOKEN` | (vuoto) | Se valorizzato, protegge le API di controllo |
| `EXPLOIT_ONLY` | `false` | Se `true`, solo modelli con N ≥ 3 (modalità prod) |
| `EXCLUDE_THINKING` | `false` | Se `true`, esclude modelli thinking/reasoning |
| `ONLY_FREE` | `false` | Se `true`, solo modelli gratuiti |
| `EXCLUDE_PAID` | `false` | Se `true`, esclude modelli `is_paid=1` |
| `EXCLUDE_PROVIDERS` | (vuoto) | Lista provider da escludere (es. `gemini,felo`) |
| `HEALTH_CHECK_ENABLED` | `true` | Attiva health check attivo ogni 10 min |

**Mai committare `.env`**: e' gia in `.gitignore`.

## Avvio

    npm start

## API

### Proxy (pubblico)

#### POST /v1/chat/completions

Stessa interfaccia di OpenAI. Il campo `model` **viene ignorato** e sostituito dal modello scelto dal bandit.

    curl -X POST http://127.0.0.1:8080/v1/chat/completions \
      -H "Content-Type: application/json" \
      -d '{"model":"any","messages":[{"role":"user","content":"ciao"}],"stream":false}'

Supporta sia `stream: true` (SSE) sia `stream: false` (JSON).

**Header opzionali**:
- `x-force-model: <nome>` — bypassa UCB1 al primo tentativo (per training/debug)
- `x-source: training` — scrive feedback in `models_train` invece di `models`
- `x-auto-compress: true` — abilita compressione contesto se `estimatedTokens > maxCatalog`

### Control API (protette da `DASHBOARD_TOKEN`)

Se `DASHBOARD_TOKEN` e' vuoto, queste API sono **esposte senza auth** - sconsigliato in produzione.

| Endpoint | Metodo | Descrizione |
|----------|--------|-------------|
| `/v1/metrics` | GET | Statistiche complete (richieste, modelli, provider, catalog) |
| `/v1/logs` | GET | Ultimi 200 log (ring buffer) |
| `/v1/active` | GET | Richieste in corso (in-flight) |
| `/v1/inflight` | GET | Contatore in-flight (per training daemon, senza auth) |
| `/v1/sessions` | GET | Lista sessioni affinity attive |
| `/v1/sessions/:key` | DELETE | Forza unpin di una sessione |
| `/v1/modes` | GET | Statistiche mode + discovery in attesa |
| `/v1/modes/signatures` | GET | Signature mode attive |
| `/v1/modes/label` | POST | Etichetta un discovered (`{sig, name, profile}`) |
| `/v1/modes/discovered/:sig` | DELETE | Scarta un discovered |
| `/v1/debug/status` | GET | Stato debug verbose |
| `/v1/debug/toggle` | POST | Attiva/disattiva debug (`{verbose: bool}`) |
| `/v1/reset/model/:id` | POST | Reset di un modello (fails, cooldown, last_used_index) |
| `/v1/reset/provider/:name` | POST | Reset di un provider e dei suoi modelli |
| `/v1/provider/retry/:name` | POST | Sblocca un provider marcato `needs_attention` o `permanent` |
| `/v1/provider/ignore/:name` | POST | Disabilita permanentemente un provider |

Tutte (tranne `/v1/inflight`) richiedono l'header:

    x-api-token: <DASHBOARD_TOKEN>

## Session Affinity

Il bandit **pinna** un modello per ogni conversazione, evitando che Zoo Code perda lo stato (artifact_id, apply_diff context) quando il bandit cambia modello a metà task.

**Come funziona**:
1. Ad ogni richiesta, il proxy calcola `sessionKey = md5(system_prompt + primo_user_message)`
2. Se esiste già un pin valido (TTL 30 min) e il modello è disponibile → **riuso**
3. Altrimenti → `selectModel` sceglie, e il risultato viene pinnato
4. Cleanup automatico ogni 5 min per le sessioni scadute

**Log**: `[AFFINITY] ⊕ pin <modello>` al primo uso, `[AFFINITY] ↻ <modello>` ai successivi.

**Invalidazione pin**: se il modello pinnato fallisce (5xx, timeout), il pin viene rimosso e il prossimo turno riseleziona.

## Mode/Profile system

Il proxy riconosce le **14 modalità di Zoo Code** (code, architect, debug, orchestrator, jest-test-engineer, summarizer, ecc.) analizzando il system prompt, e usa il profilo corretto per guidare la selezione del modello.

**Registry**: `config/modes.json` — pattern regex + profilo per ogni modalità.

**Auto-discovery**:
- Prompt mai visti → salvati in `config/modes.discovered.json`
- Dalla dashboard → tab **Modalità** → **Etichetta** per aggiungerli al registry

**Profili e soft bias** (moltiplicatore sullo score UCB1):

| Profilo | Boost | Penalità |
|---------|-------|----------|
| `code` | +35% code model | −35% thinking, −25% small |
| `reasoning` | +30% thinking, +10% code | −40% small |
| `general` | — | −35% code, −45% thinking, −15% small |
| `summarizer` | +150% flash/small | −90% thinking, −50% code |

**Escalation automatica**: task con >100 messaggi passano da `code` a `reasoning` per evitare loop.

## Comportamento del bandit

### Reward

    reward = max(0, 1.0 - durata_sec / 30)

Una risposta in 1s → 0.97, in 10s → 0.67, in 30s+ → 0.

### Aggiornamento UCB1 (con discount)

    N          = N * 0.99 + 1        (successo)
    sum_reward = sum_reward * 0.99 + reward

Il discount factor 0.99 pesa di più le osservazioni recenti.

### Classificazione errori

| Errore | Azione | Scope |
|--------|--------|-------|
| 404 model not found / not supported | Ban permanente | Modello |
| Assignment to constant variable (bug upstream) | Ban permanente | Modello |
| 429 rate limit | Cooldown (durata da reset_seconds) | Modello |
| Timeout / abort | Cooldown 10 min | Modello |
| 5xx generico su modello | Cooldown 10 min | Modello |
| **10× 5xx consecutivi** | **Cooldown 1h + degraded** | **Modello** (non più ban permanente) |
| 429 quota exhausted (account) | Cooldown (durata dal messaggio) | Provider |
| 402 insufficient funds | Cooldown 6h | Provider |
| Anti-abuse / 418 / captcha | Cooldown 6h | Provider |
| Auth mancante, Playwright, transport, CLI obsoleto | Needs attention | Provider |
| 403 account banned/suspended | Ban permanente | Provider |
| input-too-long / stream_early_eof | skip-feedback (nessuna penalità) | — |

### Circuit breaker

| Trigger | Azione |
|---------|--------|
| 3 fail stesso provider **in una richiesta prod** | Cooldown provider 5 min |
| 3 timeout stesso provider **nel ciclo di training** | Skip provider per il resto del ciclo |
| 5 errori 5xx stesso provider **nel ciclo di training** | Skip provider per il resto del ciclo |

### Retry loop

Per ogni richiesta il proxy tenta piu modelli (fino a `providerCount * 4 + 100`, max 500) finche non trova un successo o esaurisce il tempo (`MAX_TOTAL_MS`). Ogni modello che fallisce viene aggiunto a un `excluded` set locale per la richiesta corrente.

### Timeout streaming

Tre livelli di timeout, per gestire provider lenti o piantati:

| Variabile | Default | Cosa fa |
|-----------|---------|---------|
| `UPSTREAM_TIMEOUT_MS` | 20000 | Timeout connessione (primi byte) |
| `STREAM_IDLE_MS` | 60000 | Idle timeout **content-based** — abort se nessun chunk con contenuto per N sec (ignora ping SSE) |
| `STREAM_MAX_MS` | 180000 | Hard cap assoluto — abort dopo N sec anche se lo stream è attivo |

**Perché 3 livelli**: un modello reasoning su contesto 160k può streammare attivamente per minuti; l'idle non scatta, ma il hard cap sì.

## Training isolation

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

## Health check attivo

Ogni 10 minuti, il proxy testa in batch i modelli "malati":
- `permanent = 1` (bannati)
- `cooldown_until > now + 1h` (cooldown lunghi)
- **`degraded = 1`** (score ridotto, altrimenti mai riselezionati)

Se rispondono, vengono riabilitati automaticamente. Silenzioso: log solo su riavvii e errori.

## Dashboard

Apri:

    http://127.0.0.1:8080/dashboard?token=<DASHBOARD_TOKEN>

Il token viene salvato in `localStorage` per il riuso nelle tab successive.

### Cosa mostra

- **Richieste** e **Osservazioni** (successi) totali
- **Modelli** e **Provider**: attivi / in cool / bannati / degraded / totali / in catalogo
- Tab **Live Logs**: streaming aggiornato ogni secondo
- Tab **Modelli**: N, avg reward, score UCB1, fails, cooldown, azioni
- Tab **Modalità**: signature attive + discovery in attesa con pulsanti Etichetta/Scarta
- **Flat mode sorting**: click su un header → tabella unica ordinata globalmente (bottone Raggruppa per tornare)
- **Toggle 🐛 Debug verbose** in alto a destra

### Debug verbose (toggle)

Attiva/disattiva log dettagliati **senza restart**:

- `[SESSION-KEY]` — preview del system prompt e user message
- `[CONTEXT]` — dettagli autoCompress
- `[MSGS]` — conteggio tool_results, asst_tc, ultimo tool result
- `[RESPONSE-STREAM]` — dettagli stream (tool_calls found, names)

**Default**: spento al restart (per non loggare dati utente).

### Badge di stato

| Badge | Significato |
|-------|-------------|
| Attivo | Nel pool, selezionabile |
| Cooldown | Temporaneamente escluso, timer attivo |
| Degraded | Score ridotto per errori transitori recenti |
| Da configurare | Problema di configurazione (auth, CLI, Playwright) |
| Ignorato | Disabilitato permanentemente (ban o azione manuale) |

## Esecuzione come servizio systemd

Crea `/etc/systemd/system/omniroute-bandit-proxy.service`:

    [Unit]
    Description=OmniRoute Bandit Proxy Service
    After=network.target

    [Service]
    Type=simple
    User=marco
    WorkingDirectory=/home/marco/omniroute-bandit-proxy
    EnvironmentFile=/home/marco/omniroute-bandit-proxy/.env
    ExecStart=/usr/bin/node /home/marco/omniroute-bandit-proxy/src/index.mjs
    Restart=always
    RestartSec=5
    StandardOutput=journal
    StandardError=journal

    [Install]
    WantedBy=multi-user.target

Poi:

    sudo systemctl daemon-reload
    sudo systemctl enable omniroute-bandit-proxy
    sudo systemctl start omniroute-bandit-proxy

## Script di utilità

| Script | Cosa fa |
|--------|---------|
| `scripts/restart.sh` | Restart servizio + feedback su stdout |
| `scripts/switch-mode.sh prod` | Modalità prod (EXPLOIT_ONLY=true, <2s) |
| `scripts/switch-mode.sh train-gentle` | Avvia daemon training in parallelo |
| `scripts/switch-mode.sh stop` | Ferma daemon training |
| `scripts/switch-mode.sh status` | Stato + metriche rapide |
| `scripts/train-ctl.sh start/stop/status/logs` | Controllo diretto training daemon |

## Struttura del progetto

    src/
      index.mjs            Server Express, proxy handler, endpoint
      bandit.mjs           Classe DiscountedUCB1Bandit (logica + SQLite)
      modes-registry.mjs   Registry modalità + soft bias + discovery
      health-check.mjs     Probe periodici su modelli degradati/bannati
      notifier.mjs         Webhook Slack/Discord/Telegram
    public/
      dashboard.html       Dashboard single-file
    config/
      modes.json           Registry 14 modalità (pattern + profile)
    scripts/
      train-daemon.mjs     Training round-robin
      train-ctl.sh         Start/stop/logs daemon
      switch-mode.sh       Cambio modalità prod/train
      restart.sh           Restart servizio

## Schema SQLite

Sei tabelle, tutte create/migrate automaticamente all'avvio:

| Tabella | Ruolo |
|---------|-------|
| `catalog` | Pool completo dei modelli disponibili (ricostruito ad ogni avvio) |
| `models` | Modelli provati almeno una volta (N, sum_reward, fails, cooldown, permanent, degraded) |
| `models_train` | Statistiche training (isolate da `models` — non inquinano UCB1 prod) |
| `provider_history` | Stato per provider (fails, cooldown, permanent, needs_attention, pointer) |
| `meta` | Contatori globali (totalRequests, totalObservations) |

## Sviluppo

    # Avvio con auto-reload su modifiche
    npm run dev

    # Check sintassi di tutti i file JS
    npm run check

## Note operative

- Il **catalogo viene ricostruito ad ogni avvio**: se aggiungi/rimuovi modelli in OmniRoute, basta riavviare il proxy.
- I dati di apprendimento (in `models`) **non vengono toccati** dal resync del catalogo.
- Il DB `bandit.db` e' persistente. Per ricominciare da zero: cancella `bandit.db` e riavvia.
- Il proxy usa `127.0.0.1` come bind: mettilo dietro un reverse proxy (nginx/caddy) se vuoi esporlo in rete.
- Le signature delle modalità (`config/modes.signatures.json`) sono **machine-specific** e non vanno committate.
- Il training daemon può girare **in parallelo** al proxy senza toccare la produzione.

## Licenza

MIT - vedi LICENSE.

## Autore

**Marco** - [@CherrugDeveloper](https://github.com/CherrugDeveloper)