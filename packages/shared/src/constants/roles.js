/**
 * Shared Application Constants across Client, Admin, and Server
 */

export const APP_ROLES = {
  SIGNER: 'signer',
  SPEAKER: 'speaker',
};

/**
 * Meeting Participant Roles and Capabilities
 */
export const ROLES = Object.freeze({
  SIGNER: 'signer',
  NON_SIGNER: 'non_signer',
});

export const ROLE_META = Object.freeze({
  [ROLES.SIGNER]: {
    id: ROLES.SIGNER,
    label: 'Sign language user',
    shortLabel: 'Signer',
    badgeText: 'Signer',
    iconName: 'Hand',
    description: 'Use camera for sign detection and read live captions of speech.',
    canSign: true,
    canSpeechToText: true,
    receivesSpeechCaptions: true,
  },
  [ROLES.NON_SIGNER]: {
    id: ROLES.NON_SIGNER,
    label: 'Standard user',
    shortLabel: 'Standard',
    badgeText: 'Speaker',
    iconName: 'Mic',
    description: 'Use microphone to speak, read sign translations and live speech captions.',
    canSign: false,
    canSpeechToText: true,
    receivesSpeechCaptions: true,
  },
});

export function isValidRole(role) {
  return role === ROLES.SIGNER || role === ROLES.NON_SIGNER;
}

export function sanitizeRole(role, fallback = ROLES.NON_SIGNER) {
  if (isValidRole(role)) return role;
  return fallback;
}

export const DEFAULT_PORTS = {
  CLIENT: 5173,
  ADMIN: 5174,
  SERVER: 4000,
};

export const DTW_CONFIG = {
  KEYFRAMES: 24,
  BAND_RADIUS: 7,
  MATCH_THRESHOLD: 1.05,
  MIN_DYNAMIC_MOTION_AMPLITUDE: 0.35,
};

export const STORAGE_KEYS = {
  ADMIN_KEY: 'sl_meet_admin_key',
  DATASET_CACHE: 'sl_meet_asl_dataset_cache',
  PHRASES_CACHE: 'sl_meet_asl_phrases_cache',
  SELECTED_CAMERA_ID: 'sl_meet_selected_camera_id',
  SELECTED_MIC_ID: 'sl_meet_selected_mic_id',
  AUTO_FOLLOW_ZOOM: 'sl_meet_auto_follow_zoom',
};

