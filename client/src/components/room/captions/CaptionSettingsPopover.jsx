import React, { useEffect, useRef } from 'react';
import {
  CloseIcon as X,
  ResetSettingsIcon as RotateCcw,
  TtFontSizeIcon,
} from '../../../icons';
import { CAPTION_CONFIG } from '../../../config/captionConfig';

/**
 * CaptionSettingsPopover Component:
 * Instant font size customization popover for Caption Dock.
 * Features:
 * - Medium (20px), Large (24px - Default), X-Large (28px).
 * - Live preview of the caption text size.
 * - Floating cleanly above the caption bar.
 * - Closes on Esc or outside click.
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

  const currentSizeKey = prefs.size || 'l';
  const previewFontSizePx = CAPTION_CONFIG.SIZES_PX[currentSizeKey] || CAPTION_CONFIG.SIZES_PX.l;

  return (
    <div
      ref={popoverRef}
      className="absolute bottom-full mb-2 right-2 z-50 w-72 sm:w-80 p-3.5 rounded-xl bg-[#202124] border border-white/15 shadow-2xl text-white select-none transition-all duration-150 animate-in fade-in slide-in-from-bottom-2"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
        <div className="flex items-center space-x-1.5">
          <TtFontSizeIcon className="w-4 h-4 text-[#8AB4F8]" />
          <h4 className="text-xs font-semibold tracking-wide text-slate-200">
            Caption Font Size
          </h4>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          title="Close"
          aria-label="Close preferences"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-3 pt-3 text-xs">
        {/* Font Size Button Grid */}
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-black/40 border border-white/5">
          {[
            { id: 'm', label: 'Medium', desc: '20px' },
            { id: 'l', label: 'Large', desc: '24px' },
            { id: 'xl', label: 'X-Large', desc: '28px' },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => onPrefsChange?.({ size: s.id })}
              className={`py-1.5 rounded-lg flex flex-col items-center justify-center transition-all ${
                currentSizeKey === s.id
                  ? 'bg-[#8AB4F8] text-[#202124] shadow-sm font-semibold'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <span className="font-medium text-xs">{s.label}</span>
              <span className="text-[10px] opacity-75">{s.desc}</span>
            </button>
          ))}
        </div>

        {/* Live Preview Box */}
        <div className="p-2.5 rounded-lg bg-black/50 border border-white/10 flex flex-col justify-center min-h-[52px]">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">
            Preview
          </span>
          <p
            className="text-white leading-tight break-words transition-all duration-150"
            style={{ fontSize: `${previewFontSizePx}px` }}
          >
            Sample caption text
          </p>
        </div>

        {/* Footer: Reset to Defaults */}
        <div className="pt-2 border-t border-white/10 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Default: Large (24px)
          </span>
          <button
            onClick={onResetPrefs}
            className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white transition-colors py-1 px-2 rounded-lg hover:bg-white/10 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3 text-slate-400" />
            <span>Reset</span>
          </button>
        </div>
      </div>
    </div>
  );
}
