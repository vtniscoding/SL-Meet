/**
 * @sl-meet/shared - Shared library for SL-Meet monorepo
 * Single Source of Truth for Design Tokens, Icons, AI Vision Services, Utilities, and API
 */

// Types
export * from './types/types.js';

// Constants
export * from './constants/roles.js';
export * from './constants/featureFlags.js';

// Theme
export * from './theme/colors.js';

// Icons
export * from './icons/icons.js';

// Utils
export * from './utils/supabase.js';
export * from './utils/sampleDescriptor.js';
export * from './utils/semver.js';

// API
export * from './api/client.js';

// Services
export * from './services/mediapipe.js';
export * from './services/faceTracker.js';
export * from './services/gestureClassifier.js';
export * from './services/dtwClassifier.js';
export * from './services/handMotionTracker.js';
export * from './services/landmarkSmoother.js';
export * from './services/aslTranslator.js';
export * from './services/aslAggregator.js';
export * from './services/socket.js';

// Components
export { default as TitleBar } from './components/TitleBar.jsx';

// IPC Channels (safe for renderer export)
export {
  WINDOW_CHANNELS,
  PIP_CHANNELS,
  HAND_MOTION_CHANNELS,
  APP_CHANNELS,
} from './ipc/channels.js';
