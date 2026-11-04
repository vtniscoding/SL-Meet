# `@sl-meet/shared`

Centralized shared workspace package for the SL-Meet monorepo, consumed by [`client`](../../client/README.md), [`admin`](../../admin/README.md), and Electron main processes.

Provides the **Single Source of Truth** for design tokens, icons, frameless window controls (`TitleBar`), Electron IPC channels, MediaPipe/DTW gesture recognition services, ASL grammar translation, Supabase client, and Socket.io connection management.

---

## Package Architecture

`@sl-meet/shared` uses a **single root barrel export** ([`src/index.js`](./src/index.js)) with concrete domain modules underneath (no nested child `index.js` barrels):

```text
packages/shared/
├── src/
│   ├── index.js                      # Sole barrel entry point for renderer-safe shared exports
│   ├── api/
│   │   └── client.js                 # REST helpers for dataset fetch, sample CRUD, and admin auth
│   ├── components/
│   │   └── TitleBar.jsx              # Shared Windows 11 frameless window controls (Minimize, Maximize, Close)
│   ├── constants/
│   │   └── roles.js                  # APP_ROLES, ROLES, ROLE_META, DEFAULT_PORTS, DTW_CONFIG, STORAGE_KEYS
│   ├── icons/
│   │   └── icons.js                  # Centralized Icon Registry (FontAwesome, Lucide, and custom SVGs)
│   ├── ipc/
│   │   ├── channels.js               # IPC channel constants (WINDOW, PIP, HAND_MOTION, APP)
│   │   └── windowControl.js          # Electron main-process IPC helper functions
│   ├── services/
│   │   ├── mediapipe.js              # Singleton MediaPipe Hands loader, ghost-hand filter, status pub/sub
│   │   ├── gestureClassifier.js      # 63D (1-hand) & 126D (2-hand) normalization, KNN classifier, Realtime sync
│   │   ├── dtwClassifier.js          # Sakoe-Chiba banded Dynamic Time Warping (DTW) sequence classifier
│   │   ├── handMotionTracker.js      # 60 FPS virtual camera bounding-box smoother & auto-follow zoom tracker
│   │   ├── landmarkSmoother.js       # Temporal EMA landmark stabilization
│   │   ├── aslTranslator.js          # Multi-sign N-gram phrase matcher & Supabase `asl_phrases` sync
│   │   ├── aslAggregator.js          # Sliding-window gesture aggregator and stability debouncer
│   │   └── socket.js                 # Singleton Socket.io client factory & URL management
│   ├── theme/
│   │   └── colors.js                 # Standardized Brand, Meeting Room, Dashboard, and Role color tokens
│   ├── types/
│   │   └── types.js                  # Shared JSDoc typedefs (UserProfile, RoomMember, GestureSample, CaptionEntry)
│   └── utils/
│       ├── sampleDescriptor.js       # Static vs. dynamic and 1-hand vs. 2-hand gesture sample inspector
│       └── supabase.js               # Singleton Supabase client initialization
├── tests/
│   ├── ipc-channels.test.mjs         # Electron IPC channel contract tests
│   ├── roles-and-constants.test.mjs  # Role validation, capability matrix, ports & DTW config tests
│   ├── sample-descriptor.test.mjs    # 63D, 126D, dynamic sequence & null-safety descriptor tests
│   └── theme-tokens.test.mjs         # Brand & Google Meet dark room color specification tests
└── package.json                      # Subpath exports map & shared dependencies
```

---

## Subpath Exports & Usage

Import from the root package `@sl-meet/shared` or via explicit subpath exports defined in [`package.json`](./package.json):

```javascript
// Root import (components, services, constants, utilities)
import {
  TitleBar,
  supabase,
  preloadMediaPipeHands,
  classifyGesture,
  fetchDatasetFromServer,
  initRealtimeDatasetSync,
} from '@sl-meet/shared';

// Subpath imports
import { brandColors, roomColors, dashboardColors } from '@sl-meet/shared/theme';
import { MicOnIcon, MicOffIcon, CameraOnIcon, VerifiedShieldIcon } from '@sl-meet/shared/icons';
import { ROLES, ROLE_META, DEFAULT_PORTS, DTW_CONFIG } from '@sl-meet/shared/constants';
import { WINDOW_CHANNELS, PIP_CHANNELS, HAND_MOTION_CHANNELS, APP_CHANNELS } from '@sl-meet/shared/ipc/channels';
import { getSampleDescriptor } from '@sl-meet/shared/utils';

// Electron IPC Channel Contract:
// Channel constants (`WINDOW_CHANNELS`, etc.) are imported cleanly in renderer & preload.
// Main processes (`client/electron/main.js`, `admin/electron/main.js`) listen on these channels natively to ensure bundle safety without external dependency resolution issues.
```

> **Tailwind CSS Note**: Consuming apps (`client` and `admin`) must include `"../packages/shared/src/**/*.{js,ts,jsx,tsx}"` in their `tailwind.config.js` `content` array so utility classes used by shared components (such as `TitleBar` hover/active states) are compiled.

---

## Standardized Design System (`src/theme/colors.js`)

SL-Meet enforces three visual surfaces across the platform:

| Group | Token | Hex | Purpose |
| :--- | :--- | :---: | :--- |
| **Brand** | `brandColors.primary` | `#5CA0F2` | Primary CTAs ("New", "Sign In", "Join"), active brand highlights |
| | `brandColors.hover` | `#4A8FE0` | Hover state for primary brand actions |
| | `brandColors.active` | `#3B7ECE` | Active/pressed brand state |
| | `brandColors.subtle` | `#EBF3FD` | Soft tint background for informational pills/chips |
| **Room / Studio** | `roomColors.bg` | `#000000` | Deep canvas background for Meeting Stage & Admin Studio |
| | `roomColors.surface` | `#202124` | Google Meet dark control bar, drawers, cards, and modals |
| | `roomColors.subtle` | `#28292C` | Popover menus and secondary elevated dark surfaces |
| | `roomColors.button` | `#3C4043` | Default inactive meeting control button |
| | `roomColors.buttonHover` | `#474B4F` | Hover state on dark control buttons |
| | `roomColors.active` | `#8AB4F8` | Active feature toggle (Captions ON, Screen Share ON) |
| | `roomColors.danger` | `#EA4335` | Muted mic/cam indicator, End Call, and destructive actions |
| **Dashboard / Lobby** | `dashboardColors.bg` | `#F8FAFC` | Clean light workspace background |
| | `dashboardColors.pillBg` | `#E9EEF6` | Meeting code input pill surface |
| | `dashboardColors.pillSubmit` | `#0B57D0` | "Join" submit CTA inside code pill |
| **Roles** | `roleColors.signer` | `#5CA0F2` | Signer participant badge |
| | `roleColors.speaker` | `#10B981` | Speaker / Non-Signer participant badge |

---

## Centralized Icon Registry (`src/icons/icons.js`)

All UI components across `client` and `admin` import icons from `@sl-meet/shared/icons` rather than directly from third-party icon packages. This guarantees uniform sizing (such as normalized `576x512` viewBoxes on Mic/Camera toggles to prevent layout shift) and single-line icon swaps.

Categories exported in [`src/icons/icons.js`](./src/icons/icons.js):
1. **Meeting Controls**: `MicOnIcon`, `MicOffIcon`, `CameraOnIcon`, `CameraOffIcon`, `ScreenShareIcon`, `EndCallIcon`, `PinIcon`, `UnpinIcon`, `ZoomSpeakerFillIcon`, `ZoomGalleryFillIcon`, `ZoomSideBySideFillIcon`, `CheckmarkIcon`
2. **AI & Vision**: `CaptionsIcon`, `HandTrackingOnIcon`, `HandTrackingOffIcon`, `SignGestureIcon`, `AiTranslateIcon`, `FocusTargetIcon`, `AiInspectorIcon`, `ProcessingCpuIcon`
3. **Navigation & Drawers**: `HomeNavIcon`, `ChatNavIcon`, `MeetingsNavIcon`, `SettingsNavIcon`, `ChatDrawerIcon`, `ParticipantsDrawerIcon`, `DownloadTranscriptIcon`, `BackNavIcon`
4. **Status & Security**: `LoadingSpinnerIcon`, `AlertWarningIcon`, `AlertErrorIcon`, `SuccessCheckIcon`, `VerifiedShieldIcon`, `HostShieldIcon`, `ModerationKickIcon`
5. **Brand & Partner Logos**: `GoogleLogoIcon`, `MediaPipeLogoIcon`, `TensorFlowLogoIcon` (precise official vector path), `ReactLogoIcon`, `PyTorchLogoIcon`, `HuggingFaceLogoIcon`, `OpenAILogoIcon`

---

## Testing

Run the granular `@sl-meet/shared` unit test suite (18 test cases):

```bash
npm --prefix packages/shared test
```
