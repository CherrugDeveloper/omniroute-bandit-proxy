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
    return 1
  fi
}

systemctl_available() {
  if systemctl --user status "$SERVICE" >/dev/null 2>&1 || systemctl status "$SERVICE" >/dev/null 2>&1; then
    return 0
  else
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

# Wait for PID to terminate gracefully
wait_for_pid_termination() {
  local pid=$1
  local timeout=${2:-30}
  local elapsed=0
  
  echo "→ Attesa terminazione PID ${pid} (timeout ${timeout}s)..."
  
  while [ $elapsed -lt $timeout ]; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "✓ PID ${pid} terminato."
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  
  echo "⚠ PID ${pid} ancora attivo dopo ${timeout}s, invio SIGTERM..."
  kill -TERM "$pid" 2>/dev/null || true
  sleep 2
  
  if kill -0 "$pid" 2>/dev/null; then
    echo "⚠ PID ${pid} ancora attivo dopo SIGTERM, invio SIGKILL..."
    kill -KILL "$pid" 2>/dev/null || true
    sleep 1
  fi
  
  if kill -0 "$pid" 2>/dev/null; then
    echo "✗ ERRORE: Impossibile terminare PID ${pid}"
    exit 1
  fi
  
  echo "✓ PID ${pid} terminato."
  return 0
}

# Wait for specific host:port to be released
wait_for_port_release() {
  local host=$1
  local port=$2
  local timeout=30
  local elapsed=0
  
  echo "→ In attesa che la porta ${host}:${port} si liberi (timeout ${timeout}s)..."
  
  while [ $elapsed -lt $timeout ]; do
    local port_in_use=false
    
    # TCP connectivity check using nc (preferred) or /dev/tcp
    if command -v nc >/dev/null 2>&1; then
      if nc -z -w1 "$host" "$port" 2>/dev/null; then
        port_in_use=true
      fi
    elif bash -c "cat < /dev/null > /dev/tcp/${host}/${port}" 2>/dev/null; then
      port_in_use=true
    # Fallback to ss/netstat
    elif command -v ss >/dev/null 2>&1; then
      if ss -tuln "sport = :${port}" 2>/dev/null | grep -q "${port}"; then
        port_in_use=true
      fi
    elif command -v netstat >/dev/null 2>&1; then
      if netstat -tuln 2>/dev/null | grep -q ":${port}"; then
        port_in_use=true
      fi
    fi
    
    if [ "$port_in_use" != true ]; then
      echo "✓ Porta ${host}:${port} libera."
      return 0
    fi
    
    sleep 1
    elapsed=$((elapsed + 1))
  done
  
  echo "✗ ERRORE: La porta ${host}:${port} è ancora occupata dopo ${timeout}s."
  exit 1
}

graceful_restart() {
  if systemctl_available; then
    echo "✗ ERRORE: systemctl disponibile ma servizio non raggiungibile. Non avviare processo locale per evitare conflitti."
    exit 1
  fi
  
  echo "→ Fallback al riavvio locale (systemctl non disponibile)..."
  # Kill any running node process for index.mjs
  pkill -f "node.*src/index.mjs" || true
  sleep 2
  
  # Wait for port 127.0.0.1:8080 to be released
  wait_for_port_release 127.0.0.1 8080

  # Start node in background
  nohup node src/index.mjs > proxy.log 2>&1 &
  echo "✓ Avviato localmente via node src/index.mjs (PID $!)"
}

case "${1:-}" in
  -q|--quiet)
    if run_systemctl restart "$SERVICE"; then
      sleep 1
      # Get PID before restart
      old_pid=$(systemctl show -p MainPID "$SERVICE" 2>/dev/null | cut -d= -f2 || echo "")
      if [ -n "$old_pid" ] && [ "$old_pid" != "0" ]; then
        wait_for_pid_termination "$old_pid" 30
      fi
      wait_for_port_release 127.0.0.1 8080
      run_systemctl is-active --quiet "$SERVICE" && echo "✓ $SERVICE riavviato" || echo "✗ ERRORE"
    else
      graceful_restart
    fi
    exit 0
    ;;
  -f|--follow)
    if run_systemctl restart "$SERVICE"; then
      sleep 1
      # Get PID before restart
      old_pid=$(systemctl show -p MainPID "$SERVICE" 2>/dev/null | cut -d= -f2 || echo "")
      if [ -n "$old_pid" ] && [ "$old_pid" != "0" ]; then
        wait_for_pid_termination "$old_pid" 30
      fi
      wait_for_port_release 127.0.0.1 8080
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

# Get PID before restart to detect old process
old_pid=$(systemctl show -p MainPID "$SERVICE" 2>/dev/null | cut -d= -f2 || echo "")

if run_systemctl restart "$SERVICE"; then
  # Wait for old PID to terminate gracefully
  if [ -n "$old_pid" ] && [ "$old_pid" != "0" ]; then
    wait_for_pid_termination "$old_pid" 30
  fi
  
  # Wait for port release
  wait_for_port_release 127.0.0.1 8080
  
  # Attendi fino a 30s che il servizio sia attivo con polling incrementale e check TCP
  active=false
  for i in $(seq 1 30); do
    if run_systemctl is-active --quiet "$SERVICE"; then
      # Check TCP connectivity to 127.0.0.1:8080
      if command -v nc >/dev/null 2>&1; then
        if nc -z -w1 127.0.0.1 8080 2>/dev/null; then
          active=true
          break
        fi
      fi
      # Even if nc not available, consider service active if systemctl says so
      active=true
      break
    fi
    sleep 1
  done

  echo "─────────────────────────────────────────"
  run_journalctl -u "$SERVICE" -n 20 --no-pager 2>/dev/null || echo "(Impossibile leggere i log di systemd journalctl)"
  echo "─────────────────────────────────────────"

  if [ "$active" = true ] && run_systemctl is-active --quiet "$SERVICE"; then
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
