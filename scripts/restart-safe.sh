#!/usr/bin/env bash
# ============================================================
# restart-safe.sh - Riavvio sicuro del servizio omniroute-bandit-proxy
# Evita race condition su porta 8080 e conflitti PID
# ============================================================
# Uso:
#   ./scripts/restart-safe.sh           # restart sicuro completo
#   ./scripts/restart-safe.sh -f        # restart + follow logs
#   ./scripts/restart-safe.sh -q        # restart silenzioso
# ============================================================

set -euo pipefail
SERVICE="omniroute-bandit-proxy.service"
HOST="127.0.0.1"
PORT="8080"

run_systemctl() {
  if systemctl --user "$@" 2>/dev/null; then
    return 0
  elif systemctl "$@" 2>/dev/null; then
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

wait_for_port_release() {
  local host=$1
  local port=$2
  local timeout=60
  local elapsed=0
  
  echo "→ In attesa liberazione porta ${host}:${port} (timeout ${timeout}s)..."
  
  while [ $elapsed -lt $timeout ]; do
    local in_use=false
    
    if command -v nc >/dev/null 2>&1; then
      if nc -z -w1 "$host" "$port" 2>/dev/null; then
        in_use=true
      fi
    elif command -v ss >/dev/null 2>&1; then
      if ss -tuln "sport = :${port}" 2>/dev/null | grep -q ":${port}"; then
        in_use=true
      fi
    elif command -v lsof >/dev/null 2>&1; then
      if lsof -i :${port} >/dev/null 2>&1; then
        in_use=true
      fi
    fi
    
    if [ "$in_use" != true ]; then
      echo "✓ Porta ${host}:${port} libera"
      return 0
    fi
    
    sleep 1
    elapsed=$((elapsed + 1))
  done
  
  echo "✗ ERRORE: Porta ${host}:${port} ancora occupata dopo ${timeout}s"
  exit 1
}

wait_for_port_bind() {
  local host=$1
  local port=$2
  local timeout=60
  local elapsed=0
  
  echo "→ In attesa binding porta ${host}:${port} (timeout ${timeout}s)..."
  
  while [ $elapsed -lt $timeout ]; do
    local bound=false
    
    if command -v nc >/dev/null 2>&1; then
      if nc -z -w1 "$host" "$port" 2>/dev/null; then
        bound=true
      fi
    fi
    
    if [ "$bound" = true ]; then
      echo "✓ Porta ${host}:${port} in ascolto"
      return 0
    fi
    
    sleep 1
    elapsed=$((elapsed + 1))
  done
  
  echo "✗ ERRORE: Porta ${host}:${port} non si è bindata dopo ${timeout}s"
  exit 1
}

wait_for_service_active() {
  local timeout=30
  local elapsed=0
  
  while [ $elapsed -lt $timeout ]; do
    if run_systemctl is-active --quiet "$SERVICE"; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  
  return 1
}

restart_safe() {
  echo "→ Riavvio sicuro $SERVICE"
  echo "─────────────────────────────────────────"
  
  # 1. Ottieni PID attuale PRIMA dello stop
  current_pid=$(systemctl show -p MainPID "$SERVICE" 2>/dev/null | cut -d= -f2 || echo "0")
  if [ -n "$current_pid" ] && [ "$current_pid" != "0" ]; then
    echo "→ PID attuale: $current_pid"
  else
    echo "→ Nessun PID attivo rilevato"
  fi
  
  # 2. STOP bloccante
  echo "→ Arresto servizio..."
  if ! run_systemctl stop "$SERVICE"; then
    echo "⚠ systemctl stop fallito, provo kill forzato..."
    run_systemctl kill -s SIGTERM "$SERVICE" || true
    sleep 2
  fi
  
  # 3. Attendi terminazione PID
  if [ -n "$current_pid" ] && [ "$current_pid" != "0" ]; then
    local elapsed=0
    while [ $elapsed -lt 60 ]; do
      if ! kill -0 "$current_pid" 2>/dev/null; then
        echo "✓ PID $current_pid terminato"
        break
      fi
      sleep 1
      elapsed=$((elapsed + 1))
    done
  fi
  
  # 4. Attendi liberazione porta
  wait_for_port_release "$HOST" "$PORT"
  
  # 5. START
  echo "→ Avvio servizio..."
  if ! run_systemctl start "$SERVICE"; then
    echo "✗ ERRORE: Avvio servizio fallito"
    exit 1
  fi
  
  # 6. Attendi active
  if ! wait_for_service_active; then
    echo "⚠ Servizio non segnala active, controllo porta..."
  fi
  
  # 7. Attendi binding porta
  wait_for_port_bind "$HOST" "$PORT"
  
  echo "─────────────────────────────────────────"
  echo "✓ $SERVICE riavviato con successo"
  
  # Mostra ultimi log
  run_journalctl -u "$SERVICE" -n 15 --no-pager 2>/dev/null || true
}

follow_logs() {
  echo "→ Log live (Ctrl+C per uscire)"
  run_journalctl -u "$SERVICE" -f
}

case "${1:-}" in
  -q|--quiet)
    restart_safe > /dev/null 2>&1
    if run_systemctl is-active --quiet "$SERVICE"; then
      echo "✓ $SERVICE riavviato"
      exit 0
    else
      echo "✗ ERRORE"
      exit 1
    fi
    ;;
  -f|--follow)
    restart_safe
    echo ""
    follow_logs
    ;;
  *)
    restart_safe
    exit 0
    ;;
esac
