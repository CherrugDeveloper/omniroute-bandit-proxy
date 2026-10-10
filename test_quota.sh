#!/bin/bash
cd /home/marco/omniroute-bandit-proxy
# Kill any existing server
pkill -f "node src/index.mjs" 2>/dev/null
sleep 1
# Start server with token
DASHBOARD_TOKEN=testtoken123 nohup node src/index.mjs > /tmp/omni-test2.log 2>&1 &
SERVER_PID=$!
sleep 4
# Test quota endpoint
curl -s "http://127.0.0.1:8080/v1/quota?token=testtoken123"
# Kill server
kill $SERVER_PID 2>/dev/null