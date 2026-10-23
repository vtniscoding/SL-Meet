import React from 'react';
import {
  MicOnIcon as Mic,
  LoadingSpinnerIcon as Loader2,
  VolumeIcon as Volume2,
} from '../../../icons';
import { CAPTION_CONFIG } from '../../../config/captionConfig';
import { colorForSender } from './captionUtils';

/**
 * SpeechLane Component:
 * Roll-up caption view tailored for SIGNER participants.
 * Anchors at the bottom, rolls older lines upward with top gradient fade,
 * and attributes speakers with distinct colors and mic icons.
 */
export default function SpeechLane({
  entries = [],
  prefs = {},
  speakingNames = [],
  sttStatus = 'ready',
  sttProgress = null,
}) {
  const fontSizePx = CAPTION_CONFIG.SIZES_PX[prefs.size] || CAPTION_CONFIG.SIZES_PX.l;
  const numRows = prefs.rows || 3;
  const showNames = prefs.showNames !== false;

  // Approximate fixed container height according to selected line count
  const laneHeight = `${fontSizePx * 1.45 * numRows + 12}px`;

  // Render empty / waiting state if no entries are active
  const renderEmptyState = () => {
    if (sttStatus === 'loading') {
      const percent = sttProgress?.progress ? Math.round(sttProgress.progress) : null;
      return (
        <div className="flex items-center space-x-2 text-slate-400 text-sm py-2">
          <Loader2 className="w-4 h-4 animate-spin text-[#8AB4F8]" />
          <span>Loading speech model{percent !== null ? ` (${percent}%)` : '...' }</span>
        </div>
      );
    }

    if (sttStatus === 'error') {
      return (
        <div className="flex items-center space-x-2 text-rose-400 text-sm py-2">
          <span>Speech captions temporarily unavailable</span>
        </div>
      );
    }

    if (speakingNames.length > 0) {
      return (
        <div className="flex items-center space-x-2 text-slate-300 text-sm py-2 animate-pulse">
          <Volume2 className="w-4 h-4 text-[#8AB4F8]" />
          <span>Listening to {speakingNames.join(', ')}...</span>
        </div>
      );
    }

    return (
      <div className="flex items-center space-x-2 text-slate-500 text-sm py-2 select-none">
        <Mic className="w-3.5 h-3.5 opacity-60" />
        <span>Listening for speech...</span>
      </div>
    );
  };

  const visibleEntries = entries.slice(-numRows);

  return (
    <div
      className="w-full flex flex-col justify-end overflow-hidden transition-all duration-200 select-text"
      style={{
        height: laneHeight,
        maskImage: 'linear-gradient(to bottom, transparent 0%, black 25%)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 25%)',
      }}
    >
      {visibleEntries.length === 0 ? (
        <div className="flex items-center justify-start h-full">
          {renderEmptyState()}
        </div>
      ) : (
        <div className="flex flex-col justify-end space-y-1.5 min-h-0">
          {visibleEntries.map((entry) => {
            const senderColor = colorForSender(entry.senderId);

            return (
              <div
                key={entry.id}
                className="flex items-baseline space-x-2 leading-relaxed transition-opacity duration-150"
                style={{ fontSize: `${fontSizePx}px` }}
              >
                {/* Speaker Attribution Badge */}
                {showNames && (
                  <span
                    className="inline-flex items-center space-x-1 shrink-0 font-semibold text-xs tracking-wider uppercase select-none px-1.5 py-0.5 rounded bg-black/40 border border-white/5"
                    style={{ color: senderColor }}
                  >
                    <Mic className="w-3 h-3" />
                    <span>{entry.senderName}</span>
                  </span>
                )}

                {/* Caption Text */}
                <span
                  className={`${
                    entry.isFinal
                      ? 'text-white font-medium'
                      : 'text-slate-400 italic'
                  } tracking-wide break-words`}
                >
                  {entry.text}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
