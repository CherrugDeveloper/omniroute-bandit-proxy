#!/usr/bin/env bash
# ============================================================
# free-port-emergency.sh - Emergenza: libera porta 8080
# Da usare SOLO in caso di conflitto bloccante
# ============================================================
# Uso:
#   ./scripts/free-port-emergency.sh
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

echo "⚠️  EMERGENZA: Liberazione porta ${PORT}"
echo "─────────────────────────────────────────"

# 1. Trova processi sulla porta
echo "→ Ricerca processi su porta ${PORT}..."
if command -v lsof >/dev/null 2>&1; then
  PROCESSES=$(lsof -i :${PORT} -t 2>/dev/null || true)
elif command -v ss >/dev/null 2>&1; then
  PROCESSES=$(ss -ltnp "sport = :${PORT}" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | tr '\n' ' ')
else
  echo "⚠ Nessuno strumento disponibile per rilevare processi"
  PROCESSES=""
fi

if [ -z "${PROCESSES:-}" ]; then
  echo "✓ Nessun processo trovato su porta ${PORT}"
else
  echo "→ PID rilevati: ${PROCESSES}"
  
  # 2. Verifica se è il servizio systemd
  if run_systemctl is-active --quiet "$SERVICE"; then
    echo "→ Servizio systemd attivo, si tenta stop graceful..."
    run_systemctl stop "$SERVICE" || true
    sleep 3
  fi
  
  # 3. Kill forzato processi residui
  for pid in $PROCESSES; do
    if kill -0 "$pid" 2>/dev/null; then
      echo "→ Terminazione PID ${pid}..."
      kill -TERM "$pid" 2>/dev/null || true
      sleep 2
      if kill -0 "$pid" 2>/dev/null; then
        echo "→ SIGKILL su PID ${pid}..."
        kill -KILL "$pid" 2>/dev/null || true
        sleep 1
      fi
      echo "✓ PID ${pid} terminato"
    fi
  done
fi

# 4. Verifica liberazione
echo "→ Verifica liberazione porta..."
elapsed=0
while [ $elapsed -lt 30 ]; do
  if command -v nc >/dev/null 2>&1; then
    if ! nc -z -w1 "$HOST" "$PORT" 2>/dev/null; then
      echo "✓ Porta ${PORT} libera"
      exit 0
    fi
  fi
  sleep 1
  elapsed=$((elapsed + 1))
done

echo "✗ Porta ${PORT} ancora occupata"
echo "→ Prova kill su processi node..."
pkill -f "node.*src/index.mjs" || true
sleep 2

echo "⚠️  ATTENZIONE: Verifica manuale richiesta"
echo "   sudo lsof -i :${PORT}"
echo "   sudo netstat -tulpn | grep :${PORT}"
exit 1
