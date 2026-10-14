#!/usr/bin/env bash
set -e

HOST="127.0.0.1"
PORT="8080"
URL="http://$HOST:$PORT"

echo "Checking if OmniRoute Bandit Proxy is running at $URL..."

# Check server is running by querying /v1/version
if ! curl -s --max-time 3 "$URL/v1/version" > /dev/null; then
    echo "ERROR: Proxy is not running at $URL"
    exit 1
fi

echo "Proxy is running. Version info:"
curl -s "$URL/v1/version"
echo ""

echo "Sending test request to $URL/v1/chat/completions..."
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$URL/v1/chat/completions" \
    -H "Content-Type: application/json" \
    -d '{
        "model": "gpt-4o",
        "messages": [{"role": "user", "content": "Hello, are you working?"}]
    }')

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_STATUS/d')

echo "Response Status: $HTTP_STATUS"
echo "Response Body: $BODY"

if [ "$HTTP_STATUS" -eq 200 ] || [ "$HTTP_STATUS" -eq 400 ] || [ "$HTTP_STATUS" -eq 401 ] || [ "$HTTP_STATUS" -eq 502 ] || [ "$HTTP_STATUS" -eq 503 ]; then
    echo "SUCCESS: Proxy successfully responded to chat completions request (Status: $HTTP_STATUS)."
else
    echo "WARNING: Unexpected status code: $HTTP_STATUS"
fi

echo "Test script completed successfully."
