# OmniRoute Bandit Proxy

## Panoramica

OmniRoute Bandit Proxy è un sistema middleware che funge da proxy tra l'estensione Zoo Code di VS Code e il proxy omniroute. Fornisce funzionalità di gestione dei modelli per Zoo Code, con un algoritmo di selezione dei modelli basato su bandit e un sistema di scoring.

## Caratteristiche Principali

### 1. Algoritmo Bandit
- **UCB1 con discount**: Selezione dei modelli con esplorazione-esploitation bilanciata
- **Aggiornamento con discount**: Dà più peso alle osservazioni recenti
- **Sistema di reward**: `reward = max(0, 1.0 - durata_sec / 30)`
- **Classificazione errori**: 404, timeout, 5xx, rate limit, ban permanente, ecc.

### 2. Gestione dei Modelli
- **Catalogo**: Pool completo dei modelli disponibili (ricostruito ad ogni avvio)
- **Modelli**: Modelli provati almeno una volta (N, sum_reward, fails, cooldown, permanent, degraded)
- **Modelli training**: Statistiche training (isolate da modelli - non inquinano UCB1 prod)
- **Provider history**: Stato per provider (fails, cooldown, permanent, needs_attention, pointer)

### 3. Session Affinity
- **Pin session**: Calcola `sessionKey = md5(system_prompt + primo_user_message)`
- **TTL 30 min**: Pin valido per 30 minuti
- **Invalidazione pin**: Se il modello pinnato fallisce (5xx, timeout), il pin viene rimosso

### 4. Sistema di Modalità
- **14 modalità Zoo Code**: Riconosce le modalità di Zoo Code analizzando il system prompt
- **Profili soft bias**: Moltiplicatore sullo score UCB1 per ogni profilo
- **Auto-discovery**: Prompt mai visti → salvati in `config/modes.discovered.json`

### 5. Dashboard
- **Live Logs**: Streaming aggiornato ogni secondo
- **Metriche**: Richieste, osservazioni, modelli, provider, errori
- **Modalità**: Signature attive + discovery in attesa

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
| 402 insufficient funds | Cooldown 6h | Provider |
| Anti-abuse / 418 / captcha | Cooldown 6h | Provider |
| Auth mancante, Playwright, transport, CLI obsoleto | Needs attention | Provider |
| 403 account banned/suspended | Ban permanente | Provider |
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

### 11. Script di utilità

| Script | Cosa fa |
|--------|---------|
| `scripts/restart.sh` | Restart servizio + feedback su stdout |
| `scripts/switch-mode.sh prod` | Modalità prod (EXPLOIT_ONLY=true, <2s) |
| `scripts/switch-mode.sh train-gentle` | Avvia daemon training in parallelo |
| `scripts/switch-mode.sh stop` | Ferma daemon training |
| `scripts/switch-mode.sh status` | Stato + metriche rapide |
| `scripts/train-ctl.sh start/stop/status/logs` | Controllo diretto training daemon |

### 12. Struttura del progetto

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

### 13. Schema SQLite

Sei tabelle, tutte create/migrate automaticamente all'avvio:

| Tabella | Ruolo |
|---------|-------|
| `catalog` | Pool completo dei modelli disponibili (ricostruito ad ogni avvio) |
| `models` | Modelli provati almeno una volta (N, sum_reward, fails, cooldown, permanent, degraded) |
| `models_train` | Statistiche training (isolate da `models` — non inquinano UCB1 prod) |
| `provider_history` | Stato per provider (fails, cooldown, permanent, needs_attention, pointer) |
| `meta` | Contatori globali (totalRequests, totalObservations) |

### 14. Sviluppo

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

### 16. Licenza

MIT - vedi LICENSE.

### 17. Autore

**Marco** - [@CherrugDeveloper](https://github.com/CherrugDeveloper)