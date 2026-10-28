import React, { useRef, useEffect, useMemo } from 'react';
import {
  MicOnIcon as Mic,
  LoadingSpinnerIcon as Loader2,
  VolumeIcon as Volume2,
} from '../../../icons';
import { CAPTION_CONFIG } from '../../../config/captionConfig';
import { colorForSender } from './captionUtils';

/**
 * SpeechLane Component:
 * Clean, Google Meet-style caption display (Image 3).
 * - Shows only circular avatar, user name, and content text.
 * - Groups consecutive sentences from the same speaker into a single flowing block.
 * - Caps at fixed max-height and adds automatic scrollbar on overflow without pushing UI up.
 */
export default function SpeechLane({
  entries = [],
  prefs = {},
  speakingNames = [],
  sttStatus = 'ready',
  sttProgress = null,
}) {
  const fontSizePx = CAPTION_CONFIG.SIZES_PX[prefs.size] || CAPTION_CONFIG.SIZES_PX.l;
  const showNames = prefs.showNames !== false;
  const scrollRef = useRef(null);

  const getInitial = (name) => {
    if (!name) return 'U';
    const clean = name.replace(/\s*\(You\)/i, '').replace(/\s*\(Presentation\)/i, '').trim();
    return clean ? clean.charAt(0).toUpperCase() : 'U';
  };

  // Group consecutive utterances by the same speaker so avatar and name are not duplicated (Image 3)
  const speakerGroups = useMemo(() => {
    const groups = [];
    entries.forEach((entry) => {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.senderId === entry.senderId) {
        lastGroup.texts.push(entry.text);
        lastGroup.isFinal = entry.isFinal;
        lastGroup.latestTimestamp = entry.timestamp;
      } else {
        groups.push({
          id: entry.id,
          senderId: entry.senderId,
          senderName: entry.senderName,
          texts: [entry.text],
          isFinal: entry.isFinal,
          latestTimestamp: entry.timestamp,
        });
      }
    });
    // Keep the most recent 1-2 speaker groups
    return groups.slice(-2);
  }, [entries]);

  // Auto-scroll to the newest line when text updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [speakerGroups]);

  // Render empty / waiting state if no entries are active
  const renderEmptyState = () => {
    if (sttStatus === 'loading') {
      const percent = sttProgress?.progress ? Math.round(sttProgress.progress) : null;
      return (
        <div className="flex items-center space-x-2 text-slate-400 text-xs py-1 select-none">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#8AB4F8]" />
          <span>Loading speech model{percent !== null ? ` (${percent}%)` : '...' }</span>
        </div>
      );
    }

    if (sttStatus === 'error') {
      return (
        <div className="flex items-center space-x-2 text-rose-400 text-xs py-1 select-none">
          <span>Speech captions temporarily unavailable</span>
        </div>
      );
    }

    if (speakingNames.length > 0) {
      return (
        <div className="flex items-center space-x-2 text-slate-300 text-xs py-1 animate-pulse select-none">
          <Volume2 className="w-3.5 h-3.5 text-[#8AB4F8]" />
          <span>Listening to {speakingNames.join(', ')}...</span>
        </div>
      );
    }

    return (
      <div className="flex items-center space-x-2 text-slate-500 text-xs py-1 select-none">
        <Mic className="w-3.5 h-3.5 opacity-60" />
        <span>Listening for speech...</span>
      </div>
    );
  };

  if (speakerGroups.length === 0) {
    return (
      <div className="flex items-center justify-start py-0.5">
        {renderEmptyState()}
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col justify-end space-y-2 select-text">
      {speakerGroups.map((group) => {
        const senderColor = colorForSender(group.senderId);
        const initial = getInitial(group.senderName);
        const combinedText = group.texts.join(' ');

        return (
          <div
            key={group.id}
            className="flex items-start space-x-3 transition-opacity duration-150 py-0.5"
          >
            {/* Circular Avatar */}
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5 shadow-xs select-none"
              style={{ backgroundColor: senderColor }}
            >
              {initial}
            </div>

            {/* Name + Text Container */}
            <div className="flex flex-col min-w-0 flex-1">
              {showNames && (
                <span className="text-xs text-slate-400 font-medium leading-tight mb-0.5 select-none">
                  {group.senderName}
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
                    group.isFinal
                      ? 'text-white font-normal'
                      : 'text-slate-300 italic'
                  } leading-snug break-words`}
                  style={{ fontSize: `${fontSizePx}px` }}
                >
                  {combinedText}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
