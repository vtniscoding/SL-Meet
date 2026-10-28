import React, { useRef, useEffect } from 'react';
import { CAPTION_CONFIG } from '../../../config/captionConfig';

/**
 * AslStrip Component:
 * Clean, Google Meet-style sign language translation display (Image 3).
 * - Shows only circular avatar, user name, and content text without unnecessary tags (no "Signing" badge).
 * - Scrollable text container with automatic scrollbar on overflow without pushing UI up.
 */
export default function AslStrip({
  currentSentence = '',
  liveTokens = [],
  lastTranscript = null,
  isCompact = false,
  prefs = {},
  signerName = 'Signer',
}) {
  const fontSizePx = CAPTION_CONFIG.SIZES_PX[prefs.size] || CAPTION_CONFIG.SIZES_PX.l;
  const hasSentence = currentSentence && currentSentence.trim().length > 0;
  const hasTokens = liveTokens && liveTokens.length > 0;
  const scrollRef = useRef(null);

  const getInitial = (name) => {
    if (!name) return 'S';
    const clean = name.replace(/\s*\(You\)/i, '').replace(/\s*\(Presentation\)/i, '').trim();
    return clean ? clean.charAt(0).toUpperCase() : 'S';
  };

  const displayText = hasSentence
    ? currentSentence
    : hasTokens
    ? liveTokens.map((t) => t.text).join(' ')
    : lastTranscript?.text || '';

  // Auto-scroll to the newest line when text updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayText]);

  const initial = getInitial(signerName);

  return (
    <div className="w-full flex items-start space-x-3 py-0.5 select-text">
      {/* Circular Signer Avatar */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5 shadow-xs select-none bg-[#C58AF9]"
      >
        {initial}
      </div>

      {/* Signer Name + Content */}
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-xs text-slate-400 font-medium leading-tight mb-0.5 select-none">
          {signerName}
        </span>

        {/* Scrollable text container: caps height and shows scrollbar on overflow */}
        <div
          ref={scrollRef}
          className="w-full max-h-[74px] overflow-y-auto pr-1.5 select-text transition-all scrollbar-thin scrollbar-thumb-white/20 hover:scrollbar-thumb-white/40"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255, 255, 255, 0.25) transparent',
          }}
        >
          {displayText ? (
            <p
              className="text-white font-normal leading-snug break-words"
              style={{ fontSize: `${fontSizePx}px` }}
            >
              {displayText}
            </p>
          ) : (
            <p className="text-slate-500 text-xs italic py-0.5 select-none">
              Waiting for sign gestures...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
