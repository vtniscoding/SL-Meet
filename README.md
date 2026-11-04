# SL-Meet: AI Sign Language & Real-Time Video Conferencing Platform

SL-Meet is a real-time video conferencing and accessibility platform built as an npm monorepo with **Electron, React 18, Vite, Tailwind CSS, MediaPipe Hands, ONNX Whisper Speech-to-Text, Silero Neural VAD, Supabase, and Socket.io**.

It bridges communication between Deaf/Hard-of-Hearing signers (`SIGNER`) and vocal speakers (`NON_SIGNER`) through real-time two-way AI interpretation:
- **Sign-to-Text (SLT)**: 60 FPS single-hand (63D), dual-hand (126D), and dynamic DTW trajectory recognition with N-gram ASL phrase translation.
- **Speech-to-Text (STT)**: Offline, privacy-preserving `whisper-base.en` (INT8 WASM SIMD) gated by local Silero Neural VAD with anti-hallucination filtering.

---

## Monorepo Workspaces

| Workspace | Path | Default Port | Description |
| :--- | :--- | :---: | :--- |
| **Client App** | [`client/`](./client/README.md) | `5173` | Electron & Web video conferencing app (Home, Dashboard, Lobby, Meeting Room, PiP, Companion Hand-Motion Window) |
| **Admin Studio** | [`admin/`](./admin/README.md) | `5174` | Dedicated Electron & Web studio for ASL Data Labeling, Dataset Management, NLP Phrase Rules, and 60 FPS Vision Monitoring |
| **Shared Library** | [`packages/shared/`](./packages/shared/README.md) | — | Single source of truth for Design Tokens, Icon Registry, Frameless `TitleBar`, Electron IPC channels, MediaPipe/DTW Classifiers, and Supabase/Socket clients |
| **Signaling Server** | [`server/`](./server/README.md) | `4000` | Express + Socket.io signaling, room moderation, host transfer, and dataset distribution backend (Render-ready) |

---

## Tech Stack

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Desktop Runtime** | Electron 29 | Frameless native Windows 11 shell, Picture-in-Picture (PiP), and multi-window IPC |
| **Frontend UI** | React 18 + Vite 5 + Tailwind CSS 3 | Feature-sliced component architecture with shared design tokens |
| **AI Computer Vision** | MediaPipe Hands + Custom KNN/DTW | 21-point 3D hand landmark extraction, 1-hand/2-hand static & dynamic gesture classification |
| **Offline Speech AI** | Transformers.js (`whisper-base.en`) + Silero VAD | Local Web Worker STT with neural voice activity gating and remote WebRTC audio mixing |
| **Auth & Realtime DB** | Supabase (Auth, Postgres, Realtime) | User authentication, active room verification, and live `asl_gestures` / `asl_phrases` sync |
| **Signaling & Rooms** | Node.js + Express + Socket.io 4 | WebRTC P2P mesh signaling, room state, chat, captions relay, and host moderation |

---

## Project Structure

```text
SL-Meet/
├── client/                         # End-user Meeting Application (Electron + React)
│   ├── electron/
│   │   ├── main.js                 # Main process (Frameless window, native isolated IPC, PiP mode, companion windows)
│   │   └── preload.cjs             # Context-isolated preload bridge (window.electronAPI)
│   ├── public/                     # Static assets, app icons, MediaPipe & Silero VAD ONNX/WASM files
│   ├── src/
│   │   ├── assets/                 # Brand logos, fonts, Andy Note illustration, and hero video assets
│   │   ├── features/
│   │   │   ├── index.js            # Top-level barrel export for all client features
│   │   │   ├── auth/               # Supabase AuthContext, AuthModal, ProfileAvatarMenu
│   │   │   ├── dashboard/          # RoomHistoryCard, useRoomHistory
│   │   │   └── room/               # WebRTC, Socket, Whisper STT Worker, Captions Dock, Layout Engine (8 component modules)
│   │   ├── pages/                  # Route views: Home (WaveRibbon, Logo Carousel), Dashboard, Lobby, Room
│   │   ├── App.jsx                 # Application shell & view router
│   │   └── main.jsx                # React entry point
│   └── tests/                      # Unit tests (caption-utils, gesture-classifier, room-history)
│
├── admin/                          # AI Model Training & Vision Monitoring Studio (Electron + React)
│   ├── electron/
│   │   ├── main.js                 # Frameless dark studio window (#000000, native isolated IPC)
│   │   └── preload.cjs             # Context-isolated window control bridge
│   └── src/
│       ├── components/layouts/     # MainLayout & pill-based frameless Navbar
│       ├── features/
│       │   ├── index.js            # Top-level barrel export for all admin features
│       │   ├── auth/               # AdminLoginModal, useAdminAuth, authService
│       │   └── training/           # TrainingStage, RecordingDeck, camera/recording/dataset/aggregator hooks
│       ├── pages/                  # Views: Dashboard, DataLabelling, Dataset, Monitoring, NLP
│       ├── App.jsx                 # Studio root entry
│       └── main.jsx                # React entry point
│
├── packages/
│   └── shared/                     # @sl-meet/shared workspace package
│       ├── src/
│       │   ├── api/                # Admin & dataset REST API client
│       │   ├── components/         # Shared frameless Windows 11 TitleBar
│       │   ├── constants/          # Roles (SIGNER/NON_SIGNER), ports, DTW constants
│       │   ├── icons/              # Centralized Icon Registry (FontAwesome + Lucide + Brand/Partner SVGs)
│       │   ├── ipc/                # Electron IPC channel constants (WINDOW, PIP, HAND_MOTION, APP)
│       │   ├── services/           # MediaPipe, Static/DTW classifiers, Landmark smoother, ASL translator, Socket
│       │   ├── theme/              # Standardized brand, room, dashboard, and role color tokens
│       │   ├── types/              # Shared JSDoc typedefs
│       │   ├── utils/              # Supabase client & gesture sample descriptor utility
│       │   └── index.js            # Single root barrel export
│       └── tests/                  # Unit tests (theme-tokens, roles-and-constants, ipc-channels, sample-descriptor)
│
├── server/                         # WebRTC Signaling & Admin Dataset Server
│   ├── server.js                   # Express REST endpoints + Socket.io room & signaling handlers
│   ├── render.yaml                 # Render deployment blueprint
│   └── tests/                      # Security & room authorization unit tests (room-security)
│
└── package.json                    # Monorepo workspace configuration & root scripts
```

---

## Quick Start

### 1. Prerequisites
- **Node.js** `>= 18.0.0`
- **npm** `>= 9.0.0` (with npm workspaces support)

### 2. Install Dependencies
Run once from the repository root to install dependencies across all workspaces (`client`, `admin`, `server`, `packages/shared`):

```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env` in each workspace and populate your credentials:

- **`client/.env`**:
  ```env
  VITE_SOCKET_URL=http://localhost:4000
  VITE_SUPABASE_URL=https://your-project.supabase.co
  VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-or-publishable-key
  ```
- **`admin/.env`**:
  ```env
  VITE_SOCKET_URL=http://localhost:4000
  VITE_ADMIN_KEY=your-admin-secret
  VITE_SUPABASE_URL=https://your-project.supabase.co
  VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-or-publishable-key
  ```
- **`server/.env`**:
  ```env
  PORT=4000
  ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
  ADMIN_SECRET=your-admin-secret
  ```

### 4. Run in Development

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start Socket Server (`:4000`) + Client Electron App (`:5173`) concurrently |
| `npm run admin` | Start Socket Server (`:4000`) + Admin Studio Electron App (`:5174`) concurrently |
| `npm run client` | Start Client Electron App (`:5173`) standalone |
| `npm run dev:client` | Start Client Vite dev server in browser mode (`http://localhost:5173`) |
| `npm run dev:admin` | Start Admin Vite dev server in browser mode (`http://localhost:5174`) |
| `npm run dev:server` | Start Express + Socket.io signaling server (`http://localhost:4000`) |

---

## Building & Packaging

```bash
# Build production frontend bundles
npm run build:client
npm run build:admin

# Package Windows Desktop Application (NSIS installer / unpacked directory)
npm run dist
npm run pack
```

---

## Testing

The monorepo uses Node's built-in test runner (`node --test`) across `client`, `server`, and `packages/shared`:

```bash
# Run all 39 unit tests across the entire monorepo
npm test

# Run tests per workspace
npm run test:client
npm run test:server
npm run test:shared
```

---

## Deploying Signaling Server to Render

1. Push the repository to GitHub or GitLab.
2. In the [Render Dashboard](https://dashboard.render.com/), create a new **Web Service** pointing to the `server` root directory (or use [`server/render.yaml`](./server/render.yaml)).
3. Configure:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/health`
   - **Environment Variables**: `NODE_ENV=production`, `ADMIN_SECRET`, and `ALLOWED_ORIGINS`.
4. Set `VITE_SOCKET_URL` in `client/.env` and `admin/.env` to your deployed Render URL.

---

## Workspace Documentation

- [Client Application (`client/README.md`)](./client/README.md)
- [Admin Training & Monitoring Studio (`admin/README.md`)](./admin/README.md)
- [Shared Library & Design System (`packages/shared/README.md`)](./packages/shared/README.md)
- [Signaling & Dataset Server (`server/README.md`)](./server/README.md)

---

## License

MIT License.
