/**
 * ASL Sentence Translator & Gesture Label Cleaner Service
 */

/**
 * Maps raw technical gesture labels or MediaPipe outputs into clean, natural English words.
 * Returns null if the gesture is noise (e.g. 'Signing...', 'No Hands Detected').
 * 
 * @param {String} rawGesture - Raw gesture label from classifier or MediaPipe
 * @returns {String|null} Clean natural English word or null
 */
export function normalizeGestureToken(rawGesture) {
  if (!rawGesture || typeof rawGesture !== 'string') return null;

  const trimmed = rawGesture.trim();

  // 1. Noise Filter: Ignore transitionary states & debug strings completely
  if (
    trimmed === 'Signing...' ||
    trimmed === 'No Hands Detected' ||
    trimmed === 'Waiting for hands...' ||
    trimmed === 'N/A' ||
    trimmed === ''
  ) {
    return null;
  }

  // 2. Dictionary Mapping: Technical labels -> Clean natural words
  const gestureMap = {
    'Hello': 'Hello',
    'Hello / Open Palm': 'Hello',
    'Good / Thumbs Up': 'Good',
    'Thumbs Up / Good': 'Good',
    'Victory / Peace': 'Peace',
    'Agreed / OK': 'OK',
    'I Love You': 'I love you',
    'Attention / Pointing': 'Attention',
    'Wait / Fist': 'Wait',
    'Thank You': 'Thank you',
  };

  if (gestureMap[trimmed]) {
    return gestureMap[trimmed];
  }

  // Fallback: Strip slashes and underscores for dynamically loaded datasets
  let cleaned = trimmed.split('/')[0].trim();
  cleaned = cleaned.replace(/_/g, ' ');
  
  if (!cleaned) return null;

  // Capitalize first letter properly
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Formats an array of clean gesture tokens into a polished English sentence with punctuation.
 * Example: ['Hello', 'I love you', 'Good'] -> 'Hello, I love you. Good!'
 * 
 * @param {Array<String>} tokens - Array of clean gesture word tokens
 * @returns {String} Polished English sentence
 */
export function formatAslSentence(tokens) {
  if (!tokens || !Array.isArray(tokens) || tokens.length === 0) return '';

  const cleanTokens = tokens
    .map(normalizeGestureToken)
    .filter((token) => token !== null);

  if (cleanTokens.length === 0) return '';

  if (cleanTokens.length === 1) {
    const word = cleanTokens[0];
    return word.charAt(0).toUpperCase() + word.slice(1) + '!';
  }

  const lastIndex = cleanTokens.length - 1;
  const sentenceParts = cleanTokens.map((word, idx) => {
    // Format case: Capitalize first word of sentence, lowercase middle phrases if needed
    const formattedWord = idx === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word;

    if (idx < lastIndex - 1) {
      return `${formattedWord},`;
    } else if (idx === lastIndex - 1) {
      return `${formattedWord}.`;
    } else {
      // Last word gets an exclamation mark
      return `${word.charAt(0).toUpperCase() + word.slice(1)}!`;
    }
  });

  return sentenceParts.join(' ');
}
