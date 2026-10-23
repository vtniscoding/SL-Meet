import React, { useRef, useEffect, useState, useMemo } from 'react';
import SpeechLane from './SpeechLane';
import AslStrip from './AslStrip';
import DockFooter from './DockFooter';
import CaptionSettingsPopover from './CaptionSettingsPopover';
import { useCaptionFeed } from '../../../hooks/useCaptionFeed';

/**
 * CaptionDock Component:
 * Dedicated, accessible caption lane anchored between <main> video stage and <MeetingControlBar>.
 * Measures own height via ResizeObserver and sets CSS custom property --dock-h
 * to ensure video tiles scale seamlessly without overflow cutoff.
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
  onOpenHistory,
}) {
  const dockRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const isSigner = role === 'signer';

  // Role display policy:
  // Directly toggled via the controller's subtitle button:
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

  const totalHistoryCount = (transcriptLogs?.length || 0) + (speechLogs?.length || 0);

  // ResizeObserver to dynamically update --dock-h on root HTML element
  useEffect(() => {
    if (!shouldRender || !dockRef.current) {
      document.documentElement.style.setProperty('--dock-h', '0px');
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.target.offsetHeight;
        // Include bottom margin in dock height calculation
        const totalDockHeight = height > 0 ? height + 10 : 0;
        document.documentElement.style.setProperty('--dock-h', `${totalDockHeight}px`);
      }
    });

    observer.observe(dockRef.current);

    return () => {
      observer.disconnect();
      document.documentElement.style.setProperty('--dock-h', '0px');
    };
  }, [shouldRender]);

  if (!shouldRender) {
    return null;
  }

  const bgOpacity = prefs.opacity ?? 0.85;

  return (
    <div
      ref={dockRef}
      data-caption-ui="true"
      role="log"
      aria-label="Live meeting captions and translation dock"
      aria-live="off"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      className="relative w-full max-w-4xl mx-auto shrink-0 rounded-2xl border border-white/10 px-4 py-3 mb-1.5 shadow-2xl transition-all duration-200 z-30"
      style={{
        backgroundColor: `rgba(18, 18, 18, ${bgOpacity})`,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {/* Signer View: Speech Lane (Roll-up voice captions) + Optional compact self-preview */}
      {isSigner && (
        <div className="flex flex-col space-y-1.5 w-full">
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
            />
          )}
        </div>
      )}

      {/* Non-Signer View: ASL Strip (AI Translation with Gesture Chips & Live Sentence) */}
      {!isSigner && isAiEnabled && (
        <AslStrip
          currentSentence={currentSentence}
          liveTokens={liveTokens}
          lastTranscript={lastAslTranscript}
          isCompact={false}
          prefs={prefs}
        />
      )}

      {/* Shared Footer Telemetry & Quick Action Bar */}
      <DockFooter
        role={role}
        isSttEnabled={isSttEnabled}
        isAiEnabled={isAiEnabled}
        sttStatus={sttStatus}
        onOpenSettings={() => setIsSettingsOpen((prev) => !prev)}
        onOpenHistory={onOpenHistory}
        historyCount={totalHistoryCount}
        prefs={prefs}
      />

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
