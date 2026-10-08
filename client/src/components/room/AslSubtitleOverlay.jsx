import React from 'react';

/**
 * Semantic Component: Floating ASL Subtitle Overlay Pill
 */
export default function AslSubtitleOverlay({ subtitleText = 'Hello, how are you?' }) {
  return (
    <div className="absolute bottom-5 left-5 right-5 z-20 pointer-events-none">
      <div className="inline-block bg-black/65 backdrop-blur-md text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-2xl border border-white/15">
        ASL subtitle: <span className="font-normal text-slate-200">{subtitleText}</span>
      </div>
    </div>
  );
}
