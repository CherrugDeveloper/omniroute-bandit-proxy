import http from 'node:http';
import { spawn } from 'node:child_process';
import assert from 'node:assert';

async function main() {
  // 1. Start mock upstream server on ephemeral port (0)
  const upstreamServer = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/v1/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        data: [
          {
            id: 'mistral/mistral-small-latest',
            provider: 'mistral',
            max_input_tokens: 32000,
            is_free: 1,
            supports_tools: 1
          }
        ]
      }));
    } else if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: 'chatcmpl-mock',
          object: 'chat.completion',
          created: Date.now(),
          model: 'mistral/mistral-small-latest',
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello from mock upstream!'
            },
            finish_reason: 'stop'
          }],
          usage: { prompt_tokens: 5, completion_tokens: 6, total_tokens: 11 }
        }));
      });
    } else {
      res.writeHead(404);
      res.end('Not found: ' + req.method + ' ' + req.url);
    }
  });

  await new Promise(resolve => upstreamServer.listen(0, '127.0.0.1', resolve));
  const upstreamPort = upstreamServer.address().port;
  const upstreamUrl = `http://127.0.0.1:${upstreamPort}/v1`;
  console.log(`[TEST] Mock upstream running on ${upstreamUrl}`);

  // 2. Start proxy server in background
  const proxyProcess = spawn('npm', ['start'], {
    env: { ...process.env, PORT: '8081', OMNIROUTE_BASE_URL: upstreamUrl, HEALTH_CHECK_ENABLED: 'false' },
    stdio: 'inherit'
  });

  // Wait for proxy to start and sync models
  await new Promise(resolve => setTimeout(resolve, 3500));

  try {
    console.log('[TEST] Sending POST /v1/chat/completions to proxy on http://127.0.0.1:8081...');
    const response = await fetch('http://127.0.0.1:8081/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'mistral/mistral-small-latest',
        messages: [{ role: 'user', content: 'Hello proxy!' }]
      })
    });

    console.log('[TEST] Response status:', response.status);
    assert.equal(response.status, 200, 'Expected status 200 OK');

    const data = await response.json();
    console.log('[TEST] Response body:', JSON.stringify(data, null, 2));
    assert.ok(data.choices && data.choices.length > 0, 'Expected choices in response');
    assert.equal(data.choices[0].message.content, 'Hello from mock upstream!');

    console.log('[TEST] SUCCESS: Final verification request completed successfully!');
  } finally {
    proxyProcess.kill();
    upstreamServer.close();
  }
}

main().catch(err => {
  console.error('[TEST] ERROR:', err);
  process.exit(1);
});
