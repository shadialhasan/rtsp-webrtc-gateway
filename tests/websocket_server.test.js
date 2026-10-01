/**
 * Automated Unit Tests for RTSP WebRTC / WebSocket Gateway
 * Author: Eng. MHD. Shadi AL-Hasan <mhd.shadi.alhasan@gmail.com>
 */

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const WebSocket = require('ws');

const { createGateway, RATE_LIMIT_PRESETS, SECURITY_HEADERS } = require('../server');

function makeHttpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

test('RTSP Gateway - Security Headers and Status Endpoint', async () => {
  const { server } = createGateway({ enableMockStream: true });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const res = await makeHttpRequest(`http://127.0.0.1:${port}/api/status`);
    assert.strictEqual(res.statusCode, 200);

    // Verify Security Headers
    assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(res.headers['x-frame-options'], 'SAMEORIGIN');
    assert.match(res.headers['strict-transport-security'], /max-age=31536000/);
    assert.match(res.headers['content-security-policy'], /default-src 'self'/);

    // Verify Payload Body
    const json = JSON.parse(res.body);
    assert.strictEqual(json.status, 'ONLINE');
    assert.strictEqual(json.clients, 0);
    assert.strictEqual(json.author, 'Eng. MHD. Shadi AL-Hasan');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('RTSP Gateway - Rate Limiting Presets on HTTP', async () => {
  const { server } = createGateway({ rateLimitPreset: 'strict' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    // 'strict' allows 30 requests per minute
    let lastStatus = 200;
    for (let i = 0; i < 35; i++) {
      const res = await makeHttpRequest(`http://127.0.0.1:${port}/api/status`);
      lastStatus = res.statusCode;
      if (res.statusCode === 429) {
        assert.strictEqual(res.statusCode, 429);
        const body = JSON.parse(res.body);
        assert.strictEqual(body.error, 'Too Many Requests');
        break;
      }
    }
    assert.strictEqual(lastStatus, 429, 'Expected request beyond rate limit to return 429');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('RTSP Gateway - WebSocket Streaming and Connection Lifecycle', async () => {
  const { server, wss } = createGateway({ enableMockStream: true });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);

    // Wait for connection open
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    assert.strictEqual(wss.clients.size, 1);

    // Receive at least one stream packet
    const receivedPacket = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for WS packet')), 3000);
      ws.on('message', (data) => {
        clearTimeout(timeout);
        resolve(data);
      });
    });

    assert(Buffer.isBuffer(receivedPacket));
    assert(receivedPacket.length >= 188); // MPEG-TS packet size

    // Close connection and verify cleanup
    ws.close();
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.strictEqual(wss.clients.size, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('RTSP Gateway - WebSocket Per-IP Connection Quota Enforcement', async () => {
  const { server } = createGateway({ rateLimitPreset: 'strict' }); // maxWsPerIp: 2
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const sockets = [];
  try {
    // Open 2 valid connections (within quota)
    for (let i = 0; i < 2; i++) {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
      });
      sockets.push(ws);
    }

    // Attempt 3rd connection (should be rejected with 429)
    let rejected = false;
    const ws3 = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((resolve) => {
      ws3.on('error', (err) => {
        assert.match(err.message, /429/);
        rejected = true;
        resolve();
      });
      ws3.on('open', () => {
        sockets.push(ws3);
        resolve();
      });
    });

    assert.strictEqual(rejected, true, '3rd concurrent WS connection from same IP should be rejected');
  } finally {
    sockets.forEach((s) => {
      try { s.close(); } catch (_) {}
    });
    await new Promise((resolve) => server.close(resolve));
  }
});
