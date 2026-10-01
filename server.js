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

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const RTSP_URL = process.env.RTSP_URL || 'rtsp://admin:admin123@192.168.1.100:554/live';

app.use(express.static('public'));

app.get('/api/status', (req, res) => {
  res.json({
    status: 'ONLINE',
    stream: RTSP_URL,
    clients: wss.clients.size,
    author: 'Eng. MHD. Shadi AL-Hasan'
  });
});

wss.on('connection', (ws) => {
  console.log('[+] Client connected to live stream socket.');

  // Transcode RTSP into MPEG1/H.264 stream for low latency browser playback
  const ffmpeg = spawn('ffmpeg', [
    '-rtsp_transport', 'tcp',
    '-i', RTSP_URL,
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

  ffmpeg.stderr.on('data', (d) => {
    // console.log(`ffmpeg: ${d}`);
  });

  ws.on('close', () => {
    console.log('[-] Client disconnected. Killing transcode worker.');
    ffmpeg.kill();
  });
});

server.listen(PORT, () => {
  console.log(`[+] RTSP Gateway running on http://localhost:${PORT}`);
});
