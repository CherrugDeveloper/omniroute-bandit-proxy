import WebSocket from 'ws';

const WS_URL = 'ws://127.0.0.1:20128/v1/events/punishment';

console.log(`Connecting to ${WS_URL}...`);
const ws = new WebSocket(WS_URL);

ws.on('open', () => {
    console.log('Connected to punishment stream.');
});

ws.on('message', (data) => {
    try {
        const event = JSON.parse(data);
        console.log('Received punishment event:', JSON.stringify(event, null, 2));
    } catch (e) {
        console.error('Error parsing event:', e);
    }
});

ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
});

ws.on('close', () => {
    console.log('Connection closed.');
});
