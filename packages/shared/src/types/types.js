/**
 * @file Type Definitions for SL-Meet Shared Models
 */

/**
 * @typedef {Object} UserProfile
 * @property {string} id - Unique user ID
 * @property {string} email - User email address
 * @property {string} [display_name] - User full display name
 * @property {string} [avatar_url] - Profile avatar image URL
 * @property {'signer'|'speaker'} [role] - Default user role
 */

/**
 * @typedef {Object} RoomMember
 * @property {string} socketId - Active socket ID
 * @property {string} [userId] - Authenticated user ID if logged in
 * @property {string} displayName - Name displayed in call tiles
 * @property {boolean} isGuest - Whether member is unauthenticated guest
 * @property {'signer'|'speaker'} role - Signer vs Speaker role
 * @property {boolean} micOn - Microphone state
 * @property {boolean} cameraOn - Camera state
 * @property {boolean} screenSharing - Screen share state
 */

/**
 * @typedef {Object} GestureSample
 * @property {string} [id] - Unique gesture sample ID from Supabase
 * @property {string} label - Recognized sign/word label (e.g. 'A', 'HELLO')
 * @property {number[]} vector - Normalized 63D or 126D landmark vector
 * @property {'static'|'dynamic'|'dynamic_two_hands'|'two_hands'} [type] - Gesture modality
 * @property {number} [confidence] - Match confidence 0.0 - 1.0
 */

/**
 * @typedef {Object} CaptionEntry
 * @property {string} id - Unique caption ID
 * @property {string} text - Transcription or translated text
 * @property {string} senderId - Socket ID or User ID of speaker/signer
 * @property {string} senderName - Display name of sender
 * @property {'speech'|'gesture'} type - Speech-to-text or ASL sign
 * @property {boolean} isFinal - Whether caption chunk is finalized
 * @property {number} timestamp - Epoch timestamp in milliseconds
 */

export const TYPE_DEFINITIONS = {};

