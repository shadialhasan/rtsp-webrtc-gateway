# 📹 rtsp-webrtc-gateway

[![Release](https://img.shields.io/badge/Release-v1.0.0-blue.svg)](https://github.com/MobileConduit/rtsp-webrtc-gateway/releases/tag/v1.0.0)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org)
[![Protocol: RTSP -> Web](https://img.shields.io/badge/Protocol-RTSP%20%7C%20WebSocket-orange.svg)](https://github.com/MobileConduit)
[![CI Pipeline](https://github.com/MobileConduit/rtsp-webrtc-gateway/actions/workflows/ci.yml/badge.svg)](https://github.com/MobileConduit/rtsp-webrtc-gateway/actions)

Ultra-low-latency RTSP-to-Browser streaming bridge. Bridges corporate CCTV / surveillance cameras to web browser interfaces using WebSocket streaming and hardware-friendly transcode pipelines without requiring plugin software or cloud vendor lock-in.

---

## 🏗️ Streaming Bridge Architecture

```mermaid
sequenceDiagram
    autonumber
    actor Browser as Client Web Browser
    participant Gateway as RTSP Gateway (Express + WS)
    participant FFmpeg as FFmpeg Transcoding Worker
    participant Camera as RTSP CCTV Camera (H.264)
    
    Browser->>Gateway: HTTP GET / (Load Video Player)
    Gateway-->>Browser: HTML5 Player with WebSocket Client
    Browser->>Gateway: WS Connect /live-stream
    Gateway->>Gateway: Enforce IP Connection Quotas
    Gateway->>FFmpeg: Spawn transcode pipeline (MPEG-TS/WebSocket)
    FFmpeg->>Camera: RTSP TCP Interleaved Feed
    Camera-->>FFmpeg: Raw H.264/AAC Stream
    FFmpeg-->>Gateway: Remuxed MPEGTS Buffer Chunks
    Gateway-->>Browser: Binary WebSocket Stream
    Browser->>Browser: Render on HTML5 Canvas (JSMpeg)
```

---

## 📋 Prerequisites
- **Node.js**: v18.0.0 or higher
- **FFmpeg**: Installed and accessible in system `PATH` (for live transcoding)

---

## ⚙️ Installation & Setup

1. **Clone repository**:
   ```bash
   git clone https://github.com/MobileConduit/rtsp-webrtc-gateway.git
   cd rtsp-webrtc-gateway
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env
   ```

---

## 🚀 Usage & Instructions

1. **Start the Gateway**:
   ```bash
   export RTSP_URL="rtsp://admin:password@192.168.1.100:554/live"
   npm start
   ```

2. **Open in Web Browser**:
   Navigate to `http://localhost:3000` to view the live video player.

3. **Query Health & Status API**:
   ```bash
   curl http://localhost:3000/api/status
   ```
   **Output:**
   ```json
   {
     "status": "ONLINE",
     "stream": "rtsp://camera.internal/live",
     "clients": 2,
     "author": "Eng. MHD. Shadi AL-Hasan"
   }
   ```

---

## 🧪 Running Automated Tests

Run the native Node.js test suite verifying security headers, connection quotas, and WebSocket lifecycles:

```bash
npm test
```

---

## ⚙️ Configuration (.env)

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP & WebSocket server port | `3000` |
| `RTSP_URL` | Upstream RTSP camera feed URL | `rtsp://admin:admin123@192.168.1.100:554/live` |
| `MAX_CLIENTS_PER_IP` | Connection quota per remote IP | `5` |
| `VIDEO_BITRATE` | Video transcoding bitrate | `1000k` |

---

## 👤 Author & Maintainer

**Eng. MHD. Shadi AL-Hasan**  
- **Role:** Executive CTO & Enterprise Solutions Architect  
- **Email:** [mhd.shadi.alhasan@gmail.com](mailto:mhd.shadi.alhasan@gmail.com)  
- **Phone / WhatsApp:** [+963934005922](tel:+963934005922)  
- **Location:** Damascus, Syria  
- **GitHub:** [MobileConduit](https://github.com/MobileConduit)  

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.  
Copyright (c) 2026 **MHD. Shadi AL-Hasan**. All rights reserved.
