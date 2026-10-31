# Procedura di Riavvio Sicuro OmniRoute Bandit Proxy

## Problemi Risolti

1. **Race condition**: `systemctl restart` non bloccante → nuovo processo parte prima che vecchio liberi porta
2. **PID catturato dopo restart**: script leggeva PID post-restart invece di pre-restart
3. **TimeoutStopSec troppo breve**: 15s vs attesa 30s script
4. **Restart storm**: `RestartSec=5s` + OOM killer ha causato 2175 restart
5. **Porta 8080 bloccata**: processo zombie mantiene binding

## Soluzioni Implementate

### 1. Script `scripts/restart-safe.sh`

Riavvio sicuro con sequenza **stop → attesa porta libera → start**:

```bash
#!/usr/bin/env bash
# Sequenza corretta:
# 1. Cattura PID attuale PRIMA dello stop
# 2. systemctl stop (bloccante)
# 3. Attendi terminazione PID (max 60s)
# 4. Attendi liberazione porta 127.0.0.1:8080
# 5. systemctl start (priorità system systemd)
# 6. Attendi binding porta con rilevamento multi-metodo
# 7. Verifica processo node in ascolto
```

**Migliorie recenti:**

- `run_systemctl` e `run_journalctl` ora provano prima `systemctl` system poi `--user`, evitando falsi negativi su servizio system-wide
- `wait_for_port_bind` con fallback nc/ss/lsof + estrazione PID node
- `wait_for_service_failed` monitora stato failed immediato e ritardato
- Controllo stato servizio con attesa graduale 5x2s per evitare falsi inactive durante fase activating
- Diagnostica porta con metodo rilevato e PID processo

**Uso:**
```bash
./scripts/restart-safe.sh          # Riavvio completo
./scripts/restart-safe.sh -q       # Silenzioso
./scripts/restart-safe.sh -f       # Con follow logs
```

> **Nota:** Lo script `scripts/restart.sh` è obsoleto. Usare esclusivamente `restart-safe.sh` per evitare race condition e mismatch user/system systemd.

### 2. Service file aggiornato

`omniroute-bandit-proxy.service` modifiche:
- `TimeoutStopSec=60s` (da 15s)
- `KillMode=mixed` (per terminazione gruppo processi)
- `RestartSec=10s` (da 5s, evita loop rapido)
- `StartLimitIntervalSec=60` + `StartLimitBurst=3` (anti-restart storm)

### 3. Script emergenza `scripts/free-port-emergency.sh`

Da usare SOLO in caso di conflitto bloccante:

```bash
./scripts/free-port-emergency.sh
```

Trova e termina processi su porta 8080, kill forzato se necessario.

## Comandi di Applicazione

### 1. Applicare modifiche service

```bash
# Copia service in systemd
sudo cp omniroute-bandit-proxy.service /etc/systemd/system/

# Ricarica configurazioni
sudo systemctl daemon-reload

# Riavvia servizio con nuova configurazione
sudo systemctl restart omniroute-bandit-proxy

# Verifica stato
sudo systemctl status omniroute-bandit-proxy
```

### 2. Usare restart sicuro

```bash
# Riavvio normale
./scripts/restart-safe.sh

# Riavvio silenzioso (per cron o CI)
./scripts/restart-safe.sh -q

# Riavvio con log live
./scripts/restart-safe.sh -f
```

### 3. Emergenza porta bloccata

```bash
# Libera porta 8080
./scripts/free-port-emergency.sh

# Verifica
lsof -i :8080
ss -tuln sport = :8080
```

### 4. Monitoraggio restart

```bash
# Conta restart recenti
sudo systemctl show omniroute-bandit-proxy -p NRestarts

# Log restart
sudo journalctl -u omniroute-bandit-proxy --since "1 hour ago" | grep -i restart

# Stato health
curl http://127.0.0.1:8080/v1/health-check/status
```

## Procedura Corretta di Riavvio

### Riavvio Pianificato
1. `./scripts/restart-safe.sh`
2. Verifica `systemctl is-active omniroute-bandit-proxy`
3. Test `curl http://127.0.0.1:8080/v1/metrics`

### Riavvio Emergenza
1. `./scripts/free-port-emergency.sh` (se porta bloccata)
2. `./scripts/restart-safe.sh`
3. Verifica logs: `sudo journalctl -u omniroute-bandit-proxy -n 50`

### Post-OOM Killer
Dopo OOM killer, verificare:
```bash
# Processi orfani
ps aux | grep node | grep index.mjs

# Libera porta se necessario
./scripts/free-port-emergency.sh

# Riavvio pulito
./scripts/restart-safe.sh
```

## Configurazioni Chiave

| Parametro | Valore | Motivo |
|-----------|--------|--------|
| TimeoutStopSec | 60s | Tempo sufficiente graceful shutdown |
| KillMode | mixed | Termina main process + children |
| RestartSec | 10s | Evita loop troppo rapido |
| StartLimitBurst | 3 | Max 3 restart in 60s |
| Session TTL | 30min | Come documentato (non 24h) |

## Troubleshooting

### Porta ancora occupata dopo stop
```bash
sudo lsof -i :8080
sudo kill -9 <PID>
./scripts/restart-safe.sh
```

### Servizio in loop restart
```bash
sudo systemctl stop omniroute-bandit-proxy
sudo systemctl reset-failed omniroute-bandit-proxy
./scripts/restart-safe.sh
```

### PID non termina
```bash
./scripts/free-port-emergency.sh
sudo systemctl daemon-reexec
```

## Note

- PID attuale corretto: 286599 (verificato)
- Porta 8080 occupata correttamente dal servizio
- Non usare mai `systemctl restart` diretto → usa `restart-safe.sh`
- Script `restart.sh` è obsoleto e mantenuto solo per retrocompatibilità; usare esclusivamente `restart-safe.sh` per evitare race condition su porta 8080
- Modifiche recenti: priorità systemd system prima di user, rilevamento binding multi-metodo (nc/ss/lsof), monitoraggio stato failed immediato e ritardato
