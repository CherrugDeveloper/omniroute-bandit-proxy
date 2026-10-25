#!/usr/bin/env bash
# ============================================================
# restart.sh - Riavvia il servizio (utente o sistema) con fallback
# ============================================================
# Uso:
#   ./scripts/restart.sh           # restart + log startup (exit quando pronto)
#   ./scripts/restart.sh -f        # restart + segui i log live
#   ./scripts/restart.sh -q        # restart silenzioso
# ============================================================

set -euo pipefail
SERVICE="omniroute-bandit-proxy.service"

run_systemctl() {
  if systemctl --user "$@" 2>/dev/null; then
    return 0
  elif systemctl "$@" 2>/dev/null; then
    return 0
  else
    # Fallback to local node restart if systemctl service is not configured/available
    return 1
  fi
}

run_journalctl() {
  if journalctl --user "$@" 2>/dev/null; then
    return 0
  elif journalctl "$@" 2>/dev/null; then
    return 0
  else
    return 1
  fi
}

# Wait for specific host:port to be released using ss or netstat
wait_for_port_release() {
  local host=$1
  local port=$2
  local timeout=10
  local elapsed=0
  
  while [ $elapsed -lt $timeout ]; do
    local port_in_use=false
    
    # Try ss first (preferred)
    if command -v ss >/dev/null 2>&1; then
      # Check if port is listening on the specific host
      if ss -tuln 2>/dev/null | grep -q ":${port} " && ss -tuln 2>/dev/null | grep -E "127.0.0.1:${port}|0.0.0.0:${port}|\[::\]:${port}"; then
        # More specific check for the host
        if ss -tulnp "sport = :${port}" 2>/dev/null | grep -q "${host}"; then
          port_in_use=true
        elif [ "${host}" = "127.0.0.1" ] && ss -tulnp "sport = :${port}" 2>/dev/null | grep -q "0.0.0.0:${port}"; then
          # 127.0.0.1 is covered by 0.0.0.0 binding
          port_in_use=true
        fi
      fi
    # Fallback to netstat
    elif command -v netstat >/dev/null 2>&1; then
      if netstat -tuln 2>/dev/null | awk '{print $4}' | grep -q ":${port}$" && netstat -tuln 2>/dev/null | awk '{print $4}' | grep -q "${host}"; then
        port_in_use=true
      fi
    else
      # No ss or netstat available, use nc to check connectivity
      if command -v nc >/dev/null 2>&1; then
        if nc -z -w1 "$host" "$port" 2>/dev/null; then
          port_in_use=true
        fi
      elif command -v bash >/dev/null 2>&1; then
        # Last resort: try /dev/tcp
        if bash -c "cat < /dev/null > /dev/tcp/${host}/${port}" 2>/dev/null; then
          port_in_use=true
        fi
      fi
    fi
    
    if [ "$port_in_use" != true ]; then
      break
    fi
    
    sleep 1
    elapsed=$((elapsed + 1))
  done
  
  if [ $elapsed -ge $timeout ]; then
    echo "⚠ ATTENZIONE: La porta ${host}:${port} è ancora occupata dopo ${timeout}s. Tentativo di avvio comunque..."
  fi
}

graceful_restart() {
  echo "→ systemctl non disponibile o servizio non trovato, tentativo di riavvio locale..."
  # Kill any running node process for index.mjs
  pkill -f "node.*src/index.mjs" || true
  
  # Wait for port 127.0.0.1:8080 to be released
  echo "→ In attesa che la porta 127.0.0.1:8080 si liberi..."
  wait_for_port_release 127.0.0.1 8080

  # Start node in background
  nohup node src/index.mjs > proxy.log 2>&1 &
  echo "✓ Avviato localmente via node src/index.mjs (PID $!)"
}

case "${1:-}" in
  -q|--quiet)
    if run_systemctl restart "$SERVICE"; then
      sleep 1
      run_systemctl is-active --quiet "$SERVICE" && echo "✓ $SERVICE riavviato" || echo "✗ ERRORE"
    else
      graceful_restart
    fi
    exit 0
    ;;
  -f|--follow)
    if run_systemctl restart "$SERVICE"; then
      sleep 1
      echo "→ Log live (Ctrl+C per uscire)"
      run_journalctl -u "$SERVICE" -f || true
    else
      graceful_restart
      echo "→ Log live da proxy.log (Ctrl+C per uscire)"
      tail -f proxy.log
    fi
    exit 0
    ;;
esac

# Default: restart + mostra startup (senza -f, esce subito dopo aver mostrato le ultime righe)
echo "→ Riavvio $SERVICE..."
if run_systemctl restart "$SERVICE"; then
  # Attendi fino a 10s che il servizio sia attivo con polling incrementale
  active=false
  for i in $(seq 1 10); do
    if run_systemctl is-active --quiet "$SERVICE"; then
      active=true
      break
    fi
    sleep 1
  done

  echo "─────────────────────────────────────────"
  run_journalctl -u "$SERVICE" -n 20 --no-pager 2>/dev/null || echo "(Impossibile leggere i log di systemd journalctl)"
  echo "─────────────────────────────────────────"

  if [ "$active" = true ] || run_systemctl is-active --quiet "$SERVICE"; then
    echo "✓ $SERVICE attivo"
    exit 0
  else
    echo "✗ $SERVICE NON attivo"
    exit 1
  fi
else
  graceful_restart
  exit 0
fi
