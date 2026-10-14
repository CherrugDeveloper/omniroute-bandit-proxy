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

graceful_restart() {
  echo "→ systemctl non disponibile o servizio non trovato, tentativo di riavvio locale..."
  # Kill any running node process for index.mjs
  pkill -f "node.*src/index.mjs" || true
  sleep 1
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
