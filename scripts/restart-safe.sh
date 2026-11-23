#!/usr/bin/env bash
# ============================================================
# restart-safe.sh - Riavvio sicuro del servizio omniroute-bandit-proxy
# Evita race condition su porta 8080 e conflitti PID
# Supporta autenticazione tramite impronta digitale o riconoscimento facciale
# (configurato in /etc/pam.d/sudo tramite pam_exec face-auth)
# ============================================================
# Uso:
#   ./scripts/restart-safe.sh                  # restart sicuro completo + refresh dashboard
#   ./scripts/restart-safe.sh -f               # restart + follow logs
#   ./scripts/restart-safe.sh --no-refresh     # restart senza refresh browser
#   ./scripts/restart-safe.sh -n               # alias per --no-refresh
#   ./scripts/restart-safe.sh --help           # mostra questo aiuto
# ============================================================

set -euo pipefail
SERVICE="omniroute-bandit-proxy.service"
HOST="127.0.0.1"
PORT="8080"
DASHBOARD_URL="http://127.0.0.1:8080/dashboard"
NO_REFRESH=false

# Determina se abbiamo bisogno di sudo (utente non root)
NEED_SUDO=false
if [ "$(id -u)" -ne 0 ]; then
  NEED_SUDO=true
fi

run_systemctl() {
  if [ "$NEED_SUDO" = true ]; then
    # Try systemctl --user first (for user-level services)
    if systemctl --user "$@" 2>/dev/null; then
      return 0
    fi
    # Fall back to sudo systemctl
    local current_pid=
    if sudo systemctl "$@" 2>/dev/null; then
      return 0
    fi
  else
    if systemctl "$@" 2>/dev/null; then
      return 0
    fi
  fi
  return 1
}

run_journalctl() {
  if [ "$NEED_SUDO" = true ]; then
    # Try journalctl --user first (for user-level services)
    if journalctl --user "$@" 2>/dev/null; then
      return 0
    fi
    # Fall back to sudo journalctl
    local current_pid=
    if sudo journalctl "$@" 2>/dev/null; then
      return 0
    fi
  else
    if journalctl "$@" 2>/dev/null; then
      return 0
    fi
  fi
  return 1
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
    
    # After 5 seconds of waiting, automatically trigger emergency port freeing if port is still occupied
    if [ $elapsed -eq 5 ]; then
      echo "⚠ Porta ${host}:${port} ancora occupata dopo 5s, avvio liberazione forzata automatica..."
      if [ -x "./scripts/free-port-emergency.sh" ]; then
        ./scripts/free-port-emergency.sh || true
      else
        if command -v lsof >/dev/null 2>&1; then
          local procs=$(lsof -i :${port} -t 2>/dev/null || true)
          for pid in $procs; do
            kill -TERM "$pid" 2>/dev/null || true
          done
        fi
        pkill -f "node.*src/index.mjs" || true
      fi
    fi
    
    sleep 1
    elapsed=$((elapsed + 1))
  done
  
  # Timeout reached: execute aggressive force-kill
  echo "⚠ Timeout ${timeout}s raggiunto per liberazione porta ${host}:${port}, eseguo force-kill aggressivo..."
  if [ -x "./scripts/free-port-emergency.sh" ]; then
    ./scripts/free-port-emergency.sh || true
  fi
  pkill -9 -f "node.*src/index.mjs" || true
  pkill -9 -f "omniroute-bandit-proxy" || true
  
  sleep 2
  if command -v nc >/dev/null 2>&1 && nc -z -w1 "$host" "$port" 2>/dev/null; then
    echo "✗ ERRORE CRITICO: Impossibile liberare la porta ${host}:${port}"
    exit 1
  else
    echo "✓ Porta ${host}:${port} forzatamente liberata"
    return 0
  fi
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
    
    # Se il servizio è inactivating/deactivating/reloading/unknown, aspetta con sleep
    sleep 1
    elapsed=$((elapsed + 1))
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
    if [ "$NEED_SUDO" = true ]; then
    local current_pid=
      if ! sudo systemctl list-jobs --no-legend 2>/dev/null | grep -q "$SERVICE"; then
        break
      fi
    else
      if ! systemctl list-jobs --no-legend 2>/dev/null | grep -q "$SERVICE"; then
        break
      fi
    fi
    sleep 1
    job_wait=$((job_wait + 1))
  done
  
  # 1. Ottieni PID attuale PRIMA dello stop
  if [ "$NEED_SUDO" = true ]; then
    local current_pid
    current_pid=$(sudo systemctl show -p MainPID "$SERVICE" 2>/dev/null | cut -d= -f2 || echo "0")
  else
    local current_pid
    current_pid=$(systemctl show -p MainPID "$SERVICE" 2>/dev/null | cut -d= -f2 || echo "0")
  fi
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

  # 4c. Verifica WorkingDirectory preventiva per evitare errori CHDIR
  echo "→ Verifica WorkingDirectory del servizio..."
  local working_dir=""
  working_dir=$(run_systemctl show -p WorkingDirectory --value "$SERVICE" 2>/dev/null || echo "")
  if [ -z "$working_dir" ] || [ "$working_dir" = " " ]; then
    echo "✗ ERRORE: Impossibile recuperare WorkingDirectory da systemd"
    echo "  Il servizio potrebbe non essere configurato correttamente"
    exit 1
  fi
  echo "  WorkingDirectory configurata: $working_dir"
  
  if [ ! -d "$working_dir" ]; then
    echo "✗ ERRORE CRITICO: WorkingDirectory non esiste"
    echo "  Directory: $working_dir"
    echo "  Il servizio systemd non può avviare senza WorkingDirectory valida"
    echo "  Soluzione: creare la directory o correggere il file systemd"
    exit 1
  fi
  
  if [ ! -w "$working_dir" ]; then
    echo "✗ ERRORE CRITICO: WorkingDirectory non scrivibile"
    echo "  Directory: $working_dir"
    echo "  Permessi attuali: $(ls -ld "$working_dir" | awk '{print $1}')"
    echo "  Il servizio non può scrivere nella WorkingDirectory"
    echo "  Soluzione: correggere i permessi della directory (chmod 755)"
    exit 1
  fi
  
  if [ ! -x "$working_dir" ]; then
    echo "✗ ERRORE CRITICO: WorkingDirectory non accessibile"
    echo "  Directory: $working_dir"
    echo "  Permessi attuali: $(ls -ld "$working_dir" | awk '{print $1}')"
    echo "  Il servizio non può accedere alla WorkingDirectory"
    echo "  Soluzione: correggere i permessi della directory"
    exit 1
  fi
  
  echo "✓ WorkingDirectory valida e scrivibile: $working_dir"

  # 5. START
  echo "→ Avvio servizio..."
  if ! run_systemctl start "$SERVICE"; then
    echo "✗ ERRORE: Avvio servizio fallito"
    exit 1
  fi
  
  # Controllo stato servizio con attesa graduale e parsing errori CHDIR
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
      
      # Parsing specifico errori CHDIR
      echo "  → Analisi errori CHDIR..."
      local chdir_errors=$(run_journalctl -u "$SERVICE" --since "2 minutes ago" -n 100 --no-pager 2>/dev/null | grep -i "chdir\|cannot change directory\|working directory" || true)
      if [ -n "$chdir_errors" ]; then
        echo "  ✗ ERRORE CHDIR RILEVATO!"
        echo "  Dettagli errore:"
        echo "$chdir_errors"
        echo ""
        echo "  Diagnostica WorkingDirectory:"
        local wd=$(run_systemctl show -p WorkingDirectory --value "$SERVICE" 2>/dev/null || echo "N/A")
        echo "    WorkingDirectory configurata: $wd"
        if [ -n "$wd" ] && [ "$wd" != "N/A" ]; then
          echo "    Esistenza directory: $([ -d "$wd" ] && echo "ESISTE" || echo "NON ESISTE")"
          echo "    Permessi directory: $(ls -ld "$wd" 2>/dev/null || echo "Non accessibile")"
          echo "    Utente servizio: $(run_systemctl show -p User --value "$SERVICE" 2>/dev/null || echo "root/system")"
        fi
        echo "  Soluzione: verificare che la WorkingDirectory esista e sia accessibile"
      fi
      
      echo "  Stato dettagliato:"
      run_systemctl status "$SERVICE" --no-pager 2>/dev/null || true
      exit 1
    fi
    
    # Se servizio è ancora inactive/dead, potrebbe essere in avvio, continua ad aspettare
    if [ "$service_state" = "inactive" ] || [ "$service_state" = "unknown" ]; then
      if [ $check_attempt -lt $max_checks ]; then
        echo "  Servizio non ancora attivo, attesa ulteriori 2s..."
        check_attempt=$((check_attempt + 1))
        continue
      fi
    fi
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
  
  # Refresh dashboard after backend restart (se non disabilitato)
  if [ "$NO_REFRESH" != true ]; then
    refresh_dashboard
  fi
}

refresh_dashboard() {
  local dashboard_url="http://127.0.0.1:8080/dashboard"
  
  echo "→ Refresh della dashboard..."
  
  # 1. Cerca di attivare la finestra esistente e inviare F5 (vero refresh)
  if command -v wmctrl >/dev/null 2>&1; then
    # Cerca una finestra con "dashboard" o "omniroute" nel titolo
    local window_id=$(wmctrl -l 2>/dev/null | grep -i "dashboard\|omniroute" | head -1 | awk '{print $1}')
    if [ -n "$window_id" ]; then
      echo "  Trovata finestra dashboard (ID: $window_id), attivazione e invio F5..."
      wmctrl -a "$window_id" 2>/dev/null || true
      # Invia F5 alla finestra attiva
      if command -v xdotool >/dev/null 2>&1; then
        xdotool key --window "$window_id" F5 2>/dev/null || true
        echo "  ✓ F5 inviato via xdotool"
      elif command -v xte >/dev/null 2>&1; then
        xte "key F5" 2>/dev/null || true
        echo "  ✓ F5 inviato via xte"
      else
        echo "  ⚠ Nessun tool per inviare F5, solo attivazione finestra"
      fi
      return 0
    fi
  fi
  
  # 2. Fallback: usa xdg-open per aprire la dashboard (se già aperta, molti browser fanno refresh)
  if command -v xdg-open >/dev/null 2>&1; then
    echo "  Apertura dashboard con xdg-open..."
    xdg-open "$dashboard_url" >/dev/null 2>&1 || true
    echo "  ✓ Dashboard aperta/refreshata via xdg-open"
    return 0
  fi
  
  # 3. Nessun tool disponibile: non fallire, solo avvisa
  echo "⚠ Nessun tool disponibile per il refresh della dashboard (wmctrl/xdg-open non trovati)"
  return 0
}

follow_logs() {
  echo "→ Log live (Ctrl+C per uscire)"
  run_journalctl -u "$SERVICE" -f
}

case "${1:-}" in
  -f|--follow)
    restart_safe
    echo ""
    follow_logs
    ;;
  --no-refresh|-n)
    NO_REFRESH=true
    restart_safe
    exit 0
    ;;
  --help|-h)
    echo "Uso: $0 [opzioni]"
    echo ""
    echo "Opzioni:"
    echo "  (nessuna)       Riavvio sicuro completo + refresh dashboard"
    echo "  -f, --follow    Riavvio + follow logs"
    echo "  -n, --no-refresh  Riavvio senza refresh browser"
    echo "  -h, --help      Mostra questo aiuto"
    exit 0
    ;;
  *)
    restart_safe
    exit 0
    ;;
esac
