# SL-Meet Client (`sl-meet-client`)

End-user desktop and web video conferencing application for **SL-Meet**, built with **Electron 29, React 18, Vite 5, Tailwind CSS 3, WebRTC, MediaPipe Hands, and ONNX Whisper STT**.

---

## Architecture

`client/src` follows a **Feature-Sliced Architecture** aligned with `admin`, separating top-level views (`pages/`) from domain logic (`features/`):

```text
client/
├── electron/
│   ├── main.js                       # Frameless main window, isolated native IPC window controls, PiP mode, companion windows
│   └── preload.cjs                   # Secure contextBridge exposing `window.electronAPI`
├── public/
│   ├── assets/icons/                 # Desktop window & installer icons (.ico, .png)
│   └── vad/                          # Local Silero VAD v5/v6 ONNX models & ONNX Runtime SIMD WASM binaries
├── src/
│   ├── assets/                       # Brand logo, Open Sans/Inter fonts, Andy Note illustration, hero video
│   ├── features/
│   │   ├── index.js                  # Top-level barrel export for all client features
│   │   ├── auth/                     # Supabase AuthContext, AuthModal, ProfileAvatarMenu
│   │   ├── dashboard/                # Saved room history hook (`useRoomHistory`) & `RoomHistoryCard`
│   │   └── room/                     # Core meeting engine:
│   │       ├── components/           # Subdirectory-organized meeting UI:
│   │       │   ├── captions/         # CaptionDock, SpeechLane, AslStrip, Settings, History, Footer
│   │       │   ├── common/           # ErrorBoundary
│   │       │   ├── controls/         # MeetingControlBar, CommunicationModePicker
│   │       │   ├── drawers/          # MeetingChatDrawer, MeetingParticipantsDrawer
│   │       │   ├── lobby/            # LobbyToolsCheck
│   │       │   ├── modals/           # MeetingConfirmModal
│   │       │   ├── overlays/         # HandMotionWindow, MeetingPipView, AslSubtitleOverlay
│   │       │   └── video/            # MeetingLayoutEngine, MeetingVideoTile, ParticipantAvatar
│   │       ├── config/               # STT (`sttConfig.js`) & Caption Dock (`captionConfig.js`) parameters
│   │       ├── hooks/                # WebRTC, Socket, LocalMedia, ScreenShare, SpeechToText,
│   │       │                         # HandTrackingWorker, CaptionFeed, RoomModeration
│   │       ├── services/             # Remote audio mixer, IndexedDB model cache, Whisper Worker manager
│   │       ├── utils/                # Caption calculations (`captionUtils.js`) & session transcript exporter
│   │       └── workers/              # Dedicated Web Worker (`whisperWorker.js`) running quantized `whisper-base.en`
│   ├── pages/
│   │   ├── Home/                     # Desktop landing view with interactive WaveRibbon background canvas, infinite partner logo carousel, hero video, join modal
│   │   ├── Dashboard/                # Authenticated workspace, room creation, code entry pill, room history
│   │   ├── Lobby/                    # Camera/Mic/Speaker check, AI readiness check, communication role selection
│   │   └── Room/                     # Live Google Meet-style dark room (#202124) with SLT/STT dual captions
│   ├── App.jsx                       # Asset preloader & view state router
│   └── main.jsx                      # React root
└── tests/
    ├── caption-utils.test.mjs        # Sender palette, caption dwell timing, interim/final merge & FIFO eviction
    ├── gesture-classifier.test.mjs   # 63D/126D landmark normalization & nearest-neighbor matching
    └── room-history.test.mjs         # Room history CRUD, custom title preservation, and recency ordering
```

---

## Key Capabilities

- **Interactive Landing Surface**: High-performance mathematical wave ribbon canvas (`WaveRibbonBackground`) with mouse-reactive dynamics and fluid animation, paired with an infinite continuous marquee carousel (`InfinityLogoCarousel`) with normalized partner logo vectors.
- **Role-Based Accessibility**: Participants join as either `SIGNER` (enables 60 FPS MediaPipe hand tracking + receives live speech subtitles) or `NON_SIGNER` (streams vocal speech subtitles to signers + receives translated ASL sentences).
- **Zero-Lag Detached Hand Motion Window**: Signers can pop out an always-on-top OS companion window (`HandMotionWindow`) with 60 FPS auto-follow bounding-box zoom while viewing shared screens or presentations.
- **Native Picture-in-Picture (PiP)**: Minimizing an active call transitions the frameless Electron window into a compact floating PiP overlay.
- **Anti-Hallucination Offline Speech-to-Text**:
  - **Model**: `onnx-community/whisper-base.en` (INT8 quantized, CPU WASM SIMD inside a dedicated Web Worker).
  - **Neural Gating**: Local Silero VAD filters out typing, fan hum, and silence before audio frames reach Whisper.
  - **Multi-Peer Audio Mixing**: Mixes remote WebRTC audio tracks into a clean 16 kHz mono stream without acoustic speaker feedback.
- **Bundle-Safe Native Window Controls**: Dedicated Electron main-process IPC handlers directly manage frameless window operations (`WINDOW_CHANNELS`), ensuring isolated, bundle-safe execution across development and production installers.

---

## Environment Variables (`client/.env`)

Copy [`.env.example`](./.env.example) to `.env`:

```env
VITE_SOCKET_URL=http://localhost:4000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

---

## Scripts

```bash
# Start Vite dev server only (http://localhost:5173)
npm --prefix client run dev

# Start Vite + Electron desktop window concurrently
npm --prefix client run electron:dev

# Run unit tests (17 test cases)
npm --prefix client test

# Build production web assets
npm --prefix client run build

# Package Windows NSIS installer / unpacked desktop app (output in ../release)
npm --prefix client run electron:build
npm --prefix client run electron:pack
```

