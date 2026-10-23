import React from 'react';
import {
  SettingsIcon as Settings,
  TranscriptFileIcon as FileText,
  TextFontIcon as Type,
} from '../../../icons';

/**
 * DockFooter Component:
 * Clean, compact bottom bar inside CaptionDock.
 * Provides live telemetry status on the left and quick utility actions (Aa size, History, Settings) on the right.
 */
export default function DockFooter({
  role = 'signer',
  isSttEnabled = false,
  isAiEnabled = false,
  sttStatus = 'ready',
  onOpenSettings,
  onOpenHistory,
  historyCount = 0,
  prefs = {},
}) {
  const isSigner = role === 'signer';

  return (
    <div className="w-full flex items-center justify-between pt-2 mt-1 border-t border-white/10 text-xs text-slate-400 select-none">
      {/* Left: System Status Telemetry */}
      <div className="flex items-center space-x-2 truncate max-w-[60%]">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
        <span className="text-[11px] text-slate-400 truncate">
          {isSigner
            ? sttStatus === 'loading'
              ? 'Initializing Whisper STT...'
              : isSttEnabled
              ? 'Voice captions active (English)'
              : 'Voice captions paused'
            : isAiEnabled
            ? 'ASL AI translation active'
            : 'ASL translation paused'}
        </span>
      </div>

      {/* Right: Actions (Aa Quick Size, History Drawer, Settings Popover) */}
      <div className="flex items-center space-x-1 shrink-0">
        {/* Quick Font Size Switcher Indicator */}
        <button
          onClick={onOpenSettings}
          className="flex items-center space-x-1 px-2 py-1 rounded-lg hover:bg-white/10 hover:text-white transition-colors text-[11px]"
          title="Change caption font size"
          aria-label="Change caption font size"
        >
          <Type className="w-3.5 h-3.5 text-[#8AB4F8]" />
          <span className="font-semibold uppercase">{prefs.size || 'L'}</span>
        </button>

        {/* Caption History Drawer Toggle Button */}
        <button
          onClick={onOpenHistory}
          className="relative flex items-center space-x-1 px-2 py-1 rounded-lg hover:bg-white/10 hover:text-white transition-colors text-[11px]"
          title="Open transcript history"
          aria-label="Open transcript history"
        >
          <FileText className="w-3.5 h-3.5 text-slate-300" />
          <span>History</span>
          {historyCount > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-slate-300 border border-white/10 font-mono">
              {historyCount}
            </span>
          )}
        </button>

        {/* Caption Preferences / Settings Button */}
        <button
          onClick={onOpenSettings}
          className="p-1 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
          title="Caption preferences"
          aria-label="Caption preferences"
        >
          <Settings className="w-3.5 h-3.5 text-slate-300" />
        </button>
      </div>
    </div>
  );
}
