import React, { useEffect, useRef } from 'react';
import {
  CloseIcon as X,
  ResetSettingsIcon as RotateCcw,
  TextFontIcon as Type,
  HandTrackingOnIcon as Eye,
  TextAlignLeftIcon as AlignLeft,
} from '../../../icons';

/**
 * CaptionSettingsPopover Component:
 * Instant customization popover for Caption Dock (Font Size, Rows, Opacity, Show Names).
 * Closes on Esc or outside click.
 */
export default function CaptionSettingsPopover({
  isOpen = false,
  onClose,
  prefs = {},
  onPrefsChange,
  onResetPrefs,
}) {
  const popoverRef = useRef(null);

  // Close on outside click or Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={popoverRef}
      className="absolute bottom-16 right-0 z-50 w-72 sm:w-80 p-4 rounded-2xl bg-[#202124] border border-white/10 shadow-2xl text-white select-none transition-all duration-150 animate-in fade-in slide-in-from-bottom-2"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
          Caption Preferences
        </h4>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          title="Close"
          aria-label="Close preferences"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-4 pt-3.5 text-xs">
        {/* Font Size Selection */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-slate-300 font-medium">
            <span className="flex items-center space-x-1.5">
              <Type className="w-3.5 h-3.5 text-[#8AB4F8]" />
              <span>Font Size</span>
            </span>
            <span className="text-[11px] text-slate-400 uppercase">
              {prefs.size === 'm' ? 'Medium (20px)' : prefs.size === 'xl' ? 'Extra Large (28px)' : 'Large (24px)'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-black/40 border border-white/5">
            {[
              { id: 'm', label: 'Medium' },
              { id: 'l', label: 'Large' },
              { id: 'xl', label: 'X-Large' },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => onPrefsChange({ size: s.id })}
                className={`py-1.5 rounded-lg font-medium transition-all ${
                  prefs.size === s.id
                    ? 'bg-[#8AB4F8] text-[#202124] shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Rows Selection */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-slate-300 font-medium">
            <span className="flex items-center space-x-1.5">
              <AlignLeft className="w-3.5 h-3.5 text-[#8AB4F8]" />
              <span>Visible Lines</span>
            </span>
            <span className="text-[11px] text-slate-400">{prefs.rows || 3} lines</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-black/40 border border-white/5">
            {[2, 3, 4].map((r) => (
              <button
                key={r}
                onClick={() => onPrefsChange({ rows: r })}
                className={`py-1.5 rounded-lg font-medium transition-all ${
                  (prefs.rows || 3) === r
                    ? 'bg-[#8AB4F8] text-[#202124] shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {r} Lines
              </button>
            ))}
          </div>
        </div>

        {/* Background Opacity Slider */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-slate-300 font-medium">
            <span className="flex items-center space-x-1.5">
              <Eye className="w-3.5 h-3.5 text-[#8AB4F8]" />
              <span>Background Opacity</span>
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              {Math.round((prefs.opacity ?? 0.85) * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0.6"
            max="1.0"
            step="0.05"
            value={prefs.opacity ?? 0.85}
            onChange={(e) => onPrefsChange({ opacity: parseFloat(e.target.value) })}
            className="w-full accent-[#8AB4F8] cursor-pointer"
          />
        </div>

        {/* Show Names Toggle */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-slate-300 font-medium">Show speaker names</span>
          <button
            onClick={() => onPrefsChange({ showNames: !prefs.showNames })}
            className={`w-10 h-5 rounded-full p-0.5 transition-colors ${
              prefs.showNames !== false ? 'bg-[#8AB4F8]' : 'bg-[#3C4043]'
            }`}
            role="switch"
            aria-checked={prefs.showNames !== false}
            aria-label="Toggle speaker names"
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform ${
                prefs.showNames !== false ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Reset to Defaults */}
        <div className="pt-2 border-t border-white/10 flex justify-end">
          <button
            onClick={onResetPrefs}
            className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors py-1 px-2 rounded-lg hover:bg-white/5"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset to defaults</span>
          </button>
        </div>
      </div>
    </div>
  );
}
