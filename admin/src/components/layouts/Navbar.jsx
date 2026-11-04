import React from 'react';
import { TitleBar } from '@sl-meet/shared';

export const NAV_ITEMS = [
  { id: 'training', label: 'Data Labeling' },
  { id: 'dataset', label: 'Dataset' },
  { id: 'monitoring', label: 'Monitoring' },
  { id: 'nlp', label: 'Natural Language Processing' },
];

/**
 * Top Navbar with Direct Pill Buttons & Frameless TitleBar Controls
 * Clean, minimal borderless design on deep black #000000 canvas.
 */
export default function Navbar({
  activeTab = 'training',
  onTabChange,
}) {
  return (
    <div
      className="w-full bg-[#000000] px-4 py-2.5 flex items-center justify-between shrink-0 select-none z-40"
      style={{ WebkitAppRegion: 'drag' }}
    >
      {/* Navigation Button Group - Direct pill buttons without sliding effect or halo */}
      <div
        className="inline-flex items-center gap-2 bg-transparent"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        {NAV_ITEMS.map((item) => {
          const isItemActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange?.(item.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors duration-150 outline-none focus:outline-none cursor-pointer border ${
                isItemActive
                  ? 'bg-[#28292D] text-white font-semibold border-white/10 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-[#28292D]/75 border-transparent hover:border-white/10'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Top-Right Frameless Window Controls */}
      <div
        className="flex items-center"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        <TitleBar dark={true} />
      </div>
    </div>
  );
}

