// Verify server health and API
// Uses native fetch (available in Node.js 18+)
import 'dotenv/config';

try {
  const token = process.env.DASHBOARD_TOKEN || 'YourSecureTokenHere';
  const res = await fetch('http://127.0.0.1:8080/v1/metrics', {
    headers: {
      'x-api-token': token
    }
  });
  console.log('Status:', res.status);
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    console.log('Metrics:', JSON.stringify(json, null, 2));
  } catch (e) {
    console.log('Body:', text.slice(0, 500));
  }
} catch (e) {
  console.log('Error:', e.message);
}
