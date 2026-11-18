# WebSocket Reconnection Plan for Punishment Events Endpoint

## Overview
This plan adds automatic WebSocket reconnection logic with exponential backoff to the punishment events endpoint (`ws://127.0.0.1:8080/v1/events/punishment`). This ensures the dashboard continues to receive punishment events even after transient connection losses.

## Background
- The WebSocket connection at `ws://127.0.0.1:8080/v1/events/punishment` is used to broadcast punishment events to the dashboard
- Connection losses can occur due to server restarts, network issues, or the punishment events server being temporarily unavailable
- Without auto-reconnect, missed events are lost and the dashboard shows stale data

## Exponential Backoff Strategy
Following the existing pattern in the codebase (15s → 5m → 30m → 2h → permanent):

| Attempt | Delay | Description |
|---------|-------|-------------|
| 1 | 15 seconds | Initial retry after brief disconnect |
| 2 | 5 minutes (300s) | Moderate backoff for transient issues |
| 3 | 30 minutes (1800s) | Extended backoff for persistent issues |
| 4 | 2 hours (7200s) | Long backoff for sustained problems |
| 5+ | Permanent | Give up after maximum attempts |

## Implementation Location
**File**: `src/events.mjs`
**Functions to modify/add**:
1. `connectToPunishmentEvents()` - New function establishing WebSocket connection with reconnection logic
2. Existing `emitPunishmentEvent()` - Should use the resilient WebSocket connection

## Code Structure

```javascript
// WebSocket reconnection logic for punishment events endpoint
// Exponential backoff: 15s → 5m → 30m → 2h → permanent
let ws = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 4; // 15s, 5m, 30m, 2h

function calculateBackoffDelay(attempt) {
  const delays = [15, 300, 1800, 7200]; // seconds: 15s, 5m, 30m, 2h
  if (attempt < MAX_RECONNECT_ATTEMPTS) {
    return delays[attempt];
  }
  return delays[MAX_RECONNECT_ATTEMPTS - 1]; // cap at 2h
}

function connectToPunishmentEvents() {
  ws = new WebSocket('ws://127.0.0.1:8080/v1/events/punishment');
  
  ws.onopen = () => {
    console.log('[Punishment WS] Connected');
    reconnectAttempts = 0; // reset on successful connection
  };

  ws.onclose = () => {
    console.log('[Punishment WS] Disconnected, attempting reconnect...');
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = calculateBackoffDelay(reconnectAttempts);
      console.log(`[Punishment WS] Reconnecting in ${delay} seconds (attempt ${reconnectAttempts + 1})`);
      setTimeout(() => {
        reconnectAttempts++;
        connectToPunishmentEvents();
      }, delay * 1000);
    } else {
      console.log('[Punishment WS] Permanent disconnection - maximum reconnection attempts reached');
    }
  };

  ws.onerror = (error) => {
    console.error('[Punishment WS] Error:', error.message);
    ws.close(); // Trigger onclose to schedule reconnect
  };

  ws.onmessage = (event) => {
    const eventData = JSON.parse(event.data);
    // Process punishment event data
    // ... existing event handling code ...
  };
}

// Initialize WebSocket connection on module load
connectToPunishmentEvents();
```

## Integration with Existing Code

### 1. Modify `emitPunishmentEvent` to use resilient WS
The existing `emitPunishmentEvent` function should be updated to ensure it sends events through the reconnecting WebSocket rather than failing silently.

### 2. Ensure event buffering persists through reconnections
The existing event buffer (MAX_EVENT_BUFFER = 1000 entries) in `src/events.mjs` already handles persistence through server restarts. The WebSocket reconnection ensures the dashboard receives events even after network interruptions.

### 3. Token validation preserved
The existing token validation logic at `ws://127.0.0.1:8080/v1/events/punishment?token=` in `src/index.mjs` (lines 3393-3431) should remain unchanged. The reconnection logic operates at the transport layer and doesn't affect authentication.

## API Changes
No API changes required. The WebSocket URL remains `ws://127.0.0.1:8080/v1/events/punishment`.

## Testing Considerations
1. **Normal operation**: WebSocket connects, events flow normally, reconnectAttempts resets to 0
2. **Transient disconnect**: Connection drops, reconnects after 15s, events resume
3. **Persistent issue**: Multiple disconnects follow backoff pattern (15s → 5m → 30m → 2h)
4. **Maximum attempts**: After 4 failed attempts, gives up and logs permanent disconnection
5. **Recovery**: If the punishment events server comes back online, manual restart or process restart would re-establish connection

## Existing Infrastructure Utilization
- **Event buffer**: Already handles DB persistence across restarts (lines 51-87 in src/events.mjs)
- **WebSocket server**: Already set up in `src/index.mjs` (lines 3368-3457)
- **Punishment event emission**: Already implemented via `createPunishmentEvents()` and `punishmentEvents.on('event', ...)` (lines 3372-3387 in src/index.mjs)
- **Stats aggregator**: Already processes events in real-time (lines 3386 in src/index.mjs)

## Diagram: Reconnection Workflow

```mermaid
flowchart TD
    A[WebSocket Connect] --> B{onopen?}
    B -- Yes --> C[reconnectAttempts = 0]
    B -- No --> D[onclose]
    D --> E{reconnectAttempts < 4?}
    E -- Yes --> F[calculateBackoffDelay(attempt)]
    F --> G[setTimeout(delay * 1000)]
    G --> H[reconnectAttempts++]
    H --> I[connectToPunishmentEvents()]
    I --> B
    E -- No --> J[Log permanent disconnection]
    J --> K[End]
    
    style A fill:#e3f2fd,stroke:#1976d2
    style B fill:#fff3e0,stroke:#fb8c00
    style C fill:#e8f5e9,stroke:#388e3c
    style D fill:#fff3e0,stroke:#fb8c00
    style E fill:#fff3e0,stroke:#fb8c00
    style F fill:#e3f2fd,stroke:#1976d2
    style G fill:#e3f2fd,stroke:#1976d2
    style H fill:#e3f2fd,stroke:#1976d2
    style I fill:#e3f2fd,stroke:#1976d2
    style J fill:#ffebee,stroke:#c62828
    style K fill:#f5f5f5,stroke:#616161
```

## Files Modified
- `src/events.mjs` - Add WebSocket reconnection logic

## No Changes Required
- `src/index.mjs` - Existing WebSocket setup and token validation remain unchanged
- `config/bandit.json` - No changes needed
- Database schema - No changes needed
- Existing event buffering - No changes needed

## Rollback Plan
If the reconnection logic causes issues, simply remove the `connectToPunishmentEvents()` call and the reconnection variables from `src/events.mjs`. The existing event buffer ensures no data loss during brief interruptions.

## Related Components
- `src/events.mjs` - Event buffering and punishment event emission (already read: 267 lines)
- `src/index.mjs` - WebSocket server setup and punishment events endpoint (already read: 3501 lines)
- `scripts/restart-safe.sh` - Service restart script (may need updating if WebSocket state needs clearing)