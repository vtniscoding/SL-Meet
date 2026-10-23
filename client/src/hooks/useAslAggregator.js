import { useState, useRef, useCallback, useEffect } from 'react';
import {
  normalizeGestureToken,
  formatAslSentence,
  hasPhraseStartingWith,
  hasPhrasePrefix,
  matchPhraseSequence,
  initRealtimePhrasesSync,
  isAlphabetLetter
} from '../services/aslTranslator';

/**
 * Custom Hook: Real-Time ASL Gesture Sentence & Multi-Sign Phrase Aggregator (2 or 3 signs)
 * 
 * - Dual-Engine Detection: Fast Streak Triggering + Adaptive Anti-Jitter Window.
 * - Time-Windowed State Machine with Multi-Sign Prefix Lookahead:
 *     IDLE -> (Sign 1 matches phrase start) -> PENDING_PHRASE (2.2s window) ->
 *     - If Sign 2 arrives:
 *         - If a 3-sign phrase is possible -> Waits for Sign 3 with visual cue "Sign 1 -> Sign 2..."
 *         - Else if 2-sign phrase matches -> Decodes phrase immediately
 *     - If Sign 3 arrives -> Decodes 3-sign phrase immediately
 * - Open-Ended Phrase & Fingerspelling Linker:
 *     - When a phrase completes (e.g. "Hello, my name is"), trailing fingerspelling letters (e.g. 'A', 'N', 'H')
 *       are appended seamlessly into "Hello, my name is Anh!" without erasing the introductory phrase.
 * - 100% Data-Driven: Synchronized in real-time via Supabase DB `asl_phrases`.
 */
export function useAslAggregator(
  silenceTimeoutMs = 2800,
  stabilityFramesNeeded = 6,
  wordCooldownMs = 650,
  phraseWindowMs = 2200,
  postPhraseCooldownMs = 1800
) {
  const [currentSentence, setCurrentSentence] = useState('');
  const [liveTokens, setLiveTokens] = useState([]);
  const [transcriptLogs, setTranscriptLogs] = useState([]);

  const bufferRef = useRef([]);
  const windowRef = useRef([]);
  const streakRef = useRef({ token: null, count: 0 });

  const syncLiveTokens = useCallback(() => {
    const pending = phraseStateRef.current.state === 'PENDING_PHRASE'
      ? phraseStateRef.current.tokens.map((t, idx, arr) => (idx === arr.length - 1 ? `${t}...` : t))
      : [];
    setLiveTokens([...bufferRef.current, ...pending]);
  }, []);
  const lastAddedTimeRef = useRef(0);
  const lastSenderRef = useRef('You');
  const timerRef = useRef(null);

  // Post-Phrase Lockout & Hold Suppression Refs
  const phraseLockUntilRef = useRef(0);
  const lastEmittedTokenRef = useRef(null);

  // Time-Windowed State Machine for 2 or 3 Sign Phrases
  const phraseStateRef = useRef({
    state: 'IDLE', // 'IDLE' | 'PENDING_PHRASE'
    tokens: [],
    fallbackMatch: null,
    timer: null,
  });

  // Sync active compound phrase rules with Supabase Realtime
  useEffect(() => {
    const channel = initRealtimePhrasesSync();
    return () => {
      if (channel?.unsubscribe) channel.unsubscribe();
    };
  }, []);

  const addTranscriptLog = useCallback((text) => {
    const timestamp = Date.now();
    const time = new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    setTranscriptLogs((prev) => [
      ...prev,
      {
        id: `asl-${timestamp}-${Math.random().toString(36).substring(2, 7)}`,
        timestamp,
        time,
        sender: lastSenderRef.current,
        type: 'ASL',
        text,
      },
    ]);
  }, []);

  const resetPhraseStateMachine = useCallback(() => {
    if (phraseStateRef.current.timer) {
      clearTimeout(phraseStateRef.current.timer);
    }
    phraseStateRef.current = {
      state: 'IDLE',
      tokens: [],
      fallbackMatch: null,
      timer: null,
    };
  }, []);

  // Commits active buffer into meeting transcript and resets state
  const commitCurrentSentence = useCallback(() => {
    if (bufferRef.current.length > 0) {
      const finalText = formatAslSentence(bufferRef.current);
      addTranscriptLog(finalText);
    }
    bufferRef.current = [];
    windowRef.current = [];
    streakRef.current = { token: null, count: 0 };
    lastEmittedTokenRef.current = null;
    phraseLockUntilRef.current = 0;
    resetPhraseStateMachine();
    setLiveTokens([]);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setCurrentSentence('');
    }, 400);
  }, [addTranscriptLog, resetPhraseStateMachine]);

  const scheduleSentenceCommit = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      commitCurrentSentence();
    }, silenceTimeoutMs);
  }, [commitCurrentSentence, silenceTimeoutMs]);

  // When a multi-sign phrase is completed
  const handlePhraseCompleted = useCallback(
    (phraseTokens, phraseTranslation) => {
      const now = Date.now();
      resetPhraseStateMachine();

      // Store tokens in buffer so trailing fingerspelling letters or words append cleanly!
      bufferRef.current = [...phraseTokens];
      windowRef.current = [];
      streakRef.current = { token: null, count: 0 };
      lastAddedTimeRef.current = now;

      const lastTok = phraseTokens[phraseTokens.length - 1];
      lastEmittedTokenRef.current = lastTok.toLowerCase();
      phraseLockUntilRef.current = now + postPhraseCooldownMs;

      // Update current displayed sentence
      setCurrentSentence(phraseTranslation);
      syncLiveTokens();

      // Start silence countdown for final commit
      scheduleSentenceCommit();
    },
    [resetPhraseStateMachine, postPhraseCooldownMs, scheduleSentenceCommit, syncLiveTokens]
  );

  const notifyHandReset = useCallback(() => {
    // Called when user lowers hands / no gesture is detected
    streakRef.current = { token: null, count: 0 };
    windowRef.current = [];
    lastEmittedTokenRef.current = null;
  }, []);

  const pushGesture = useCallback(
    (senderName = 'You', rawGesture, confidence = 0.9) => {
      if (!rawGesture) {
        notifyHandReset();
        return;
      }

      if (typeof confidence === 'number' && confidence < 0.68) {
        return;
      }

      const cleanToken = normalizeGestureToken(rawGesture);
      if (!cleanToken) return;

      const now = Date.now();
      lastSenderRef.current = senderName;

      // A. Hold Suppression Guard
      // If user is STILL HOLDING the exact same sign that finished the phrase or word:
      if (
        lastEmittedTokenRef.current &&
        cleanToken.toLowerCase() === lastEmittedTokenRef.current
      ) {
        streakRef.current = { token: null, count: 0 };
        return;
      }

      // If user switched to a DIFFERENT gesture, release the hold suppression
      if (
        lastEmittedTokenRef.current &&
        cleanToken.toLowerCase() !== lastEmittedTokenRef.current
      ) {
        lastEmittedTokenRef.current = null;
      }

      // 1. Streak Tracker for Rapid Transitions
      if (streakRef.current.token === cleanToken) {
        streakRef.current.count += 1;
      } else {
        streakRef.current = { token: cleanToken, count: 1 };
      }

      // 2. Sliding Window Anti-Jitter
      if (!windowRef.current) windowRef.current = [];
      windowRef.current.push(cleanToken);
      const WINDOW_SIZE = 12;
      const MAJORITY_THRESHOLD = 0.66;

      if (windowRef.current.length > WINDOW_SIZE) {
        windowRef.current.shift();
      }

      const counts = {};
      let maxCount = 0;
      let majorityToken = null;
      for (const token of windowRef.current) {
        counts[token] = (counts[token] || 0) + 1;
        if (counts[token] > maxCount) {
          maxCount = counts[token];
          majorityToken = token;
        }
      }

      // 3. Confirm Token
      const isLetter = isAlphabetLetter(cleanToken);
      // Require at least 5 steady frames (~170ms) to ensure user settled on the sign,
      // completely eliminating transient glitches between similar signs (A -> M -> N)
      const effectiveStabilityFrames = isLetter
        ? Math.max(5, stabilityFramesNeeded - 1)
        : stabilityFramesNeeded;

      const isStreakConfirmed =
        streakRef.current.count >= effectiveStabilityFrames && confidence >= 0.76;
      const isMajorityConfirmed =
        windowRef.current.length >= 7 &&
        maxCount / windowRef.current.length >= MAJORITY_THRESHOLD &&
        confidence >= 0.74;

      let confirmedToken = null;
      if (isStreakConfirmed) {
        confirmedToken = streakRef.current.token;
      } else if (isMajorityConfirmed) {
        confirmedToken = majorityToken;
      }

      if (!confirmedToken) {
        return;
      }

      // 4. Cooldown Check
      const effectiveCooldown = isLetter
        ? Math.min(wordCooldownMs, 420) // Smooth interval for fingerspelling
        : wordCooldownMs;

      const isCooldownElapsed = now - lastAddedTimeRef.current >= effectiveCooldown;
      if (!isCooldownElapsed) {
        return;
      }

      // 5. Multi-Sign Phrase State Machine (2 or 3 Signs)
      const pState = phraseStateRef.current;

      if (pState.state === 'PENDING_PHRASE') {
        const lastPendingToken = pState.tokens[pState.tokens.length - 1];

        // Ensure token is different from the immediate previous token in sequence
        if (confirmedToken.toLowerCase() !== lastPendingToken.toLowerCase()) {
          const nextTokens = [...pState.tokens, confirmedToken];
          lastAddedTimeRef.current = now;
          streakRef.current = { token: null, count: 0 };
          windowRef.current = [];

          // Case A: 2 Signs accumulated ([T1, T2])
          if (nextTokens.length === 2) {
            const twoSignMatch = matchPhraseSequence(nextTokens);
            const canBeThreeSign = hasPhrasePrefix(nextTokens);

            if (canBeThreeSign) {
              if (pState.timer) clearTimeout(pState.timer);
              setCurrentSentence(`${nextTokens.join(' → ')}...`);

              const newTimer = setTimeout(() => {
                if (twoSignMatch) {
                  handlePhraseCompleted(nextTokens, twoSignMatch);
                } else {
                  handlePhraseCompleted(nextTokens, formatAslSentence(nextTokens));
                }
              }, phraseWindowMs);

              phraseStateRef.current = {
                state: 'PENDING_PHRASE',
                tokens: nextTokens,
                fallbackMatch: twoSignMatch,
                timer: newTimer,
              };
              syncLiveTokens();

              return;
            } else if (twoSignMatch) {
              handlePhraseCompleted(nextTokens, twoSignMatch);
              return;
            }
          }

          // Case B: 3 Signs accumulated ([T1, T2, T3])
          if (nextTokens.length === 3) {
            const threeSignMatch = matchPhraseSequence(nextTokens);
            if (threeSignMatch) {
              handlePhraseCompleted(nextTokens, threeSignMatch);
              return;
            }

            if (pState.fallbackMatch) {
              handlePhraseCompleted(
                nextTokens,
                `${pState.fallbackMatch} (${confirmedToken})`
              );
              return;
            }
          }
        } else {
          return;
        }
      }

      // If we are in IDLE, check if confirmedToken can start a compound phrase
      // (Only if confirmedToken is NOT a single alphabet letter meant for fingerspelling)
      if (pState.state === 'IDLE' && !isLetter && hasPhraseStartingWith(confirmedToken)) {
        lastAddedTimeRef.current = now;
        streakRef.current = { token: confirmedToken, count: 0 };
        windowRef.current = [];

        // Check if there is an existing buffer to prefix
        const prefixPreview =
          bufferRef.current.length > 0
            ? `${formatAslSentence(bufferRef.current).replace(/[!?,.]+$/, '')}, ${confirmedToken}...`
            : `${confirmedToken}...`;

        setCurrentSentence(prefixPreview);

        const timer = setTimeout(() => {
          handlePhraseCompleted([confirmedToken], `${confirmedToken}!`);
        }, phraseWindowMs);

        phraseStateRef.current = {
          state: 'PENDING_PHRASE',
          tokens: [confirmedToken],
          fallbackMatch: null,
          timer,
        };
        syncLiveTokens();

        return;
      }

      // 6. Token Addition Path (Standalone gestures or fingerspelling letters)
      resetPhraseStateMachine();
      const currentBuffer = bufferRef.current;
      const lastToken = currentBuffer[currentBuffer.length - 1];

      if (lastToken !== confirmedToken) {
        currentBuffer.push(confirmedToken);
        lastAddedTimeRef.current = now;
        streakRef.current = { token: confirmedToken, count: 0 };
        windowRef.current = [];

        const formatted = formatAslSentence(currentBuffer);
        setCurrentSentence(formatted);
        syncLiveTokens();
      }

      // Refresh countdown timer for sentence commitment
      scheduleSentenceCommit();
    },
    [
      silenceTimeoutMs,
      stabilityFramesNeeded,
      wordCooldownMs,
      phraseWindowMs,
      postPhraseCooldownMs,
      handlePhraseCompleted,
      scheduleSentenceCommit,
      resetPhraseStateMachine,
      notifyHandReset,
    ]
  );

  const clearTranscript = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    resetPhraseStateMachine();
    bufferRef.current = [];
    windowRef.current = [];
    streakRef.current = { token: null, count: 0 };
    lastEmittedTokenRef.current = null;
    phraseLockUntilRef.current = 0;
    setCurrentSentence('');
    setLiveTokens([]);
    setTranscriptLogs([]);
  }, [resetPhraseStateMachine]);

  return {
    currentSentence,
    liveTokens,
    transcriptLogs,
    pushGesture,
    clearTranscript,
    notifyHandReset,
  };
}
