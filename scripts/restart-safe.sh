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
    local detection_method=""
    
    # Fallback 1: nc check (connection test)
    if command -v nc >/dev/null 2>&1; then
      if nc -z -w1 "$host" "$port" 2>/dev/null; then
        bound=true
        detection_method="nc"
      fi
    fi
    
    # Fallback 2: ss check (socket listening with node process)
    if [ "$bound" != true ] && command -v ss >/dev/null 2>&1; then
      if ss -tulnpe "sport = :${port}" 2>/dev/null | grep -q "node"; then
        bound=true
        detection_method="ss"
      elif ss -tuln "sport = :${port}" 2>/dev/null | grep -q ":${port}"; then
        bound=true
        detection_method="ss (socket only)"
      fi
    fi
    
    # Fallback 3: lsof check (process listening)
    if [ "$bound" != true ] && command -v lsof >/dev/null 2>&1; then
      if lsof -i :${port} -sTCP:LISTEN 2>/dev/null | grep -q "node"; then
        bound=true
        detection_method="lsof (node)"
      elif lsof -i :${port} 2>/dev/null | grep -q "LISTEN"; then
        bound=true
        detection_method="lsof"
      fi
    fi
    
    if [ "$bound" = true ]; then
      echo "✓ Porta ${host}:${port} in ascolto (rilevato via $detection_method)"
      # Verifica PID del processo node in ascolto
      if command -v ss >/dev/null 2>&1; then
        local node_pid=$(ss -tulnpe "sport = :${port}" 2>/dev/null | grep node | grep -oP 'pid=\K[0-9]+' | head -1)
        if [ -n "$node_pid" ]; then
          echo "  PID processo node: $node_pid"
        fi
      fi
      return 0
    fi
    
    # Log diagnostico ogni 10 secondi
    if [ $((elapsed % 10)) -eq 0 ] && [ $elapsed -gt 0 ]; then
      echo "  ... $elapsed/${timeout}s trascorsi, porta non ancora bindata"
    fi
    
    sleep 1
    elapsed=$((elapsed + 1))
  done
  
  echo "✗ ERRORE: Porta ${host}:${port} non si è bindata dopo ${timeout}s"
  echo "  Diagnostica:"
  if command -v ss >/dev/null 2>&1; then
    echo "  ss -tulnpe sport = :${port}:"
    ss -tulnpe "sport = :${port}" 2>/dev/null || echo "    (nessun output o comando non disponibile)"
  fi
  if command -v lsof >/dev/null 2>&1; then
    echo "  lsof -i :${port}:"
    lsof -i :${port} 2>/dev/null || echo "    (nessun output o comando non disponibile)"
  fi
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

wait_for_service_failed() {
  local timeout=10
  local elapsed=0
  
  echo "→ Verifica stato servizio post-avvio..."
  
  while [ $elapsed -lt $timeout ]; do
    local state=$(run_systemctl show -p ActiveState --value "$SERVICE" 2>/dev/null || echo "unknown")
    
    if [ "$state" = "failed" ]; then
      echo "✗ Servizio entrato in stato FAILED"
      return 0
    elif [ "$state" = "active" ]; then
      echo "✓ Servizio in stato active"
      return 1
    fi
    
    # Se il servizio è inactivating/deactivating, aspetta ancora
    if [ "$state" = "inactive" ]; then
      sleep 1
      elapsed=$((elapsed + 1))
    fi
  done
  
  # Timeout: servizio non in failed entro il timeout
  return 1
}

restart_safe() {
  echo "→ Riavvio sicuro $SERVICE"
  echo "─────────────────────────────────────────"
  
  # 0. Reset failed state and ensure no active restart job
  echo "→ Reset failed state..."
  run_systemctl reset-failed "$SERVICE" || true
  # Wait for no active restart job
  local job_wait=0
  while [ $job_wait -lt 30 ]; do
    if ! systemctl list-jobs --no-legend 2>/dev/null | grep -q "$SERVICE"; then
      break
    fi
    sleep 1
    job_wait=$((job_wait + 1))
  done
  
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
  
  # 2b. Wait for service inactive
  echo "→ Attendi stato inactive..."
  local inactive_wait=0
  while run_systemctl is-active --quiet "$SERVICE" && [ $inactive_wait -lt 60 ]; do
    sleep 1
    inactive_wait=$((inactive_wait + 1))
  done
  if run_systemctl is-active --quiet "$SERVICE"; then
    echo "⚠ Servizio ancora attivo dopo attesa"
    echo "  Tentativo diagnostica stato:"
    run_systemctl status "$SERVICE" --no-pager 2>/dev/null | head -20 || true
  else
    echo "✓ Servizio inattivo"
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
  
  # 4b. Verify no node process listening on port
  echo "→ Verifica nessun processo node in ascolto su ${HOST}:${PORT}..."
  local node_check=0
  while [ $node_check -lt 10 ]; do
    local listening=false
    if command -v ss >/dev/null 2>&1; then
      if ss -tulnpe "sport = :${PORT}" 2>/dev/null | grep -q "node"; then
        listening=true
      fi
    elif command -v lsof >/dev/null 2>&1; then
      if lsof -i :${PORT} -sTCP:LISTEN 2>/dev/null | grep -q "node"; then
        listening=true
      fi
    fi
    if [ "$listening" != true ]; then
      echo "✓ Nessun processo node in ascolto"
      break
    fi
    sleep 1
    node_check=$((node_check + 1))
  done
  
  # 5. START
  echo "→ Avvio servizio..."
  if ! run_systemctl start "$SERVICE"; then
    echo "✗ ERRORE: Avvio servizio fallito"
    exit 1
  fi
  
  # Controllo stato servizio con attesa graduale
  local service_state=""
  local service_substate=""
  local check_attempt=0
  local max_checks=5
  
  while [ $check_attempt -lt $max_checks ]; do
    sleep 2
    service_state=$(run_systemctl show -p ActiveState --value "$SERVICE" 2>/dev/null || echo "unknown")
    service_substate=$(run_systemctl show -p SubState --value "$SERVICE" 2>/dev/null || echo "unknown")
    echo "→ Stato servizio: $service_state ($service_substate) [tentativo $((check_attempt+1))/$max_checks]"
    
    if [ "$service_state" = "active" ]; then
      echo "✓ Servizio attivo"
      break
    elif [ "$service_state" = "failed" ]; then
      echo "✗ ERRORE: Servizio entrato in stato FAILED"
      echo "  Log errori (ultimi 30 righe):"
      run_journalctl -u "$SERVICE" --since "2 minutes ago" -n 30 --no-pager 2>/dev/null || journalctl -u "$SERVICE" -n 30 --no-pager 2>/dev/null
      echo "  Stato dettagliato:"
      run_systemctl status "$SERVICE" --no-pager 2>/dev/null || true
      exit 1
    fi
    
    # Se servizio è ancora inactive/dead, potrebbe essere in avvio, continua ad aspettare
    if [ "$service_state" = "inactive" ] || [ "$service_state" = "unknown" ]; then
      check_attempt=$((check_attempt + 1))
      if [ $check_attempt -lt $max_checks ]; then
        echo "  Servizio non ancora attivo, attesa ulteriori 2s..."
        continue
      fi
    fi
    
    check_attempt=$((check_attempt + 1))
  done
  
  # Verifica finale se il servizio non è partito
  if [ "$service_state" != "active" ] && [ "$service_state" != "activating" ]; then
    echo "✗ ERRORE: Servizio non partito dopo $max_checks tentativi, stato $service_state ($service_substate)"
    echo "  systemctl start ha restituito successo ma servizio non è attivo"
    echo "  Log errori (ultimi 30 righe):"
    run_journalctl -u "$SERVICE" --since "2 minutes ago" -n 30 --no-pager 2>/dev/null || journalctl -u "$SERVICE" -n 30 --no-pager 2>/dev/null
    echo "  Stato dettagliato:"
    run_systemctl status "$SERVICE" --no-pager 2>/dev/null || true
    exit 1
  fi
  
  # Se servizio è activating, continua con il normale flusso di attesa
  
  # Verifica se il servizio è entrato in stato failed
  if [ "$service_state" = "failed" ]; then
    echo "✗ ERRORE: Servizio entrato in stato FAILED immediatamente dopo start"
    echo "  PID nuovo processo:"
    local new_pid=$(run_systemctl show -p MainPID --value "$SERVICE" 2>/dev/null || echo "nessuno")
    echo "    $new_pid"
    echo "  Log errori (ultimi 20 righe):"
    run_journalctl -u "$SERVICE" --since "1 minute ago" -n 20 --no-pager 2>/dev/null || journalctl -u "$SERVICE" -n 20 --no-pager 2>/dev/null
    echo "  exit code systemd:"
    run_systemctl show -p Result --value "$SERVICE" 2>/dev/null || echo "N/A"
    exit 1
  fi
  
  # Verifica stato failed con funzione dedicata
  if wait_for_service_failed; then
    echo "✗ ERRORE: Servizio entrato in stato FAILED dopo avvio"
    echo "  Log errori (ultimi 30 righe):"
    run_journalctl -u "$SERVICE" --since "1 minute ago" -n 30 --no-pager 2>/dev/null || journalctl -u "$SERVICE" -n 30 --no-pager 2>/dev/null
    echo "  Stato dettagliato:"
    run_systemctl status "$SERVICE" --no-pager 2>/dev/null || true
    exit 1
  fi
  
  # Small sleep before checking bind
  sleep 2
  
  # 6. Attendi active
  if ! wait_for_service_active; then
    echo "⚠ Servizio non segnala active entro 30s"
    echo "  Verifica stato attuale:"
    local current_state=$(run_systemctl show -p ActiveState --value "$SERVICE" 2>/dev/null || echo "unknown")
    local current_substate=$(run_systemctl show -p SubState --value "$SERVICE" 2>/dev/null || echo "unknown")
    echo "  Stato: $current_state ($current_substate)"
    echo "  Log recenti (ultime 20 righe):"
    run_journalctl -u "$SERVICE" --since "1 minute ago" -n 20 --no-pager 2>/dev/null || journalctl -u "$SERVICE" -n 20 --no-pager 2>/dev/null
    echo "  Verifica se porta è bindata comunque..."
  fi
  
  # 7. Attendi binding porta
  wait_for_port_bind "$HOST" "$PORT"
  
  # 8. Verifica processo node effettivamente in ascolto
  echo "→ Verifica processo node in ascolto sulla porta..."
  local node_verified=false
  if command -v ss >/dev/null 2>&1; then
    if ss -tulnpe "sport = :${PORT}" 2>/dev/null | grep -q "node"; then
      node_verified=true
      local node_pid=$(ss -tulnpe "sport = :${PORT}" 2>/dev/null | grep node | grep -oP 'pid=\K[0-9]+' | head -1)
      echo "✓ Processo node verificato (PID: $node_pid) in ascolto su ${HOST}:${PORT}"
    fi
  elif command -v lsof >/dev/null 2>&1; then
    if lsof -i :${PORT} -sTCP:LISTEN 2>/dev/null | grep -q "node"; then
      node_verified=true
      local node_pid=$(lsof -i :${PORT} -sTCP:LISTEN 2>/dev/null | grep node | awk '{print $2}' | head -1)
      echo "✓ Processo node verificato (PID: $node_pid) in ascolto su ${HOST}:${PORT}"
    fi
  fi
  
  if [ "$node_verified" != true ]; then
    echo "⚠ WARNING: Porta bindata ma processo node non verificato con ss/lsof"
  fi
  
  echo "─────────────────────────────────────────"
  echo "✓ $SERVICE riavviato con successo"
  
  # Mostra ultimi log (ultima ora per evitare log storici)
  run_journalctl -u "$SERVICE" --since "1 hour ago" -n 15 --no-pager 2>/dev/null || journalctl -u "$SERVICE" -n 15 --no-pager 2>/dev/null || true
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
