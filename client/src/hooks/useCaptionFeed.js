import { useState, useEffect, useRef } from 'react';
import { dwellMs, mergeCaptionEntries } from '../components/room/captions/captionUtils';
import { CAPTION_CONFIG } from '../config/captionConfig';

/**
 * Custom Hook: useCaptionFeed
 * Maintains an expiring roll-up buffer of speech captions.
 * Supports:
 * - In-place updates for interim captions.
 * - Dynamic dwell expiration per sentence length.
 * - Freeze-on-hover/focus suspension.
 * - Clean unmount without timer leaks.
 */
export function useCaptionFeed(captionMap = {}, { frozen = false } = {}) {
  const [entries, setEntries] = useState([]);
  const processedTimestampsRef = useRef(new Map()); // senderId -> latest processed timestamp
  const wasFrozenRef = useRef(frozen);

  // Ingest incoming captions from speechCaptions map
  useEffect(() => {
    if (!captionMap || typeof captionMap !== 'object') return;

    Object.entries(captionMap).forEach(([senderId, cap]) => {
      if (!cap || !cap.text || !cap.text.trim()) return;

      const lastTs = processedTimestampsRef.current.get(senderId);
      // New or updated utterance
      if (lastTs !== cap.timestamp) {
        processedTimestampsRef.current.set(senderId, cap.timestamp);

        const incoming = {
          senderId,
          senderName: cap.senderName || 'Speaker',
          text: cap.text,
          isFinal: !!cap.isFinal,
          timestamp: cap.timestamp || Date.now(),
        };

        setEntries((prev) => mergeCaptionEntries(prev, incoming, CAPTION_CONFIG.MAX_ENTRIES));
      }
    });
  }, [captionMap]);

  // When unfreezing (mouse leaves or focus lost), refresh shownAt so displayed captions don't immediately vanish
  useEffect(() => {
    if (wasFrozenRef.current && !frozen) {
      const now = Date.now();
      setEntries((prev) =>
        prev.map((e) => ({
          ...e,
          shownAt: now,
        }))
      );
    }
    wasFrozenRef.current = frozen;
  }, [frozen]);

  // Periodic expiration tick (every 400ms)
  useEffect(() => {
    if (frozen) return;

    const timer = setInterval(() => {
      const now = Date.now();
      setEntries((prev) => {
        const next = prev.filter((entry) => {
          const ttl = dwellMs(entry);
          return now - (entry.shownAt || now) <= ttl;
        });

        // Avoid unnecessary state updates if length is unchanged
        if (next.length === prev.length) return prev;
        return next;
      });
    }, 400);

    return () => {
      clearInterval(timer);
    };
  }, [frozen]);

  return entries;
}
