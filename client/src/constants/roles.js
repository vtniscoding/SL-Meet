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
    label: 'Signer',
    shortLabel: 'Signer',
    badgeText: 'Signer',
    iconName: 'Hand',
    description: 'I am Deaf or Hard of Hearing and will communicate using Sign Language.',
    canSign: true,
    canSpeechToText: false,
    receivesSpeechCaptions: true,
  },
  [ROLES.NON_SIGNER]: {
    id: ROLES.NON_SIGNER,
    label: 'Non-signer',
    shortLabel: 'Speaker',
    badgeText: 'Speaker',
    iconName: 'Mic',
    description: 'I am hearing and will speak verbally using microphone.',
    canSign: false,
    canSpeechToText: true,
    receivesSpeechCaptions: false,
  },
});

export function isValidRole(role) {
  return role === ROLES.SIGNER || role === ROLES.NON_SIGNER;
}

export function sanitizeRole(role, fallback = ROLES.NON_SIGNER) {
  if (isValidRole(role)) return role;
  return fallback;
}
