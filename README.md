# 🚀 SL-Meet: AI Sign Language & Real-Time Meeting Platform

An ultra-modern, high-performance desktop application and real-time socket backend built with **Electron, React, Tailwind CSS (via Vite), MediaPipe AI Vision, and Render Socket Service**.

---

## 🛠 Tech Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Desktop App** | [Electron](https://www.electronjs.org/) | Cross-platform desktop runtime with context-isolated security |
| **Frontend UI** | [React 18](https://react.dev/) + [Vite](https://vitejs.dev/) | High-speed component rendering with modern JSX |
| **Styling** | [Tailwind CSS v3](https://tailwindcss.com/) | Modern glassmorphism UI design with rich dark mode |
| **AI / Computer Vision** | [MediaPipe Hands](https://mediapipe.dev/) | Real-time 21 3D hand landmarks detection & gesture classification |
| **Real-Time Service** | [Socket.io](https://socket.io/) + [Node.js](https://nodejs.org/) | WebSockets service configured for deployment on [Render](https://render.com/) |

---

## 📁 Project Architecture

```
SL-Meet/
├── client/                     # Electron + React + Vite + Tailwind CSS + MediaPipe
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── electron/
│   │   ├── main.js             # Electron main process
│   │   └── preload.js          # Context bridge script
│   └── src/
│       ├── main.jsx            # Entry point for React
│       ├── index.css           # Global Tailwind CSS & glassmorphism
│       ├── App.jsx             # Main dashboard UI component
│       ├── components/
│       │   ├── Navbar.jsx      # Header with telemetry & toggles
│       │   ├── VisionCamera.jsx# MediaPipe video & canvas landmark overlay
│       │   ├── SocketControls.jsx # Render Socket connection & room controls
│       │   └── GestureLog.jsx  # Real-time gesture stream & history
│       ├── services/
│       │   ├── mediapipe.js    # Vision pipeline & rule-based classifier
│       │   └── socket.js       # Socket.io client service
│       └── hooks/
│           ├── useMediaPipe.js # Custom hook for camera & hand tracking
│           └── useSocket.js    # Custom hook for Render socket lifecycle
├── server/                     # Socket Service Backend (Render ready)
│   ├── package.json
│   ├── server.js               # Express + Socket.io server
│   ├── render.yaml             # Render Blueprint configuration
│   └── .env.example
├── package.json                # Monorepo / Workspace root package.json
└── README.md
```

---

## ⚡ Quick Start

### 1. Install Dependencies

Install root workspace dependencies (this installs both `client` and `server` packages):

```bash
npm install
```

---

### 2. Running in Development Mode

#### Start Both Client & Server Concurrently:
```bash
npm run dev
```

#### Run Electron App (Vite + Electron):
```bash
npm run dev:electron
```

#### Run Socket Server Only (Local Port 4000):
```bash
npm run dev:server
```

---

## 🌐 Deploying Socket Service to Render

1. Push this repository to GitHub/GitLab.
2. Log into [Render Dashboard](https://dashboard.render.com/).
3. Click **New +** -> **Web Service**.
4. Connect your repository and choose the `reconstruct` branch.
5. Set the **Root Directory** to `server`.
6. Render will automatically detect `render.yaml` or you can configure:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/health`
7. Once deployed, copy your Render URL (e.g. `https://sl-meet-socket.onrender.com`) and update `VITE_SOCKET_URL` in `client/.env` or in the client UI input.

---

## 🤖 MediaPipe AI Vision Gestures Supported

- 🖐️ **Open Palm** (Xin Chào / Hello)
- 👍 **Thumbs Up** (Đồng Ý / Like)
- ✌️ **Victory / Peace** (V-Sign)
- 👌 **OK Sign** (Đồng Ý / Approved)
- ☝️ **Point Up** (Chú Ý / Point)
- 🤟 **I Love You** (Love Sign)
- ✊ **Fist** (Tạm Dừng / Stop)

---

## 🎙️ Speech-to-Text (STT) Anti-Hallucination Pipeline

SL-Meet features a high-fidelity, offline Speech-to-Text pipeline designed specifically for accessibility (subtitling vocal speech for `SIGNER` participants):

- **Model**: `onnx-community/whisper-base.en` (INT8 Quantized, pure CPU WASM SIMD).
- **VAD (Voice Activity Detection)**: Neural [Silero VAD](https://github.com/ricky0123/vad) running locally to reject ambient noise (fans, typing, background murmurs) before audio reaches Whisper.
- **Hardware DSP**: WebRTC microphone constraints enabled (`echoCancellation`, `noiseSuppression`, `autoGainControl`, `channelCount: 1`).
- **Multi-Track Mixer**: Seamlessly mixes live remote peer audio tracks into a unified 16kHz stream without physical speaker loopback.
- **Stabilized Final Subtitles**: Operates in zero-flicker Final-only presentation mode (`ENABLE_INTERIM: false`) to avoid confusing word mutations.
- **Structural Anti-Hallucination Guard**: Filters out repetitive n-gram loops, impossible words-per-second bursts, and YouTube subtitle artifacts.
- **Centralized Configuration**: Fine-tune VAD sensitivity, model selection, and debug logging in [`client/src/config/sttConfig.js`](file:///d:/SL-Meet/client/src/config/sttConfig.js).
- **Evaluation Baseline Matrix**: Acoustic testing benchmarks recorded in [`client/src/dev/BASELINE.md`](file:///d:/SL-Meet/client/src/dev/BASELINE.md).

---

## 📄 License

MIT License. Built for SL-Meet project setup.
