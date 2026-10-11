#!/usr/bin/env bash
# ============================================================
# restart.sh - Riavvia il servizio e mostra i log di startup
# ============================================================
# Uso:
#   ./scripts/restart.sh           # restart + log startup (exit quando pronto)
#   ./scripts/restart.sh -f        # restart + segui i log live
#   ./scripts/restart.sh -q        # restart silenzioso
# ============================================================

set -euo pipefail
SERVICE="omniroute-bandit-proxy.service"

case "${1:-}" in
  -q|--quiet)
    sudo systemctl restart "$SERVICE"
    sleep 2
    sudo systemctl is-active --quiet "$SERVICE" && echo "✓ $SERVICE riavviato" || echo "✗ ERRORE"
    exit 0
    ;;
  -f|--follow)
    sudo systemctl restart "$SERVICE"
    sleep 2
    echo "→ Log live (Ctrl+C per uscire)"
    sudo journalctl -u "$SERVICE" -f
    exit 0
    ;;
esac

# Default: restart + mostra startup
echo "→ Riavvio $SERVICE..."
sudo systemctl restart "$SERVICE"
sleep 1

# Attendi fino a 15s che compaia "Server avviato" o errore
for i in $(seq 1 15); do
  if sudo journalctl -u "$SERVICE" --since "20 seconds ago" 2>/dev/null | grep -q "Server avviato\|FATAL\|Errore"; then
    break
  fi
  sleep 1
done

echo "─────────────────────────────────────────"
sudo journalctl -u "$SERVICE" --since "20 seconds ago" --no-pager | grep -vE "systemd\[1\].*(Stopping|Stopped|Deactivated|Consumed|Started|Scheduled)"
echo "─────────────────────────────────────────"

if sudo systemctl is-active --quiet "$SERVICE"; then
  echo "✓ $SERVICE attivo"
else
  echo "✗ $SERVICE NON attivo"
  exit 1
fi
