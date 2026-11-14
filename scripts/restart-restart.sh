#!/usr/bin/env bash
set -euo pipefail
SERVICE="omniroute-bandit-proxy.service"
HOST="127.0.0.1"
PORT="8080"

echo "→ Riavvio sicuro di ${SERVICE} (evitando conflitti su porta ${PORT})..."

# Usa restart-safe.sh se disponibile, altrimenti gestisci il rilascio porta
if [ -x "./scripts/restart-safe.sh" ]; then
  ./scripts/restart-safe.sh -q
else
  # Rilascia la porta se occupata prima di riavviare
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${PORT}/tcp" 2>/dev/null || true
  elif command -v lsof >/dev/null 2>&1; then
    local pids=$(lsof -t -i :${PORT} 2>/dev/null || true)
    if [ -n "$pids" ]; then
      kill -9 $pids 2>/dev/null || true
    fi
  fi
  sleep 1

  if systemctl --user list-unit-files | grep -q "$SERVICE"; then
    systemctl --user restart "$SERVICE"
  else
    sudo systemctl restart "$SERVICE"
  fi
fi

# Attendi che la porta sia in ascolto
for i in $(seq 1 30); do
  if ss -tln "sport = :${PORT}" | grep -q ":${PORT}"; then
    echo "✓ ${SERVICE} riavviato e in ascolto su ${PORT}"
    exit 0
  fi
  sleep 1
done

echo "✗ ERRORE: porta ${PORT} non in ascolto dopo 30s"
if journalctl --user -u "$SERVICE" -n 30 --no-pager 2>/dev/null; then
  true
else
  sudo journalctl -u "$SERVICE" -n 30 --no-pager
fi
exit 1
