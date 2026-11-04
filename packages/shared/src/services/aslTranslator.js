import { supabase } from '../utils/supabase';

/**
 * ASL Sentence Translator & Dynamic Multi-Sign Phrase Engine (2 or 3 Signs)
 * Fully synchronized with Supabase DB `asl_phrases` via Realtime.
 * Supports chaining 2 or 3 signs seamlessly without any hardcoded dictionary.
 */

const LOCAL_STORAGE_PHRASES_KEY = 'sl_meet_asl_phrases_cache';

// In-memory active compound phrase rules
let activePhrases = (() => {
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_PHRASES_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    // Ignore cache parse error
  }
  return [];
})();

/**
 * Maps raw technical gesture labels or MediaPipe outputs into clean English tokens.
 * Returns null if the gesture is noise (e.g. 'Signing...', 'No Hands Detected').
 */
export function normalizeGestureToken(rawGesture) {
  if (!rawGesture || typeof rawGesture !== 'string') return null;

  const trimmed = rawGesture.trim();

  // Noise Filter: Ignore transitionary states & debug strings
  if (
    trimmed === 'Signing...' ||
    trimmed === 'No Hands Detected' ||
    trimmed === 'Waiting for hands...' ||
    trimmed === 'N/A' ||
    trimmed === ''
  ) {
    return null;
  }

  // Strip slashes and technical suffixes if present
  let cleaned = trimmed.split('/')[0].trim();
  cleaned = cleaned.replace(/_/g, ' ');

  if (!cleaned) return null;

  // Capitalize properly
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * Loads custom compound phrase rules into memory and saves to local cache.
 */
export function loadCustomPhrases(phrasesList) {
  if (Array.isArray(phrasesList)) {
    activePhrases = phrasesList;
    try {
      localStorage.setItem(LOCAL_STORAGE_PHRASES_KEY, JSON.stringify(phrasesList));
    } catch (e) {
      // Ignore cache storage error
    }
  }
}

/**
 * Returns current loaded compound phrase rules
 */
export function getLoadedPhrases() {
  return [...activePhrases];
}

/**
 * Checks if there is any registered compound phrase that starts with the given sign token.
 */
export function hasPhraseStartingWith(sign) {
  if (!sign) return false;
  const clean = sign.toLowerCase().trim();
  return activePhrases.some((p) => {
    const first = Array.isArray(p.pattern) && p.pattern[0];
    return typeof first === 'string' && first.toLowerCase().trim() === clean;
  });
}

/**
 * Checks if there is any compound phrase that starts with the given sequence of tokens
 * AND has more tokens remaining (e.g. checks if a 3-sign phrase can be completed).
 */
export function hasPhrasePrefix(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) return false;
  const cleanTokens = tokens.map((t) => String(t).toLowerCase().trim());

  return activePhrases.some((rule) => {
    if (!Array.isArray(rule.pattern) || rule.pattern.length <= cleanTokens.length) {
      return false;
    }
    return cleanTokens.every(
      (t, idx) => String(rule.pattern[idx]).toLowerCase().trim() === t
    );
  });
}

/**
 * Matches a sequence of signs (2 or 3 signs) against active phrase rules.
 * Returns translation string if matched, otherwise null.
 */
export function matchPhraseSequence(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) return null;
  const cleanTokens = tokens.map((t) => String(t).toLowerCase().trim());

  // Greedy match: check longest pattern first
  const sorted = [...activePhrases].sort(
    (a, b) => (b.pattern?.length || 0) - (a.pattern?.length || 0)
  );

  const match = sorted.find((p) => {
    if (!Array.isArray(p.pattern) || p.pattern.length !== cleanTokens.length) {
      return false;
    }
    return p.pattern.every(
      (pt, idx) => String(pt).toLowerCase().trim() === cleanTokens[idx]
    );
  });

  return match ? match.translation : null;
}

/**
 * Backwards compatibility helper for 2-sign phrase matching
 */
export function matchTwoSignPhrase(firstSign, secondSign) {
  return matchPhraseSequence([firstSign, secondSign]);
}

/**
 * Fetches all compound phrase rules directly from Supabase DB `asl_phrases`
 */
export async function fetchPhrasesFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('asl_phrases')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      loadCustomPhrases(data);
      return data;
    }
  } catch (err) {
    console.warn('[AslTranslator] Failed to fetch phrases from Supabase:', err);
  }
  return activePhrases;
}

let phrasesChannel = null;
const phrasesListeners = new Set();

/**
 * Initializes Supabase Realtime synchronization for `asl_phrases`
 * Uses a Singleton Channel pattern to safely support multiple listening components.
 */
export function initRealtimePhrasesSync(onChangeCallback) {
  if (onChangeCallback) {
    phrasesListeners.add(onChangeCallback);
    onChangeCallback(activePhrases);
  }

  if (!phrasesChannel) {
    fetchPhrasesFromSupabase().then((data) => {
      phrasesListeners.forEach((cb) => {
        try { cb(data); } catch (e) { console.error(e); }
      });
    });

    phrasesChannel = supabase
      .channel('asl_phrases_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'asl_phrases' },
        async () => {
          const data = await fetchPhrasesFromSupabase();
          phrasesListeners.forEach((cb) => {
            try { cb(data); } catch (e) { console.error(e); }
          });
        }
      )
      .subscribe();
  }

  return {
    unsubscribe: () => {
      if (onChangeCallback) {
        phrasesListeners.delete(onChangeCallback);
      }
    },
  };
}

/**
 * Adds a new compound phrase rule (2 or 3 signs -> Translation) to Supabase DB
 * Supports:
 *   addPhraseRule(['Nice', 'Meet', 'You'], 'Nice to meet you!', 'Description')
 *   or addPhraseRule('Nice', 'Meet', 'Nice to meet you!', 'Description')
 */
export async function addPhraseRule(signs, arg2, arg3 = '', arg4 = '') {
  let signList = [];
  let translation = '';
  let description = '';

  if (Array.isArray(signs)) {
    signList = signs;
    translation = typeof arg2 === 'string' ? arg2.trim() : '';
    description = typeof arg3 === 'string' ? arg3.trim() : '';
  } else if (typeof signs === 'string' && typeof arg2 === 'string') {
    if (typeof arg3 === 'string' && arg4 !== undefined && arg4 !== '') {
      // 3 signs: (sign1, sign2, sign3, translation)
      signList = [signs, arg2, arg3];
      translation = arg4.trim();
    } else {
      // 2 signs: (sign1, sign2, translation, description)
      signList = [signs, arg2];
      translation = typeof arg3 === 'string' ? arg3.trim() : '';
      description = typeof arg4 === 'string' ? arg4.trim() : '';
    }
  }

  const cleanPattern = signList
    .map((s) => normalizeGestureToken(s) || (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean);

  if (cleanPattern.length < 2 || !translation) {
    return {
      success: false,
      message: 'Please provide at least 2 signs and a Decoded Translation.',
    };
  }

  const { data, error } = await supabase
    .from('asl_phrases')
    .insert({
      pattern: cleanPattern,
      translation: translation.trim(),
      description: description.trim(),
    })
    .select();

  if (error) {
    return { success: false, error: error.message };
  }

  await fetchPhrasesFromSupabase();
  return { success: true, phrase: data?.[0] };
}

/**
 * Deletes a compound phrase rule by ID from Supabase DB
 */
export async function deletePhraseRule(id) {
  if (!id) return { success: false };

  const { error } = await supabase
    .from('asl_phrases')
    .delete()
    .eq('id', id);

  if (error) {
    return { success: false, error: error.message };
  }

  await fetchPhrasesFromSupabase();
  return { success: true };
}

/**
 * Helper: Checks if a token is a single alphabet letter (A-Z) used for fingerspelling
 */
export function isAlphabetLetter(token) {
  if (!token || typeof token !== 'string') return false;
  const clean = token.trim();
  return clean.length === 1 && /^[a-zA-Z]$/.test(clean);
}

/**
 * Helper: Capitalizes fingerspelled word cleanly (e.g. ['A', 'N', 'H'] -> 'Anh')
 */
export function formatFingerspelledWord(letters) {
  if (!Array.isArray(letters) || letters.length === 0) return '';
  const word = letters.map((l) => String(l).trim()).join('');
  if (word.length === 1) return word.toUpperCase();
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Formats an array of recognized gesture tokens into a clean, fluent natural sentence.
 * Features:
 * - Greedy Left-to-Right parsing: finds multi-sign phrases anywhere in the sentence (start, middle, end).
 * - Fingerspelling Merging: automatically combines consecutive alphabet letters (A, N, H) into a cohesive name/word ('Anh').
 * - Seamless open-ended phrase linking: "Hello, my name is" + ['A', 'N', 'H'] => "Hello, my name is Anh!".
 */
export function formatAslSentence(tokens) {
  if (!tokens || !Array.isArray(tokens) || tokens.length === 0) return '';

  const cleanTokens = tokens
    .map(normalizeGestureToken)
    .filter((token) => token !== null);

  if (cleanTokens.length === 0) return '';

  // Single token special case
  if (cleanTokens.length === 1) {
    const word = cleanTokens[0];
    if (isAlphabetLetter(word)) {
      return word.toUpperCase();
    }
    if (/[.!?]$/.test(word)) return word;
    return `${word}!`;
  }

  // Greedy Token Segmentation
  // Scan cleanTokens from left to right, matching active multi-sign phrases (3-sign, 2-sign)
  // or grouping consecutive alphabet letters into fingerspelled words.
  const segments = [];
  let i = 0;

  while (i < cleanTokens.length) {
    let matchedPhrase = null;
    let matchLen = 0;

    // Check 3-sign phrase match first
    if (i + 3 <= cleanTokens.length) {
      const slice3 = cleanTokens.slice(i, i + 3);
      const match3 = matchPhraseSequence(slice3);
      if (match3) {
        matchedPhrase = match3;
        matchLen = 3;
      }
    }

    // Check 2-sign phrase match if 3-sign didn't match
    if (!matchedPhrase && i + 2 <= cleanTokens.length) {
      const slice2 = cleanTokens.slice(i, i + 2);
      const match2 = matchPhraseSequence(slice2);
      if (match2) {
        matchedPhrase = match2;
        matchLen = 2;
      }
    }

    if (matchedPhrase) {
      segments.push({ type: 'phrase', text: matchedPhrase });
      i += matchLen;
      continue;
    }

    // Check if current token is a single alphabet letter (fingerspelling)
    if (isAlphabetLetter(cleanTokens[i])) {
      const letters = [];
      while (i < cleanTokens.length && isAlphabetLetter(cleanTokens[i])) {
        letters.push(cleanTokens[i]);
        i++;
      }
      const spelledWord = formatFingerspelledWord(letters);
      segments.push({ type: 'fingerspelling', text: spelledWord });
      continue;
    }

    // Standalone regular word token
    segments.push({ type: 'word', text: cleanTokens[i] });
    i++;
  }

  // Assemble segments into a fluent sentence
  let result = '';

  for (let sIdx = 0; sIdx < segments.length; sIdx++) {
    const seg = segments[sIdx];
    const isFirst = sIdx === 0;

    if (isFirst) {
      result = seg.text;
      continue;
    }

    const prevSeg = segments[sIdx - 1];
    const prevClean = prevSeg.text.trim();

    // Check if previous segment is an introductory phrase (e.g. "is", "is...", "name is", "...")
    const isIntroPhrase =
      prevSeg.type === 'phrase' &&
      (/(?:is|am|are|\.\.\.)$/i.test(prevClean) || /name/i.test(prevClean));

    if (isIntroPhrase) {
      // Remove trailing ellipses from intro phrase before appending the spelled name
      const cleanIntro = prevClean.replace(/\.{2,}$/, '').trim();
      result = `${cleanIntro} ${seg.text}`;
    } else if (seg.type === 'fingerspelling') {
      // Direct space before fingerspelled name
      const cleanPrev = result.replace(/[!?,.]+$/, '').trim();
      result = `${cleanPrev} ${seg.text}`;
    } else {
      // Regular phrase or word concatenation
      const hasEndPunc = /[.!?]$/.test(result);
      if (hasEndPunc) {
        result = `${result} ${seg.text}`;
      } else {
        result = `${result}, ${seg.text}`;
      }
    }
  }

  // Ensure trailing punctuation for complete feel if not present
  if (!/[.!?]$/.test(result)) {
    result = `${result}!`;
  }

  return result;
}
