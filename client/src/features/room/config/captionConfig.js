/**
 * Centralized Caption & Subtitle UI Configuration.
 * Defines display timings, sizing tokens, speaker colors, and accessibility defaults.
 */
export const CAPTION_CONFIG = {
  // Signers read direct sign language or speech; do not show remote signer text translations to signers
  SHOW_REMOTE_TRANSLATION_FOR_SIGNER: false,

  // Maximum speech lines maintained in the active display buffer
  MAX_ENTRIES: 6,

  // Dynamic Dwell Timing: dwell = clamp(BASE + words * PER_WORD, MIN, MAX)
  DWELL_MIN_MS: 3500,
  DWELL_MAX_MS: 12000,
  DWELL_BASE_MS: 2500,
  DWELL_PER_WORD_MS: 450,

  // Maximum time an interim caption remains if not superseded
  INTERIM_TTL_MS: 8000,

  // Font size tokens in pixels (WCAG compliant)
  SIZES_PX: {
    m: 20,
    l: 24, // Default
    xl: 28,
  },

  // Consistent high-contrast speaker color palette
  SPEAKER_COLORS: [
    '#8AB4F8', // Google Blue
    '#81C995', // Google Green
    '#FDD663', // Google Yellow
    '#F28B82', // Google Red/Coral
    '#C58AF9', // Google Purple
  ],

  // Distinct ASL Translation accent color
  ASL_ACCENT: '#C58AF9',

  // LocalStorage persistence key
  PREFS_KEY: 'slmeet.captionPrefs.v1',
};
