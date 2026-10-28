import React from 'react';
import MeetingVideoTile from './MeetingVideoTile';
import { ParticipantsDrawerIcon as Users } from '../../icons';

/**
 * Semantic Component: Zoom-Style Meeting Layout Engine
 * ---------------------------------------------------
 * Implements Zoom KB0063672 layouts:
 * 1. Speaker View ('spotlight' | 'speaker'):
 *    - 1 participant: Full maximized 16:9 stage.
 *    - 2 participants (1-on-1): Main remote speaker in full stage + local user in floating PiP.
 *    - 3+ participants: Top horizontal filmstrip of thumbnails + large Active Speaker / Pinned stage below.
 * 2. Gallery View ('tiled' | 'gallery'):
 *    - Tight Zoom-style 16:9 matrix (gap-2 / gap-2.5) with dynamic column distribution.
 * 3. Side-by-Side View ('sidebar'):
 *    - Main stage on the left (75%) + vertical stacked filmstrip on the right (25%).
 */
export default function MeetingLayoutEngine({
  participants,
  videoRef,
  localStream,
  layoutMode = 'tiled',
  pinnedId,
  onTogglePin,
  isAiEnabled,
  isHandTrackingEnabled,
  activeSignerId,
  subtitleText,
  speechCaptions = {},
  userRole = 'non_signer',
  isSttActive = false,
  onRegisterCanvas,
}) {
  const pinnedParticipant = participants?.find((p) => p.id === pinnedId);
  const activeSpeaker = participants?.find((p) => p.isSpeaking && !p.isMuted) || participants?.find((p) => p.isActiveSpeaker);
  const localParticipant = participants?.find((p) => p.isLocal) || participants?.[0];
  
  // Primary participant for Speaker/Sidebar views (pinned > active speaker > remote > first)
  const mainParticipant =
    pinnedParticipant ||
    activeSpeaker ||
    participants?.find((p) => !p.isLocal) ||
    participants?.[0];

  const getTileCaptionData = (_p) => null;

  if (!participants || participants.length === 0 || !mainParticipant) {
    return (
      <div className="w-full flex-1 flex items-center justify-center text-slate-400 font-sans text-sm">
        Initializing room participants...
      </div>
    );
  }

  const isSpeakerMode = layoutMode === 'spotlight' || layoutMode === 'speaker';
  const isSidebarMode = layoutMode === 'sidebar';

  // =========================================================================
  // Mode 1: Speaker View (Zoom Standard: KB0063672)
  // All secondary participant tiles are aligned in a top horizontal filmstrip,
  // with the main active speaker in the large stage below. No floating tiles.
  // =========================================================================
  if (isSpeakerMode) {
    const totalCount = participants.length;

    // 2+ Participants: Top Horizontal Filmstrip + Main Speaker Stage
    if (totalCount >= 2) {
      const filmstripParticipants = participants.filter((p) => p.id !== mainParticipant.id);

      return (
        <div className="w-full h-full flex-1 flex flex-col gap-2 overflow-hidden min-h-0">
          {/* Top Horizontal Filmstrip (Zoom Standard) */}
          <div className="h-20 sm:h-24 md:h-28 w-full flex items-center justify-center gap-2 overflow-x-auto px-2 py-1 shrink-0 custom-scrollbar">
            {filmstripParticipants.map((p) => (
              <div
                key={p.id}
                className="h-full aspect-video rounded-lg overflow-hidden shrink-0"
              >
                <MeetingVideoTile
                  participant={p}
                  videoRef={p.isLocal ? videoRef : null}
                  localStream={p.isLocal ? localStream : null}
                  isPinned={pinnedId === p.id}
                  onTogglePin={onTogglePin}
                  captionData={getTileCaptionData(p)}
                  isHandTrackingEnabled={p.isLocal ? isHandTrackingEnabled : false}
                  onRegisterCanvas={onRegisterCanvas}
                />
              </div>
            ))}
          </div>

          {/* Main Active Speaker / Pinned Stage */}
          <div className="flex-1 w-full min-h-0 flex items-center justify-center p-1 overflow-hidden">
            <div className="relative h-full max-h-full w-auto max-w-full aspect-video rounded-lg overflow-hidden flex items-center justify-center mx-auto">
              <MeetingVideoTile
                participant={mainParticipant}
                videoRef={mainParticipant.isLocal ? videoRef : null}
                localStream={mainParticipant.isLocal ? localStream : null}
                isPinned={pinnedId === mainParticipant.id}
                onTogglePin={onTogglePin}
                captionData={getTileCaptionData(mainParticipant)}
                isHandTrackingEnabled={mainParticipant.isLocal ? isHandTrackingEnabled : false}
                onRegisterCanvas={onRegisterCanvas}
              />
            </div>
          </div>
        </div>
      );
    }

    // Single Participant: Full Stage Centered
    return (
      <div className="w-full h-full flex-1 relative flex items-center justify-center p-1 overflow-hidden min-h-0">
        <div className="relative h-full max-h-full w-auto max-w-full aspect-video rounded-lg overflow-hidden flex items-center justify-center mx-auto">
          <MeetingVideoTile
            participant={mainParticipant}
            videoRef={mainParticipant.isLocal ? videoRef : null}
            localStream={mainParticipant.isLocal ? localStream : null}
            isPinned={pinnedId === mainParticipant.id}
            onTogglePin={onTogglePin}
            captionData={getTileCaptionData(mainParticipant)}
            isHandTrackingEnabled={mainParticipant.isLocal ? isHandTrackingEnabled : false}
            onRegisterCanvas={onRegisterCanvas}
          />
        </div>
      </div>
    );
  }

  // =========================================================================
  // Mode 2: Side-by-Side View (Zoom Standard)
  // =========================================================================
  if (isSidebarMode) {
    const sideParticipants = participants.filter((p) => p.id !== mainParticipant.id);
    const MAX_SIDEBAR_SLOTS = 6;
    const visibleSideParticipants = sideParticipants.slice(0, MAX_SIDEBAR_SLOTS);
    const hiddenCount = Math.max(0, sideParticipants.length - MAX_SIDEBAR_SLOTS);

    return (
      <div className="w-full h-full flex-1 grid grid-cols-12 gap-2.5 items-center overflow-hidden min-h-0">
        {/* Main Speaker / Presentation View (75% - 80% Width) */}
        <div className="col-span-8 lg:col-span-9 h-full min-h-0 flex items-center justify-center">
          <div className="relative h-full max-h-full w-auto max-w-full aspect-video rounded-lg overflow-hidden flex items-center justify-center">
            <MeetingVideoTile
              participant={mainParticipant}
              videoRef={mainParticipant.isLocal ? videoRef : null}
              localStream={mainParticipant.isLocal ? localStream : null}
              isPinned={pinnedId === mainParticipant.id}
              onTogglePin={onTogglePin}
              captionData={getTileCaptionData(mainParticipant)}
              isHandTrackingEnabled={mainParticipant.isLocal ? isHandTrackingEnabled : false}
              onRegisterCanvas={onRegisterCanvas}
            />
          </div>
        </div>

        {/* Side Participants Stack (20% - 25% Width) */}
        <div
          style={{ maxHeight: 'calc(80vh - var(--dock-h, 0px))' }}
          className="col-span-4 lg:col-span-3 flex flex-col gap-2 h-full overflow-y-auto justify-start items-center pr-1 custom-scrollbar"
        >
          {visibleSideParticipants.map((p) => (
            <div
              key={p.id}
              className="w-full aspect-video rounded-lg overflow-hidden shrink-0"
            >
              <MeetingVideoTile
                participant={p}
                videoRef={p.isLocal ? videoRef : null}
                localStream={p.isLocal ? localStream : null}
                isPinned={pinnedId === p.id}
                onTogglePin={onTogglePin}
                captionData={getTileCaptionData(p)}
                isHandTrackingEnabled={p.isLocal ? isHandTrackingEnabled : false}
                onRegisterCanvas={onRegisterCanvas}
              />
            </div>
          ))}

          {hiddenCount > 0 && (
            <div className="w-full py-2 bg-slate-800/80 rounded-lg text-center text-xs text-slate-300 font-medium flex items-center justify-center space-x-2 border border-slate-700 shrink-0">
              <Users className="w-3.5 h-3.5 text-slate-300" />
              <span>+ {hiddenCount} other participants</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // Mode 3: Gallery View (Zoom Standard: Equal 16:9 Matrix with gap-2)
  // =========================================================================
  const count = participants.length;

  let gridColsClass = 'grid-cols-1 max-w-4xl';
  let tileMaxHeightStyle = 'calc(75vh - var(--dock-h, 0px))';

  if (count === 2) {
    gridColsClass = 'grid-cols-2 max-w-5xl';
    tileMaxHeightStyle = 'calc(65vh - var(--dock-h, 0px))';
  } else if (count >= 3 && count <= 4) {
    gridColsClass = 'grid-cols-2 max-w-5xl';
    tileMaxHeightStyle = 'calc(38vh - (var(--dock-h, 0px) / 2))';
  } else if (count >= 5 && count <= 6) {
    gridColsClass = 'grid-cols-3 max-w-6xl';
    tileMaxHeightStyle = 'calc(36vh - (var(--dock-h, 0px) / 2))';
  } else if (count >= 7 && count <= 9) {
    gridColsClass = 'grid-cols-3 max-w-7xl';
    tileMaxHeightStyle = 'calc(36vh - (var(--dock-h, 0px) / 3))';
  } else if (count > 9) {
    gridColsClass = 'grid-cols-4 max-w-full';
    tileMaxHeightStyle = 'calc(26vh - (var(--dock-h, 0px) / 3))';
  }

  return (
    <div className="w-full h-full flex-1 flex items-center justify-center my-1 overflow-hidden min-h-0">
      <div className={`w-full ${gridColsClass} gap-2 sm:gap-2.5 items-center justify-center mx-auto grid`}>
        {participants.map((p) => (
          <div
            key={p.id}
            style={{ maxHeight: tileMaxHeightStyle }}
            className="w-full aspect-video rounded-lg overflow-hidden mx-auto flex items-center justify-center"
          >
            <MeetingVideoTile
              participant={p}
              videoRef={p.isLocal ? videoRef : null}
              localStream={p.isLocal ? localStream : null}
              isPinned={pinnedId === p.id}
              onTogglePin={onTogglePin}
              captionData={getTileCaptionData(p)}
              isHandTrackingEnabled={p.isLocal ? isHandTrackingEnabled : false}
              onRegisterCanvas={onRegisterCanvas}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
