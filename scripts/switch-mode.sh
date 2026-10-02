#!/usr/bin/env bash
# ============================================================
# switch-mode.sh - Cambia modalità del bandit
# ============================================================
# Uso:
#   ./switch-mode.sh prod    → solo modelli provati (N>=3), <2s, veloce
#   ./switch-mode.sh train   → esplorazione + daemon attivo in background
#   ./switch-mode.sh stop    → ferma il daemon, resta in modalità prod
#   ./switch-mode.sh status  → mostra la modalità attiva
# ============================================================

set -euo pipefail

DIR="$HOME/omniroute-bandit-proxy"
ENV_FILE="$DIR/.env"
SERVICE="omniroute-bandit-proxy.service"

usage() {
  echo "Uso: $0 {prod|train|stop|status}"
  exit 1
}

require_env_file() {
  [ -f "$ENV_FILE" ] || { echo "Errore: $ENV_FILE non trovato"; exit 1; }
}

set_env() {
  local key="$1"
  local val="$2"
  # Rimuovi eventuali righe esistenti (con o senza newline finale)
  sed -i "/^${key}=/d" "$ENV_FILE"
  # Assicura newline finale prima di append
  [ -n "$(tail -c 1 "$ENV_FILE")" ] && echo "" >> "$ENV_FILE"
  echo "${key}=${val}" >> "$ENV_FILE"
}

restart_bandit() {
  echo "→ Riavvio $SERVICE..."
  sudo systemctl restart "$SERVICE"
  sleep 3
  if systemctl is-active --quiet "$SERVICE"; then
    echo "✓ $SERVICE attivo"
  else
    echo "✗ $SERVICE non parte. Controlla: sudo journalctl -u $SERVICE -n 30"
    exit 1
  fi
}

cmd_prod() {
  require_env_file
  echo "→ Modalità PRODUZIONE"
  set_env EXPLOIT_ONLY true
  set_env EXCLUDE_THINKING true

  # Ferma il daemon se gira
  if [ -f "$DIR/.train-daemon.pid" ] && kill -0 "$(cat "$DIR/.train-daemon.pid")" 2>/dev/null; then
    echo "→ Fermo il training daemon..."
    "$DIR/scripts/train-ctl.sh" stop >/dev/null 2>&1 || true
  fi

  restart_bandit
  echo "✓ Modalità PROD attiva (solo modelli N>=3, risposte <2s)"
}

cmd_train() {
  require_env_file
  echo "→ Modalità TRAINING"
  set_env EXPLOIT_ONLY false
  set_env EXCLUDE_THINKING false
  restart_bandit

  # Avvia il daemon se non è già attivo
  if [ -f "$DIR/.train-daemon.pid" ] && kill -0 "$(cat "$DIR/.train-daemon.pid")" 2>/dev/null; then
    echo "✓ Training daemon già in esecuzione (PID $(cat "$DIR/.train-daemon.pid"))"
  else
    echo "→ Avvio training daemon..."
    (cd "$DIR/scripts" && \
      EXCLUDE_PROVIDERS=gemini,felo TIMEOUT_MS=20000 DELAY_MS=2000 SKIP_TESTED=true \
      ./train-ctl.sh start)
  fi

  echo "✓ Modalità TRAIN attiva (esplorazione + daemon)"
  echo "  Per tornare a prod: $0 prod"
}

cmd_stop() {
  echo "→ Stop del training daemon (senza cambiare modalità)"
  if [ -f "$DIR/.train-daemon.pid" ] && kill -0 "$(cat "$DIR/.train-daemon.pid")" 2>/dev/null; then
    "$DIR/scripts/train-ctl.sh" stop
  else
    echo "  (daemon non in esecuzione)"
  fi
}

cmd_status() {
  require_env_file
  local exploit thinking
  exploit=$(grep -E "^EXPLOIT_ONLY=" "$ENV_FILE" | cut -d= -f2 || echo "false")
  thinking=$(grep -E "^EXCLUDE_THINKING=" "$ENV_FILE" | cut -d= -f2 || echo "false")

  echo "=== STATO BANDIT ==="
  echo "Modalità:        $([ "$exploit" = "true" ] && echo "PROD (exploit only)" || echo "TRAIN (esplorazione)")"
  echo "EXPLOIT_ONLY:    $exploit"
  echo "EXCLUDE_THINKING: $thinking"
  echo "Servizio:        $(systemctl is-active $SERVICE)"

  if [ -f "$DIR/.train-daemon.pid" ] && kill -0 "$(cat "$DIR/.train-daemon.pid")" 2>/dev/null; then
    echo "Training daemon: IN ESECUZIONE (PID $(cat "$DIR/.train-daemon.pid"))"
  else
    echo "Training daemon: fermo"
  fi

  # Metriche rapide
  echo ""
  echo "=== METRICHE ==="
  curl -s -H "x-api-token: ${DASHBOARD_TOKEN:-Cadrega}" http://127.0.0.1:8080/v1/metrics 2>/dev/null \
    | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    s = d.get('summary', {})
    print(f\"Attivi:       {s.get('activeCount', '?')}\")
    print(f\"Reward medio: {s.get('avgReward', '?')}\")
    print(f\"Latenza:      {s.get('avgLatencySec', '?')}s\")
    print(f\"Free attivi:  {s.get('freeActive', '?')}\")
    tm = s.get('topModel') or {}
    print(f\"Top model:    {tm.get('id', '?')} (avg {tm.get('avg', '?')})\")
except Exception as e:
    print(f'Errore metriche: {e}')
" 2>/dev/null || echo "(metriche non disponibili)"
}

case "${1:-}" in
  prod)   cmd_prod ;;
  train)  cmd_train ;;
  stop)   cmd_stop ;;
  status) cmd_status ;;
  *)      usage ;;
esac
