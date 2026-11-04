# SL-Meet Admin Studio (`sl-meet-admin`)

Dedicated desktop and web studio for **ASL Data Labeling, Dataset Management, NLP Phrase Grammar Authoring, and 60 FPS AI Vision Monitoring**, built with **Electron 29, React 18, Vite 5, Tailwind CSS 3, MediaPipe Hands, and Supabase Realtime**.

---

## Architecture

`admin/src` serves as the reference **Feature-Sliced Architecture** for the monorepo:

```text
admin/
├── electron/
│   ├── main.js                       # Frameless dark studio BrowserWindow (#000000, port 5174, isolated native IPC)
│   └── preload.cjs                   # Context-isolated window control IPC bridge
└── src/
    ├── components/
    │   └── layouts/
    │       ├── MainLayout.jsx        # Root full-viewport dark frame (#000000)
    │       └── Navbar.jsx            # Draggable top bar with pill navigation & shared `TitleBar`
    ├── features/
    │   ├── index.js                  # Top-level barrel export for all admin features
    │   ├── auth/                     # Admin key verification (`AdminLoginModal`, `useAdminAuth`, `authService`)
    │   └── training/                 # Core AI training & dataset domain:
    │       ├── components/           # `TrainingStage` (60 FPS canvas + HUD) & `RecordingDeck`
    │       ├── hooks/                # `useTrainingCamera`, `useGestureRecording`, `useGestureDataset`
    │       ├── services/             # Supabase & server dataset synchronization (`datasetService`)
    │       └── utils/                # Hand skeleton connections, finger colors & 3D joint angle math (`landmarkConfig`)
    ├── pages/
    │   ├── Dashboard/                # Root studio coordinator (`DashboardPage`) managing tabs & shared hooks
    │   ├── DataLabelling/            # Live 1-hand/2-hand static & dynamic gesture capture workspace
    │   ├── Dataset/                  # Full-screen categorized sample grid, search/filter, rename, JSON import/export
    │   ├── Monitoring/               # 60 FPS MediaPipe landmark debugger, joint angles, finger states & latency HUD
    │   └── NLP/                      # 2-sign & 3-sign N-gram grammar rule builder synced to Supabase `asl_phrases`
    ├── App.jsx                       # Application root rendering `DashboardPage`
    └── main.jsx                      # React entry point
```

---

## Studio Workspaces

1. **Data Labeling**:
   - Supports **Static Postures** (63D single-hand / 126D unified dual-hand vectors) and **Dynamic Trajectories** (24-keyframe resampled DTW sequences).
   - 60 FPS auto-follow virtual camera zoom (`HandMotionCameraTracker`), smart countdown capture, conflict detection against existing labels, and live sentence preview.
2. **Dataset**:
   - Filterable grid of all gesture classes (`Static`, `Dynamic`, `1-Hand`, `2-Hand`), batch label renaming/deletion, individual sample pruning, and full JSON dataset backup/restore.
3. **Monitoring**:
   - Real-time 21-landmark 3D coordinate table, finger extension state analyzer, inter-joint angle telemetry, inference FPS/latency metrics, and pause/frame-inspect controls.
4. **Natural Language Processing (NLP)**:
   - Visual rule builder mapping 2 or 3 consecutive ASL tokens (e.g., `HELLO` + `NAME`) into natural target sentences, synchronized live to connected meeting clients via Supabase Realtime.

---

## Environment Variables (`admin/.env`)

Copy [`.env.example`](./.env.example) to `.env`:

```env
VITE_SOCKET_URL=http://localhost:4000
VITE_ADMIN_KEY=your-admin-secret
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

---

## Scripts

```bash
# Start Vite dev server in browser mode (http://localhost:5174)
npm --prefix admin run dev

# Start Vite + Electron frameless Admin Studio concurrently
npm --prefix admin run electron:dev

# Build production studio bundle
npm --prefix admin run build
```

