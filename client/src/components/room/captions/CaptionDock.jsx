import React, { useRef, useEffect, useState, useMemo } from 'react';
import SpeechLane from './SpeechLane';
import AslStrip from './AslStrip';
import CaptionSettingsPopover from './CaptionSettingsPopover';
import { useCaptionFeed } from '../../../hooks/useCaptionFeed';
import {
  GlobeIcon,
  TtFontSizeIcon,
  ChevronDownIcon,
  CheckmarkIcon,
} from '../../../icons';
import { ROLES } from '../../../constants/roles';

/**
 * CaptionDock Component:
 * Clean, seamless subtitle stage matching Google Meet (Image 3).
 * - Displays purely: Avatar, User Name, and Content Text without unnecessary tags.
 * - Stable dock height to prevent video jumping.
 * - Subtle hover actions for History and Settings.
 */
function CaptionDockComponent({
  role = 'non_signer',
  prefs = {},
  onPrefsChange,
  onResetPrefs,
  isSttEnabled = false,
  isAiEnabled = false,
  isHandTrackingEnabled = false,
  sttStatus = 'ready',
  sttProgress = null,
  speechCaptions = {},
  currentSentence = '',
  liveTokens = [],
  transcriptLogs = [],
  speechLogs = [],
  speakingNames = [],
  signerName = 'Signer',
  onSwitchMode,
}) {
  const dockRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
  const modeDropdownRef = useRef(null);

  const isSigner = role === ROLES.SIGNER;
  const currentMode = isSigner ? 'STT' : 'SLT';
  const fullModeLabel =
    currentMode === 'SLT'
      ? 'SLT (Sign Language Translate)'
      : 'STT (Speech To Text)';

  // Close mode dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (modeDropdownRef.current && !modeDropdownRef.current.contains(e.target)) {
        setIsModeDropdownOpen(false);
      }
    };
    if (isModeDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isModeDropdownOpen]);

  // Role display policy:
  // SIGNER: toggled via Captions button (isSttEnabled)
  // NON_SIGNER: toggled via SL Subtitles button (isAiEnabled)
  const shouldRender = isSigner ? isSttEnabled : isAiEnabled;

  // Track hover or keyboard focus to freeze caption expiration
  const isFrozen = isHovered || isFocused;

  // Ingest rolling speech captions feed (active for Signer)
  const speechEntries = useCaptionFeed(isSigner && isSttEnabled ? speechCaptions : {}, {
    frozen: isFrozen,
  });

  // Most recent finalized ASL transcript entry
  const lastAslTranscript = useMemo(() => {
    for (let i = transcriptLogs.length - 1; i >= 0; i--) {
      if (transcriptLogs[i].type === 'ASL') return transcriptLogs[i];
    }
    return null;
  }, [transcriptLogs]);

  // Set stable dock height when captions are active to completely prevent UI jumping
  useEffect(() => {
    if (!shouldRender) {
      document.documentElement.style.setProperty('--dock-h', '0px');
      return;
    }

    document.documentElement.style.setProperty('--dock-h', '104px');

    return () => {
      document.documentElement.style.setProperty('--dock-h', '0px');
    };
  }, [shouldRender]);

  if (!shouldRender) {
    return null;
  }

  return (
    <div
      ref={dockRef}
      data-caption-ui="true"
      role="log"
      aria-label="Live meeting captions"
      aria-live="off"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      className="w-full shrink-0 px-3 md:px-5 py-1 z-20 select-text flex flex-col justify-end transition-all duration-150 relative group/captions"
    >
      {/* 1. Dedicated Top Header Row (Google Meet Style: Mode Pill on Left, Font Size on Right) */}
      <div className="w-full flex items-center justify-between mb-1.5 select-none relative z-30">
        {/* Left: Mode Selector Pill & Dropdown (Google Meet Border Pill Style) */}
        <div className="relative" ref={modeDropdownRef}>
          <button
            type="button"
            onClick={() => setIsModeDropdownOpen((prev) => !prev)}
            className="h-7 px-3 rounded-full bg-transparent hover:bg-white/10 active:bg-white/15 text-slate-200 hover:text-white text-xs font-medium flex items-center space-x-2 transition-all cursor-pointer outline-none border border-white/20 hover:border-white/30 shadow-xs"
            title="Switch subtitle mode"
          >
            <GlobeIcon className="w-3.5 h-3.5 text-slate-300 shrink-0" />
            <span className="tracking-tight">{fullModeLabel}</span>
            <ChevronDownIcon
              className={`w-3 h-3 text-slate-400 transition-transform duration-150 ${
                isModeDropdownOpen ? 'rotate-180 text-white' : ''
              }`}
            />
          </button>

          {isModeDropdownOpen && (
            <div className="absolute bottom-full mb-1.5 left-0 w-64 bg-[#1E1F22] border border-white/15 rounded-xl shadow-2xl p-1 z-50 text-xs text-slate-200 animate-in fade-in duration-100">
              <button
                type="button"
                onClick={() => {
                  if (currentMode !== 'SLT' && onSwitchMode) {
                    onSwitchMode(ROLES.NON_SIGNER);
                  }
                  setIsModeDropdownOpen(false);
                }}
                className={`w-full px-3 py-2 rounded-lg flex items-center justify-between transition-colors cursor-pointer outline-none ${
                  currentMode === 'SLT'
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span>SLT (Sign Language Translate)</span>
                {currentMode === 'SLT' && <CheckmarkIcon className="w-3.5 h-3.5 text-[#8AB4F8]" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (currentMode !== 'STT' && onSwitchMode) {
                    onSwitchMode(ROLES.SIGNER);
                  }
                  setIsModeDropdownOpen(false);
                }}
                className={`w-full px-3 py-2 rounded-lg flex items-center justify-between transition-colors cursor-pointer outline-none ${
                  currentMode === 'STT'
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span>STT (Speech To Text)</span>
                {currentMode === 'STT' && <CheckmarkIcon className="w-3.5 h-3.5 text-[#8AB4F8]" />}
              </button>
            </div>
          )}
        </div>

        {/* Right: Clearly visible, high-contrast TT Font Size Button */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setIsSettingsOpen((prev) => !prev)}
            className="w-7 h-7 rounded-md flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/15 active:bg-white/20 transition-all cursor-pointer outline-none"
            title="Caption font size"
            aria-label="Caption font size"
          >
            <TtFontSizeIcon className="w-4 h-4 text-slate-200 hover:text-white" />
          </button>
        </div>
      </div>

      {/* Main Subtitle Content Stage: Pure Avatar + Name + Text (Image 3) */}
      {isSigner ? (
        <div className="flex flex-col space-y-1 w-full">
          {isSttEnabled && (
            <SpeechLane
              entries={speechEntries}
              prefs={prefs}
              speakingNames={speakingNames}
              sttStatus={sttStatus}
              sttProgress={sttProgress}
            />
          )}

          {/* Self-preview for Signer when hand tracking is active */}
          {isHandTrackingEnabled && (
            <AslStrip
              currentSentence={currentSentence}
              liveTokens={liveTokens}
              isCompact={true}
              prefs={prefs}
              signerName={signerName}
            />
          )}
        </div>
      ) : (
        isAiEnabled && (
          <AslStrip
            currentSentence={currentSentence}
            liveTokens={liveTokens}
            lastTranscript={lastAslTranscript}
            isCompact={false}
            prefs={prefs}
            signerName={signerName}
          />
        )
      )}

      {/* Settings Popover */}
      <CaptionSettingsPopover
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        prefs={prefs}
        onPrefsChange={onPrefsChange}
        onResetPrefs={onResetPrefs}
      />
    </div>
  );
}

export const CaptionDock = React.memo(CaptionDockComponent);
export default CaptionDock;
