import React from 'react';

/**
 * Semantic Component: Centered Solid Borderless ASL Subtitle Overlay Pill
 * Features solid dark background with 75% opacity, borderless styling, and white 'TRANSLATION' header.
 */
export default function AslSubtitleOverlay({ subtitleText = '' }) {
  const hasText = subtitleText && typeof subtitleText === 'string' && subtitleText.trim().length > 0;
  const displayText = hasText ? subtitleText : '....';

  return (
    <div className="absolute bottom-8 md:bottom-10 left-1/2 -translate-x-1/2 z-20 pointer-events-none max-w-[92%] sm:max-w-[75%] w-auto flex justify-center text-center transition-all duration-300">
      <div className="inline-flex flex-col items-center justify-center bg-black/80 backdrop-blur-md text-white px-6 sm:px-8 py-2.5 sm:py-3 rounded-2xl shadow-2xl tracking-wide text-center min-w-[200px] border border-white/10">
        {/* Top Centered Header Title: High-Contrast & Compact */}
        <div className="text-[11px] md:text-xs font-bold uppercase tracking-widest text-slate-300 mb-0.5 select-none">
          TRANSLATION
        </div>

        {/* Centered Prominent Subtitle Output */}
        <div
          className={`text-base md:text-lg lg:text-xl leading-relaxed text-center ${
            hasText ? 'font-medium text-white' : 'font-mono text-slate-400 tracking-widest'
          }`}
        >
          {displayText}
        </div>
      </div>
    </div>
  );
}
