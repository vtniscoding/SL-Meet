import React, { useRef, useEffect, useState } from 'react';
import { CAPTION_CONFIG } from '../../config/captionConfig';
import ParticipantAvatar from '../video/ParticipantAvatar';

/**
 * AslStrip Component:
 * Clean, Google Meet-style sign language translation display.
 * - When no sign gestures are active: keeps UI completely clean (returns null).
 * - When sign gestures ARE detected: automatically displays the signer's circular avatar, name,
 *   and translated text.
 * - Sentences automatically expire after 6.5s of silence unless frozen by hover.
 * - Uses ParticipantAvatar to support both custom uploaded avatars and consistent stable colors.
 */
export default function AslStrip({
  currentSentence = '',
  liveTokens = [],
  lastTranscript = null,
  isCompact = false,
  prefs = {},
  signerName = '',
  signerId = null,
  signerAvatarColor = null,
  signerAvatarUrl = null,
  isFrozen = false,
}) {
  const fontSizePx = CAPTION_CONFIG.SIZES_PX[prefs.size] || CAPTION_CONFIG.SIZES_PX.l;
  const showNames = prefs.showNames !== false;
  const scrollRef = useRef(null);

  // Active displayed sign translation item
  const [activeSign, setActiveSign] = useState(null);
  const lastConsumedTranscriptIdRef = useRef(null);
  const wasFrozenRef = useRef(isFrozen);

  // 1. Ingest live sentence or live tokens
  useEffect(() => {
    const hasSentence = Boolean(currentSentence && currentSentence.trim().length > 0);
    const hasTokens = Boolean(liveTokens && liveTokens.length > 0);

    if (hasSentence || hasTokens) {
      const text = hasSentence ? currentSentence : liveTokens.map((t) => t.text).join(' ');
      setActiveSign({
        text,
        senderName: signerName || 'You',
        senderId: signerId || 'local',
        avatarColor: signerAvatarColor || null,
        avatarUrl: signerAvatarUrl || null,
        expiresAt: Date.now() + 6500,
        isFinal: hasSentence,
      });
    }
  }, [currentSentence, liveTokens, signerName, signerId, signerAvatarColor, signerAvatarUrl]);

  // 2. Ingest freshly committed transcript (only within 2s of creation)
  useEffect(() => {
    if (
      lastTranscript &&
      lastTranscript.id &&
      lastTranscript.text &&
      lastTranscript.id !== lastConsumedTranscriptIdRef.current
    ) {
      lastConsumedTranscriptIdRef.current = lastTranscript.id;
      const ageMs = Date.now() - (lastTranscript.timestamp || 0);
      if (ageMs < 2000) {
        setActiveSign({
          text: lastTranscript.text,
          senderName: lastTranscript.sender || signerName || 'Participant',
          senderId: lastTranscript.senderId || signerId || 'remote',
          avatarColor: lastTranscript.avatarColor || signerAvatarColor || null,
          avatarUrl: lastTranscript.avatarUrl || signerAvatarUrl || null,
          expiresAt: Date.now() + 6500,
          isFinal: true,
        });
      }
    }
  }, [lastTranscript, signerName, signerId, signerAvatarColor, signerAvatarUrl]);

  // 3. When unfreezing (mouse leaves), give a fresh 3s buffer if an item is currently shown
  useEffect(() => {
    if (wasFrozenRef.current && !isFrozen && activeSign) {
      setActiveSign((prev) => (prev ? { ...prev, expiresAt: Date.now() + 3000 } : null));
    }
    wasFrozenRef.current = isFrozen;
  }, [isFrozen, activeSign]);

  // 4. Periodic expiration check (every 400ms) - only active if not frozen
  useEffect(() => {
    if (isFrozen) return;

    const timer = setInterval(() => {
      const now = Date.now();
      setActiveSign((prev) => {
        if (!prev) return null;
        if (now >= prev.expiresAt) {
          return null; // Expired! Clean return to waiting state
        }
        return prev;
      });
    }, 400);

    return () => clearInterval(timer);
  }, [isFrozen]);

  // Auto-scroll to the newest line when text updates
  useEffect(() => {
    if (scrollRef.current && activeSign?.text) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeSign?.text]);

  // When no sign is active/recent, return null to keep UI completely clean
  if (!activeSign || !activeSign.text || !activeSign.text.trim()) {
    return null;
  }

  return (
    <div className="w-full flex items-start space-x-3 py-0.5 select-text animate-in fade-in duration-150">
      {/* Circular Signer Avatar */}
      <div className="mt-0.5 shrink-0 select-none">
        <ParticipantAvatar
          name={activeSign.senderName}
          id={activeSign.senderId}
          avatarColor={activeSign.avatarColor}
          avatarUrl={activeSign.avatarUrl}
          className="w-7 h-7 text-xs"
        />
      </div>

      {/* Signer Name + Content */}
      <div className="flex flex-col min-w-0 flex-1">
        {showNames && (
          <span className="text-xs text-slate-400 font-medium leading-tight mb-0.5 select-none">
            {activeSign.senderName}
          </span>
        )}

        {/* Scrollable text container: caps height and shows scrollbar on overflow */}
        <div
          ref={scrollRef}
          className="w-full max-h-[74px] overflow-y-auto pr-1.5 select-text transition-all scrollbar-thin scrollbar-thumb-white/20 hover:scrollbar-thumb-white/40"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255, 255, 255, 0.25) transparent',
          }}
        >
          <p
            className={`${
              activeSign.isFinal ? 'text-white font-normal' : 'text-slate-300 italic'
            } leading-snug break-words`}
            style={{ fontSize: `${fontSizePx}px` }}
          >
            {activeSign.text}
          </p>
        </div>
      </div>
    </div>
  );
}
