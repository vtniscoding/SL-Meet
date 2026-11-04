import React, { useRef, useEffect, useState, useMemo } from 'react';
import SpeechLane from './SpeechLane';
import AslStrip from './AslStrip';
import CaptionSettingsPopover from './CaptionSettingsPopover';
import { useCaptionFeed } from '../../hooks/useCaptionFeed';
import {
  HandsIcon,
  AudioLinesIcon,
  TtFontSizeIcon,
  ChevronDownIcon,
  CheckmarkIcon,
} from '@sl-meet/shared/icons';
import { ROLES } from '@sl-meet/shared/constants';

/**
 * CaptionDock Component:
 * Clean, seamless subtitle stage matching Google Meet (Image 3).
 * - Displays purely: Avatar, User Name, and Content Text without unnecessary tags.
 * - Completely separates STT (Speech to Text) and SLT (Sign Language Translation).
 *   - STT mode: Shows ONLY speech captions from any participant speaking via mic.
 *   - SLT mode: Shows ONLY sign language translations from any participant signing via AI Vision.
 * - Stable dock height to prevent video jumping.
 */
function CaptionDockComponent({
  role = 'non_signer',
  captionMode = null, // 'STT' | 'SLT'
  isCaptionsEnabled = false,
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
  signerName = '',
  signerId = null,
  signerAvatarColor = null,
  signerAvatarUrl = null,
  onSwitchMode,
}) {
  const dockRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
  const modeDropdownRef = useRef(null);

  // Determine current active mode: prefer explicit captionMode, fallback to role mapping
  const currentMode = captionMode || (role === ROLES.SIGNER ? 'STT' : 'SLT');
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

  // Master caption display visibility
  const shouldRender = isCaptionsEnabled || (role === ROLES.SIGNER ? isSttEnabled : isAiEnabled);

  // Track hover or keyboard focus to freeze caption expiration
  const isFrozen = isHovered || isFocused;

  // Ingest rolling speech captions feed (active when in STT mode)
  const speechEntries = useCaptionFeed(shouldRender && currentMode === 'STT' ? speechCaptions : {}, {
    frozen: isFrozen,
  });

  // Most recent finalized ASL transcript entry
  const lastAslTranscript = useMemo(() => {
    for (let i = transcriptLogs.length - 1; i >= 0; i--) {
      if (transcriptLogs[i].type === 'ASL') return transcriptLogs[i];
    }
    return null;
  }, [transcriptLogs]);

  // Set stable dock height when captions are active to prevent video jumping
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
            {currentMode === 'SLT' ? (
              <HandsIcon className="w-3.5 h-3.5 text-slate-300 shrink-0" />
            ) : (
              <AudioLinesIcon className="w-3.5 h-3.5 text-slate-300 shrink-0" />
            )}
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
                    onSwitchMode('SLT');
                  }
                  setIsModeDropdownOpen(false);
                }}
                className={`w-full px-3 py-2 rounded-lg flex items-center justify-between transition-colors cursor-pointer outline-none ${
                  currentMode === 'SLT'
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <HandsIcon className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                  <span>SLT (Sign Language Translate)</span>
                </div>
                {currentMode === 'SLT' && <CheckmarkIcon className="w-3.5 h-3.5 text-[#8AB4F8]" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (currentMode !== 'STT' && onSwitchMode) {
                    onSwitchMode('STT');
                  }
                  setIsModeDropdownOpen(false);
                }}
                className={`w-full px-3 py-2 rounded-lg flex items-center justify-between transition-colors cursor-pointer outline-none ${
                  currentMode === 'STT'
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <AudioLinesIcon className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                  <span>STT (Speech To Text)</span>
                </div>
                {currentMode === 'STT' && <CheckmarkIcon className="w-3.5 h-3.5 text-[#8AB4F8]" />}
              </button>
            </div>
          )}
        </div>

        {/* Right: Clearly visible, high-contrast TT Font Size Button */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setIsSettingsOpen((prev) => !prev)}
            className="w-8 h-8 rounded-md flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/15 active:bg-white/20 transition-all cursor-pointer outline-none"
            title="Caption font size"
            aria-label="Caption font size"
          >
            <TtFontSizeIcon className="w-5 h-5 text-slate-200 hover:text-white shrink-0" size={20} />
          </button>
        </div>
      </div>

      {/* Main Subtitle Content Stage:
          Completely decoupled:
          - STT: ONLY SpeechLane (voice transcript from any mic)
          - SLT: ONLY AslStrip (ASL translation from any signer)
      */}
      <div className="w-full">
        {currentMode === 'STT' ? (
          <SpeechLane
            entries={speechEntries}
            prefs={prefs}
            speakingNames={speakingNames}
            sttStatus={sttStatus}
            sttProgress={sttProgress}
          />
        ) : (
          <AslStrip
            currentSentence={currentSentence}
            liveTokens={liveTokens}
            lastTranscript={lastAslTranscript}
            isCompact={false}
            prefs={prefs}
            signerName={signerName}
            signerId={signerId}
            signerAvatarColor={signerAvatarColor}
            signerAvatarUrl={signerAvatarUrl}
            isFrozen={isFrozen}
          />
        )}
      </div>

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
