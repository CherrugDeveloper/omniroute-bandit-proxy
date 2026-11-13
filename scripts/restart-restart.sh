#!/usr/bin/env bash
set -euo pipefail
SERVICE="omniroute-bandit-proxy.service"

systemctl --user restart "$SERVICE"

# Attendi che la porta sia in ascolto (non libera!)
for i in $(seq 1 30); do
  if ss -tln "sport = :8080" | grep -q ':8080'; then
    echo "✓ $SERVICE riavviato e in ascolto su 8080"
    exit 0
  fi
  sleep 1
done

echo "✗ ERRORE: porta 8080 non in ascolto dopo 30s"
journalctl --user -u "$SERVICE" -n 30 --no-pager
exit 1
