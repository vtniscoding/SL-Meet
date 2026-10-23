import { CAPTION_CONFIG as C } from '../../../config/captionConfig.js';

/**
 * Counts words in a string.
 */
export const wordCount = (text) => {
  if (!text || typeof text !== 'string') return 0;
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
};

/**
 * Calculates dynamic dwell time for an entry in milliseconds.
 * Final sentences stay longer if they contain more words.
 * Interims stay for INTERIM_TTL_MS unless replaced.
 */
export function dwellMs(entry) {
  if (!entry) return C.DWELL_MIN_MS;
  if (!entry.isFinal) return C.INTERIM_TTL_MS;

  const words = wordCount(entry.text);
  const calculated = C.DWELL_BASE_MS + words * C.DWELL_PER_WORD_MS;
  return Math.min(C.DWELL_MAX_MS, Math.max(C.DWELL_MIN_MS, calculated));
}

/**
 * Generates a stable, high-contrast color for a given sender ID.
 */
export function colorForSender(senderId) {
  if (!senderId || typeof senderId !== 'string') return C.SPEAKER_COLORS[0];
  let hash = 0;
  for (let i = 0; i < senderId.length; i++) {
    hash = (hash * 31 + senderId.charCodeAt(i)) >>> 0;
  }
  return C.SPEAKER_COLORS[hash % C.SPEAKER_COLORS.length];
}

/**
 * Pure helper function to merge incoming captions into the existing display entries.
 * Rules:
 * 1. If incoming is interim and the last entry from that sender was also interim, update in place.
 * 2. If incoming is final and the last entry from that sender was interim, replace it with the final.
 * 3. If incoming is a new utterance, append as a new entry.
 * 4. Cap entries to maxEntries.
 */
export function mergeCaptionEntries(prevEntries = [], incoming = null, maxEntries = C.MAX_ENTRIES) {
  if (!incoming || !incoming.text || !incoming.text.trim()) {
    return prevEntries;
  }

  const now = Date.now();
  const entryId = `${incoming.senderId || 'unknown'}-${incoming.timestamp || now}`;
  const newEntry = {
    id: entryId,
    senderId: incoming.senderId || 'unknown',
    senderName: incoming.senderName || 'Speaker',
    text: incoming.text.trim(),
    isFinal: !!incoming.isFinal,
    timestamp: incoming.timestamp || now,
    shownAt: now,
  };

  // Find index of the most recent entry from the same sender
  let lastSenderIdx = -1;
  for (let i = prevEntries.length - 1; i >= 0; i--) {
    if (prevEntries[i].senderId === newEntry.senderId) {
      lastSenderIdx = i;
      break;
    }
  }

  // Same exact timestamp & sender -> update in place (no duplicate)
  if (lastSenderIdx !== -1 && prevEntries[lastSenderIdx].timestamp === newEntry.timestamp) {
    const updated = [...prevEntries];
    updated[lastSenderIdx] = {
      ...updated[lastSenderIdx],
      text: newEntry.text,
      isFinal: newEntry.isFinal,
      shownAt: now,
    };
    return updated;
  }

  // Previous was interim from this sender -> replace with current update
  if (lastSenderIdx !== -1 && !prevEntries[lastSenderIdx].isFinal) {
    const updated = [...prevEntries];
    updated[lastSenderIdx] = newEntry;
    return updated;
  }

  // Otherwise append as a new distinct line
  const next = [...prevEntries, newEntry];
  if (next.length > maxEntries) {
    return next.slice(next.length - maxEntries);
  }
  return next;
}
