/**
 * RTSP to WebRTC/WebSocket Video Gateway
 * Author: Eng. MHD. Shadi AL-Hasan <mhd.shadi.alhasan@gmail.com>
 * Phone: +963934005922
 * Copyright (c) 2026 MHD. Shadi AL-Hasan
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');

// Rate Limiting Presets
const RATE_LIMIT_PRESETS = {
  strict: {
    rpm: 30,
    maxWsPerIp: 2,
    maxTotalWs: 10,
    windowMs: 60 * 1000
  },
  standard: {
    rpm: 120,
    maxWsPerIp: 5,
    maxTotalWs: 30,
    windowMs: 60 * 1000
  },
  relaxed: {
    rpm: 300,
    maxWsPerIp: 20,
    maxTotalWs: 100,
    windowMs: 60 * 1000
  }
};

// Production Security Headers
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'; connect-src 'self' ws: wss:; media-src 'self' blob:; img-src 'self' data:; style-src 'self' 'unsafe-inline'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cache-Control': 'no-store, no-cache, must-revalidate'
};

function createGateway(options = {}) {
  const app = express();
  const server = http.createServer(app);

  const presetName = options.rateLimitPreset || process.env.RATE_LIMIT_PRESET || 'standard';
  const preset = RATE_LIMIT_PRESETS[presetName] || RATE_LIMIT_PRESETS.standard;
  const rtspUrl = options.rtspUrl || process.env.RTSP_URL || 'rtsp://admin:admin123@192.168.1.100:554/live';
  const enableMockStream = options.enableMockStream ?? (process.env.ENABLE_MOCK_STREAM === 'true');

  // Rate Limiting state
  const ipHttpHistory = new Map(); // ip -> array of timestamps
  const ipWsCount = new Map();     // ip -> count of active sockets

  // Apply Security Headers Middleware
  app.use((req, res, next) => {
    for (const [header, val] of Object.entries(SECURITY_HEADERS)) {
      res.setHeader(header, val);
    }
    next();
  });

  // HTTP Rate Limiting Middleware
  app.use((req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
    const now = Date.now();
    const cutoff = now - preset.windowMs;

    let timestamps = ipHttpHistory.get(ip) || [];
    timestamps = timestamps.filter((t) => t > cutoff);

    if (timestamps.length >= preset.rpm) {
      const retryAfter = Math.ceil((preset.windowMs - (now - timestamps[0])) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `HTTP Rate limit exceeded (${preset.rpm} req/min).`,
        retryAfter
      });
    }

    timestamps.push(now);
    ipHttpHistory.set(ip, timestamps);
    next();
  });

  app.use(express.static('public'));

  // Metrics and status endpoint
  app.get('/api/status', (req, res) => {
    res.json({
      status: 'ONLINE',
      stream: rtspUrl,
      clients: wss.clients.size,
      activePreset: presetName,
      maxClients: preset.maxTotalWs,
      author: 'Eng. MHD. Shadi AL-Hasan'
    });
  });

  // WebSocket Server with connection quota validation
  const wss = new WebSocket.Server({
    server,
    verifyClient: (info, callback) => {
      const ip = info.req.socket.remoteAddress || '127.0.0.1';
      const currentActive = wss.clients.size;
      const currentPerIp = ipWsCount.get(ip) || 0;

      if (currentActive >= preset.maxTotalWs) {
        return callback(false, 503, 'Server WebSocket capacity reached');
      }

      if (currentPerIp >= preset.maxWsPerIp) {
        return callback(false, 429, `Max concurrent streams per client reached (${preset.maxWsPerIp})`);
      }

      callback(true);
    }
  });

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress || '127.0.0.1';
    const current = ipWsCount.get(ip) || 0;
    ipWsCount.set(ip, current + 1);

    console.log(`[+] Client connected from ${ip}. Total clients: ${wss.clients.size}`);

    let ffmpeg = null;
    let mockInterval = null;

    if (enableMockStream) {
      // Mock MPEG-TS video packet generator for tests and camera-less environments
      mockInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          const mockFrame = Buffer.alloc(188, 0x47); // Standard MPEG-TS 188-byte packet header
          mockFrame.write('RTSP_STREAM_CHUNK', 4);
          ws.send(mockFrame);
        }
      }, 100);
    } else {
      // Transcode RTSP into MPEG1/H.264 stream for low latency browser playback
      try {
        ffmpeg = spawn('ffmpeg', [
          '-rtsp_transport', 'tcp',
          '-i', rtspUrl,
          '-f', 'mpegts',
          '-codec:v', 'mpeg1video',
          '-b:v', '1000k',
          '-bf', '0',
          '-codec:a', 'mp2',
          '-ar', '44100',
          '-ac', '1',
          '-b:a', '128k',
          '-'
        ]);

        ffmpeg.stdout.on('data', (data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        });

        ffmpeg.stderr.on('data', () => {});
        ffmpeg.on('error', (err) => {
          console.warn(`[!] FFmpeg spawn warning: ${err.message}`);
        });
      } catch (err) {
        console.warn(`[!] Failed to spawn ffmpeg: ${err.message}`);
      }
    }

    ws.on('close', () => {
      const active = ipWsCount.get(ip) || 1;
      if (active <= 1) {
        ipWsCount.delete(ip);
      } else {
        ipWsCount.set(ip, active - 1);
      }

      console.log(`[-] Client disconnected from ${ip}. Remaining: ${wss.clients.size}`);
      if (mockInterval) clearInterval(mockInterval);
      if (ffmpeg) {
        try {
          ffmpeg.kill('SIGTERM');
        } catch (_) {}
      }
    });

    ws.on('error', () => {
      if (mockInterval) clearInterval(mockInterval);
      if (ffmpeg) {
        try {
          ffmpeg.kill('SIGTERM');
        } catch (_) {}
      }
    });
  });

  return { app, server, wss, preset };
}

// Standalone execution entrypoint
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  const { server } = createGateway();
  server.listen(PORT, () => {
    console.log(`[+] RTSP Gateway running on http://localhost:${PORT}`);
  });
}

module.exports = {
  createGateway,
  RATE_LIMIT_PRESETS,
  SECURITY_HEADERS
};
