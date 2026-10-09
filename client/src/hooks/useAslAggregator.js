import { useState, useRef, useCallback } from 'react';
import { normalizeGestureToken, formatAslSentence } from '../services/aslTranslator';

/**
 * Custom Hook: Real-Time ASL Gesture Sentence Aggregator
 * 
 * - Real-time word detection with anti-jitter stability threshold (3 consecutive frames).
 * - 450ms word cooldown interval to prevent rapid duplicate word spamming.
 * - Auto-flushes completed sentence to transcript logs after 2000ms of silence
 *   AND clears current sentence off-screen so sentences do not append infinitely.
 * 
 * @param {Number} silenceTimeoutMs - Timeout to complete sentence & clear off-screen (default 2000ms)
 * @param {Number} stabilityFramesNeeded - Required consecutive frames (default 3 frames)
 * @param {Number} wordCooldownMs - Minimum cooldown between adding new words (default 450ms)
 */
export function useAslAggregator(
  silenceTimeoutMs = 1500,
  stabilityFramesNeeded = 3,
  wordCooldownMs = 400
) {
  const [currentSentence, setCurrentSentence] = useState('');
  const [transcriptLogs, setTranscriptLogs] = useState([]);

  const bufferRef = useRef([]);
  const pendingRef = useRef({ token: null, count: 0 });
  const lastAddedTimeRef = useRef(0);
  const lastSenderRef = useRef('You');
  const timerRef = useRef(null);

  const pushGesture = useCallback(
    (senderName = 'You', rawGesture, confidence = 0.9) => {
      if (!rawGesture) return;

      // Filter out low confidence detections
      if (typeof confidence === 'number' && confidence < 0.85) {
        return;
      }

      const cleanToken = normalizeGestureToken(rawGesture);
      if (!cleanToken) return;

      lastSenderRef.current = senderName;
      const now = Date.now();

      // Multi-Frame Stability Check (Debounce)
      if (pendingRef.current.token === cleanToken) {
        pendingRef.current.count += 1;
      } else {
        pendingRef.current = { token: cleanToken, count: 1 };
      }

      // Verify token reached required stability frame threshold
      if (pendingRef.current.count >= stabilityFramesNeeded) {
        const isCooldownElapsed = now - lastAddedTimeRef.current >= wordCooldownMs;
        const currentBuffer = bufferRef.current;
        const lastToken = currentBuffer[currentBuffer.length - 1];

        if (isCooldownElapsed && lastToken !== cleanToken) {
          currentBuffer.push(cleanToken);
          lastAddedTimeRef.current = now;
          const formattedSentence = formatAslSentence(currentBuffer);
          setCurrentSentence(formattedSentence);
        }
      }

      // Reset Silence Timeout for flushing sentence and clearing off-screen
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        if (bufferRef.current.length > 0) {
          const finalSentenceText = formatAslSentence(bufferRef.current);
          const timestamp = Date.now();
          const time = new Date(timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });

          // Save completed sentence to transcript logs for export
          setTranscriptLogs((prev) => [
            ...prev,
            {
              id: `asl-${timestamp}-${Math.random().toString(36).substring(2, 7)}`,
              timestamp,
              time,
              sender: lastSenderRef.current,
              type: 'ASL',
              text: finalSentenceText,
            },
          ]);

          // Clear buffer & reset current sentence so subtitle box clears off-screen gracefully
          bufferRef.current = [];
          pendingRef.current = { token: null, count: 0 };
          setCurrentSentence('');
        }
      }, silenceTimeoutMs);
    },
    [silenceTimeoutMs, stabilityFramesNeeded, wordCooldownMs]
  );

  const clearTranscript = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    bufferRef.current = [];
    pendingRef.current = { token: null, count: 0 };
    setCurrentSentence('');
    setTranscriptLogs([]);
  }, []);

  return {
    currentSentence,
    transcriptLogs,
    pushGesture,
    clearTranscript,
  };
}
