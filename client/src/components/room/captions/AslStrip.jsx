import React from 'react';
import {
  SignGestureIcon as Hand,
  AiTranslateIcon as Sparkles,
} from '../../../icons';
import { CAPTION_CONFIG } from '../../../config/captionConfig';

/**
 * AslStrip Component:
 * Real-time sign language translation strip tailored for NON_SIGNER participants,
 * and as a compact self-preview for SIGNER participants.
 * Displays:
 * 1. AI translation header
 * 2. Gesture tokens chip sequence (solid for committed tokens, dashed for pending tokens)
 * 3. Live assembled sentence
 * 4. Faded previous finalized sentence
 */
export default function AslStrip({
  currentSentence = '',
  liveTokens = [],
  lastTranscript = null,
  isCompact = false,
  prefs = {},
}) {
  const fontSizePx = CAPTION_CONFIG.SIZES_PX[prefs.size] || CAPTION_CONFIG.SIZES_PX.l;
  const hasSentence = currentSentence && currentSentence.trim().length > 0;
  const hasTokens = liveTokens && liveTokens.length > 0;

  // Signer self-preview mode
  if (isCompact) {
    return (
      <div className="w-full flex items-center justify-between py-1 px-2 rounded-lg bg-black/40 border border-white/5 text-xs">
        <div className="flex items-center space-x-1.5 text-[#C58AF9] font-medium">
          <Hand className="w-3.5 h-3.5" />
          <span>What others read:</span>
        </div>
        <div className="font-semibold text-white tracking-wide truncate max-w-[70%]">
          {hasSentence ? currentSentence : 'Signing preview active'}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col space-y-1.5 transition-all duration-200">
      {/* Top Header Badge */}
      <div className="flex items-center justify-between text-xs select-none">
        <div className="inline-flex items-center space-x-1.5 font-bold uppercase tracking-widest text-[#C58AF9]">
          <Hand className="w-3.5 h-3.5" />
          <span>AI translation</span>
          <span className="text-[10px] px-1 py-0.2 rounded bg-[#C58AF9]/20 text-[#C58AF9] border border-[#C58AF9]/30 lowercase">
            beta
          </span>
        </div>

        {/* Previous finalized sentence (faded reference) */}
        {lastTranscript?.text && (
          <div className="text-slate-400 truncate max-w-[50%] text-xs italic">
            <span>Last: "{lastTranscript.text}"</span>
          </div>
        )}
      </div>

      {/* Live Gesture Tokens Chip Row */}
      {hasTokens && (
        <div className="flex flex-wrap items-center gap-1.5 py-0.5">
          {liveTokens.map((token, idx) => {
            const isLastPending = idx === liveTokens.length - 1 && token.includes('...');
            return (
              <span
                key={`${token}-${idx}`}
                className={`px-2 py-0.5 rounded text-xs font-semibold tracking-wider transition-all select-none ${
                  isLastPending
                    ? 'border border-dashed border-[#C58AF9]/70 text-[#C58AF9] bg-transparent animate-pulse'
                    : 'bg-[#3C4043] text-slate-100 border border-white/5 shadow-sm'
                }`}
              >
                {token}
              </span>
            );
          })}
        </div>
      )}

      {/* Main Translated Sentence Output */}
      <div className="min-h-[32px] flex items-center">
        {hasSentence ? (
          <div
            className="text-white font-medium tracking-wide leading-relaxed break-words"
            style={{ fontSize: `${fontSizePx}px` }}
          >
            {currentSentence}
          </div>
        ) : (
          <div className="flex items-center space-x-2 text-slate-500 text-sm select-none py-1">
            <Sparkles className="w-3.5 h-3.5 opacity-60 text-[#C58AF9]" />
            <span>Waiting for signing...</span>
          </div>
        )}
      </div>
    </div>
  );
}
