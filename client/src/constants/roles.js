/**
 * User Roles and capabilities for SL-Meet meeting participants
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
