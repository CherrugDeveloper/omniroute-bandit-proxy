#!/usr/bin/env bash
# ============================================================
# train-ctl.sh - Controlla il train-daemon
# ============================================================
# Uso:
#   ./scripts/train-ctl.sh start     # avvia in background
#   ./scripts/train-ctl.sh stop      # ferma
#   ./scripts/train-ctl.sh status    # stato
#   ./scripts/train-ctl.sh logs      # segui i log live
#   ./scripts/train-ctl.sh restart   # riavvia
# ============================================================

set -u
DIR="$HOME/omniroute-bandit-proxy"
PIDFILE="$DIR/.train-daemon.pid"
LOGFILE="$DIR/training.log"
DAEMON="$DIR/scripts/train-daemon.mjs"

case "${1:-}" in
  start)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "Già in esecuzione (PID $(cat "$PIDFILE"))"
      exit 1
    fi
    cd "$DIR"
    : > "$LOGFILE"
    # Carica .env per ereditare EXCLUDE_PROVIDERS, TRAIN_EXCLUDE_PROVIDERS, ecc.
    if [ -f "$DIR/.env" ]; then
      set -a
      . "$DIR/.env"
      set +a
    fi
    nohup node "$DAEMON" >> "$LOGFILE" 2>&1 &
    echo $! > "$PIDFILE"
    sleep 1
    if kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      echo "Avviato (PID $(cat "$PIDFILE"))"
      echo "Log: $LOGFILE"
      echo "Segui: tail -f $LOGFILE"
    else
      echo "Errore avvio, controlla $LOGFILE"
      rm -f "$PIDFILE"
      exit 1
    fi
    ;;

  stop)
    if [ ! -f "$PIDFILE" ]; then
      echo "Non in esecuzione (nessun PID file)"
      exit 0
    fi
    PID=$(cat "$PIDFILE")
    if ! kill -0 "$PID" 2>/dev/null; then
      echo "PID $PID non attivo, pulisco PID file"
      rm -f "$PIDFILE"
      exit 0
    fi
    echo "Invio SIGTERM a PID $PID..."
    kill -TERM "$PID"
    for i in $(seq 1 30); do
      if ! kill -0 "$PID" 2>/dev/null; then
        rm -f "$PIDFILE"
        echo "Fermato."
        exit 0
      fi
      sleep 1
    done
    echo "Non si ferma in 30s, forzo SIGKILL..."
    kill -9 "$PID" 2>/dev/null
    rm -f "$PIDFILE"
    echo "Forzato."
    ;;

  status)
    if [ ! -f "$PIDFILE" ]; then
      echo "Non in esecuzione."
      exit 1
    fi
    PID=$(cat "$PIDFILE")
    if kill -0 "$PID" 2>/dev/null; then
      echo "In esecuzione (PID $PID)"
      echo "Log: $LOGFILE"
      echo "--- Ultime 5 righe ---"
      tail -5 "$LOGFILE"
    else
      echo "PID $PID non attivo, pulisco PID file."
      rm -f "$PIDFILE"
      exit 1
    fi
    ;;

  logs)
    if [ ! -f "$LOGFILE" ]; then
      echo "Nessun log file ancora."
      exit 1
    fi
    tail -f "$LOGFILE"
    ;;

  restart)
    "$0" stop
    sleep 2
    "$0" start
    ;;

  *)
    echo "Uso: $0 {start|stop|status|logs|restart}"
    exit 1
    ;;
esac
