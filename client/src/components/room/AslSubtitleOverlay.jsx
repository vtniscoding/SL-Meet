import React from 'react';

/**
 * Semantic Component: Centered Solid Borderless ASL Subtitle Overlay Pill
 * Features solid dark background with 75% opacity, borderless styling, and white 'TRANSLATION' header.
 */
export default function AslSubtitleOverlay({ subtitleText = '' }) {
  const hasText = subtitleText && typeof subtitleText === 'string' && subtitleText.trim().length > 0;
  const displayText = hasText ? subtitleText : '....';

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none max-w-[88%] w-auto flex justify-center text-center transition-all duration-300">
      <div className="inline-flex flex-col items-center justify-center bg-black/75 text-white px-8 py-3.5 rounded-2xl shadow-2xl tracking-wide text-center min-w-[220px] border-none">
        {/* Top Centered Header Title: White Color & Bold */}
        <div className="text-xs md:text-sm font-bold uppercase tracking-widest text-white mb-1 select-none">
          TRANSLATION
        </div>

        {/* Centered Prominent Subtitle Output */}
        <div
          className={`text-lg md:text-xl leading-relaxed text-center ${
            hasText ? 'font-medium text-white' : 'font-mono text-slate-300 tracking-widest'
          }`}
        >
          {displayText}
        </div>
      </div>
    </div>
  );
}
