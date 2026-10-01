# OmniRoute Bandit Proxy

Reverse proxy in Node.js che distribuisce dinamicamente il traffico chat verso i modelli di un gateway **OmniRoute** (o qualsiasi gateway OpenAI-compatibile), usando un algoritmo **Multi-Armed Bandit** (Discounted UCB1).

Impara dalle risposte: premia i modelli veloci e affidabili, mette in cooldown quelli che falliscono, disabilita quelli rotti, e cerca sempre il miglior modello disponibile nel momento.

## Caratteristiche

- **Discounted UCB1**: bilancia esplorazione e sfruttamento, con reward basato sulla latenza
- **Catalog separato**: i ~1700 modelli OmniRoute sono in una tabella `catalog`, filtrati per capability chat
- **Lazy registration**: un modello entra in `models` solo la prima volta che viene usato
- **Classificatore errori**: distingue ban permanente, cooldown provider, cooldown modello, misconfigurazione
- **Needs attention**: i provider con problemi di configurazione (auth, CLI, Playwright) sono marcati e gestibili manualmente dalla dashboard
- **Dashboard web** con contatori live, log in streaming, azioni di reset/retry/ignore
- **Auth token** sulle API di controllo
- **Persistenza SQLite** di tutto lo stato (modelli, provider, contatori globali)
- **Streaming SSE** end-to-end con rilevamento errori nel primo chunk
- **Retry loop** con limite dinamico e timeout totale
- **Graceful shutdown** su SIGTERM/SIGINT

## Come funziona (in breve)

    Client -> Bandit Proxy -> [scelta modello UCB1] -> OmniRoute -> provider reale -> risposta
                                  |
                                  v
                            recordFeedback (successo/fallimento)
                                  |
                                  v
                            aggiorna N, sum_reward, fails, cooldown

Ogni volta che arriva una richiesta:

1. Il proxy chiama `selectModel()` che scorre i provider disponibili (non in cooldown, non bannati, non `needs_attention`)
2. Per ogni modello calcola lo score UCB1:

       score = avg_reward + sqrt(2 * ln(total_observations) / N)

   dove `avg_reward` e' la media pesata dei reward precedenti e il secondo termine e' il bonus di esplorazione
3. Sceglie il modello con score massimo (i modelli mai provati hanno `N=0` -> score `infinito`)
4. Inoltra la richiesta a OmniRoute
5. Registra il risultato: successo -> aumenta `N` e `sum_reward`; fallimento -> classifica l'errore e applica cooldown/ban
6. Se il modello fallisce, lo esclude e ritenta con il prossimo (fino a `maxAttempts`)

Il **discount factor 0.99** fa si che le osservazioni vecchie contino progressivamente meno: il bandit si adatta se un modello peggiora nel tempo.

## Requisiti

- **Node.js >= 22** (richiesto per `node --watch` e API stabili)
- Un gateway **OmniRoute** (o compatibile OpenAI) raggiungibile
- SQLite (incluso via `better-sqlite3`, nessuna installazione separata)

## Installazione

    git clone https://github.com/CherrugDeveloper/omniroute-bandit-proxy.git
    cd omniroute-bandit-proxy
    npm install

## Configurazione

Copia il template e compila i valori:

    cp .env.example .env

### Variabili d'ambiente

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `OMNIROUTE_API_KEY` | - | **Obbligatoria.** Chiave API del gateway OmniRoute |
| `OMNIROUTE_BASE_URL` | `https://router.omniroute.ai/v1` | Base URL del gateway |
| `PORT` | `8080` | Porta HTTP del proxy |
| `UPSTREAM_TIMEOUT_MS` | `60000` | Timeout per singola richiesta upstream |
| `MAX_TOTAL_MS` | `600000` | Timeout totale per l'intero retry loop (10 min) |
| `DATABASE_PATH` | `bandit.db` | Percorso del file SQLite |
| `DASHBOARD_TOKEN` | (vuoto) | Se valorizzato, protegge `/v1/metrics`, `/v1/logs`, `/v1/reset/*`, `/v1/provider/*` |

**Mai committare `.env`**: e' gia in `.gitignore`.

## Avvio

### Sviluppo (con auto-reload)

    npm run dev

### Produzione (manuale)

    npm start

All'avvio:

1. Viene sincronizzato il catalogo dei modelli da OmniRoute
2. Viene creato/migrato il DB SQLite
3. Il server si mette in ascolto su `127.0.0.1:${PORT}`

Log attesi:

    [BANDIT] Catalog sincronizzato: NNNN modelli chat (esclusi MMM non-chat)
    [INIT] Modelli sincronizzati con successo
    [PROXY] Server avviato su http://127.0.0.1:8080
    [DASHBOARD] Dashboard disponibile su http://127.0.0.1:8080/dashboard
    [SECURITY] Auth attiva sulle API di controllo

## API

### Proxy (pubblico)

#### POST /v1/chat/completions

Stessa interfaccia di OpenAI. Il campo `model` **viene ignorato** e sostituito dal modello scelto dal bandit.

    curl -X POST http://127.0.0.1:8080/v1/chat/completions \
      -H "Content-Type: application/json" \
      -d '{"model":"any","messages":[{"role":"user","content":"ciao"}],"stream":false}'

Supporta sia `stream: true` (SSE) sia `stream: false` (JSON).

### Control API (protette da `DASHBOARD_TOKEN`)

Se `DASHBOARD_TOKEN` e' vuoto, queste API sono **esposte senza auth** - sconsigliato in produzione.

| Endpoint | Metodo | Descrizione |
|----------|--------|-------------|
| `/v1/metrics` | GET | Statistiche complete (richieste, modelli, provider, catalog) |
| `/v1/logs` | GET | Ultimi 200 log (ring buffer) |
| `/v1/reset/model/:id` | POST | Reset di un modello (fails, cooldown, last_used_index) |
| `/v1/reset/provider/:name` | POST | Reset di un provider e dei suoi modelli |
| `/v1/provider/retry/:name` | POST | Sblocca un provider marcato `needs_attention` o `permanent` |
| `/v1/provider/ignore/:name` | POST | Disabilita permanentemente un provider |

Tutte richiedono l'header:

    x-api-token: <DASHBOARD_TOKEN>

## Dashboard

Apri:

    http://127.0.0.1:8080/dashboard?token=<DASHBOARD_TOKEN>

Il token viene salvato in `localStorage` per il riuso nelle tab successive.

### Cosa mostra

- **Richieste** e **Osservazioni** (successi) totali
- **Modelli** e **Provider**: attivi / in cooldown / bannati / totali / in catalogo
- Tab **Live Logs**: streaming aggiornato ogni secondo
- Tab **Provider**: stato, fails, puntatore, azioni (Reset, Riprova, Ignora)
- Tab **Modelli**: N, avg reward, score UCB1, fails, cooldown, azioni

### Badge di stato

| Badge | Significato |
|-------|-------------|
| Attivo | Nel pool, selezionabile |
| Cooldown | Temporaneamente escluso, timer attivo |
| Da configurare | Problema di configurazione (auth, CLI, Playwright) - richiede intervento manuale |
| Ignorato | Disabilitato permanentemente (ban o azione manuale) |

## Comportamento del bandit

### Reward

Ad ogni successo, il reward e' calcolato come:

    reward = max(0, 1 - durata_secondi / 30)

Quindi una risposta in 1s -> `reward = 0.967`; una in 30s -> `reward = 0`. Le risposte piu veloci sono premiate.

### Aggiornamento UCB1 (con discount)

Su successo:

    N = N * 0.99 + 1
    sum_reward = sum_reward * 0.99 + reward

Su fallimento:

    N = N * 0.99

### Classificazione errori

| Errore | Azione | Scope |
|--------|--------|-------|
| 404 model not found / not supported | Ban permanente | Modello |
| Assignment to constant variable (bug upstream) | Ban permanente | Modello |
| 429 rate limit | Cooldown (durata da reset_seconds) | Modello |
| Timeout / abort | Cooldown 10 min | Modello |
| 5xx generico su modello | Cooldown 10 min | Modello (non provider) |
| 429 quota exhausted (account) | Cooldown (durata dal messaggio) | Provider |
| 402 insufficient funds | Cooldown 6h | Provider |
| Anti-abuse / 418 / captcha | Cooldown 6h | Provider |
| Auth mancante, Playwright, transport, CLI obsoleto | Needs attention | Provider |
| 403 account banned/suspended | Ban permanente | Provider |

### Retry loop

Per ogni richiesta il proxy tenta piu modelli (fino a `providerCount * 4 + 100`, max 500) finche non trova un successo o esaurisce il tempo (`MAX_TOTAL_MS`). Ogni modello che fallisce viene aggiunto a un `excluded` set locale per la richiesta corrente.

## Esecuzione come servizio systemd

Crea `/etc/systemd/system/omniroute-bandit-proxy.service`:

    [Unit]
    Description=OmniRoute Bandit Proxy Service
    After=network.target

    [Service]
    Type=simple
    User=marco
    Group=marco
    WorkingDirectory=/home/marco/omniroute-bandit-proxy
    EnvironmentFile=/home/marco/omniroute-bandit-proxy/.env
    ExecStart=/usr/bin/node /home/marco/omniroute-bandit-proxy/src/index.mjs
    Restart=always
    RestartSec=5
    StandardOutput=journal
    StandardError=journal

    [Install]
    WantedBy=multi-user.target

Attiva:

    sudo systemctl daemon-reload
    sudo systemctl enable --now omniroute-bandit-proxy.service

Log in diretta:

    journalctl -u omniroute-bandit-proxy.service -f

## Struttura del progetto

    omniroute-bandit-proxy/
      src/
        index.mjs        Express server, proxy, control API, dashboard route
        bandit.mjs       Classe DiscountedUCB1Bandit (logica + SQLite)
      public/
        dashboard.html   Dashboard single-file (HTML + CSS + JS inline)
        manifest.json    PWA manifest
        icons/           Favicon e icone PWA
      package.json
      .env.example
      README.md

## Schema SQLite

Quattro tabelle, tutte create/migrate automaticamente all'avvio:

| Tabella | Ruolo |
|---------|-------|
| `catalog` | Pool completo dei modelli disponibili (ricostruito ad ogni avvio) |
| `models` | Modelli provati almeno una volta, con N, sum_reward, fails, cooldown, permanent |
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

## Licenza

MIT - vedi LICENSE.

## Autore

**Marco** - [@CherrugDeveloper](https://github.com/CherrugDeveloper)
