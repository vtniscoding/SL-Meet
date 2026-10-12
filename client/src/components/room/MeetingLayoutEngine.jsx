import React from 'react';
import MeetingVideoTile from './MeetingVideoTile';
import { Users } from 'lucide-react';

/**
 * Semantic Component: Google Meet Layout Engine (tiled, sidebar, spotlight with floating stream & max 6 sidebar slots)
 */
export default function MeetingLayoutEngine({
  participants,
  videoRef,
  localStream,
  layoutMode,
  pinnedId,
  onTogglePin,
  isAiEnabled,
  isHandTrackingEnabled,
  activeSignerId,
  subtitleText,
  onRegisterCanvas,
}) {
  const pinnedParticipant = participants.find((p) => p.id === pinnedId);
  const mainParticipant = pinnedParticipant || participants.find((p) => p.isActiveSpeaker) || participants[0];
  const localParticipant = participants.find((p) => p.isLocal) || participants[0];

  // Determine whether subtitle overlay should render on a given video tile
  const shouldShowSubOnTile = (p) => {
    if (!isAiEnabled || !p) return false;

    // 1. If an active signer is designated by recent gestures
    if (activeSignerId) {
      return p.id === activeSignerId;
    }
    // 2. If this participant has AI Vision turned ON
    if (p.isAiVisionActive) {
      return true;
    }
    // 3. In 2-person meeting, viewer turns on Sub -> target the other participant
    const remotePeers = participants.filter((part) => !part.isLocal);
    if (remotePeers.length === 1) {
      if (isHandTrackingEnabled) {
        return p.isLocal;
      }
      return remotePeers[0].id === p.id;
    }
    // 4. Fallback: show on local if local is the active user
    return p.isLocal;
  };

  if (!participants || participants.length === 0 || !mainParticipant) {
    return (
      <div className="w-full flex-1 flex items-center justify-center text-slate-400 font-sans text-sm">
        Initializing room participants...
      </div>
    );
  }

  // Mode 1: Spotlight View (100% Full Main Viewport + Floating Mini Stream Picture-in-Picture)
  if (layoutMode === 'spotlight') {
    const isLocalMain = mainParticipant.id === localParticipant.id;
    // If local user is main speaker, float the secondary participant; otherwise float local self-view
    const floatingParticipant = isLocalMain
      ? participants.find((p) => p.id !== mainParticipant.id) || localParticipant
      : localParticipant;

    return (
      <div className="w-full h-full flex-1 relative flex items-center justify-center p-1 overflow-hidden min-h-0">
        {/* 100% Main Spotlight Active Speaker Tile - Auto Fit within Viewport */}
        <div className="relative h-full max-h-full w-auto max-w-full aspect-video rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center mx-auto">
          <MeetingVideoTile
            participant={mainParticipant}
            videoRef={mainParticipant.isLocal ? videoRef : null}
            localStream={mainParticipant.isLocal ? localStream : null}
            isPinned={pinnedId === mainParticipant.id}
            onTogglePin={onTogglePin}
            isAiEnabled={shouldShowSubOnTile(mainParticipant)}
            isHandTrackingEnabled={mainParticipant.isLocal ? isHandTrackingEnabled : false}
            subtitleText={subtitleText}
            onRegisterCanvas={onRegisterCanvas}
          />
        </div>

        {/* Floating Mini Stream Picture-in-Picture (Top-Right Corner) */}
        {floatingParticipant && floatingParticipant.id !== mainParticipant.id && (
          <div className="absolute top-4 right-4 w-52 md:w-60 aspect-video z-30 shadow-2xl rounded-2xl overflow-hidden border-2 border-white/20 backdrop-blur-md">
            <MeetingVideoTile
              participant={floatingParticipant}
              videoRef={floatingParticipant.isLocal ? videoRef : null}
              localStream={floatingParticipant.isLocal ? localStream : null}
              isPinned={pinnedId === floatingParticipant.id}
              onTogglePin={onTogglePin}
              isAiEnabled={shouldShowSubOnTile(floatingParticipant)}
              isHandTrackingEnabled={floatingParticipant.isLocal ? isHandTrackingEnabled : false}
              subtitleText={subtitleText}
              onRegisterCanvas={onRegisterCanvas}
            />
          </div>
        )}
      </div>
    );
  }

  // Mode 2: Sidebar View (Main View Left + Stacked 16:9 Side Column Right)
  if (layoutMode === 'sidebar') {
    const sideParticipants = participants.filter((p) => p.id !== mainParticipant.id);
    const MAX_SIDEBAR_SLOTS = 6;
    const visibleSideParticipants = sideParticipants.slice(0, MAX_SIDEBAR_SLOTS);
    const hiddenCount = Math.max(0, sideParticipants.length - MAX_SIDEBAR_SLOTS);

    return (
      <div className="w-full h-full flex-1 grid grid-cols-12 gap-5 items-center overflow-hidden min-h-0">
        {/* Main Speaker / Presentation View (75% - 80% Width) */}
        <div className="col-span-8 lg:col-span-9 h-full min-h-0 flex items-center justify-center">
          <div className="relative h-full max-h-full w-auto max-w-full aspect-video rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center">
            <MeetingVideoTile
              participant={mainParticipant}
              videoRef={mainParticipant.isLocal ? videoRef : null}
              localStream={mainParticipant.isLocal ? localStream : null}
              isPinned={pinnedId === mainParticipant.id}
              onTogglePin={onTogglePin}
              isAiEnabled={shouldShowSubOnTile(mainParticipant)}
              isHandTrackingEnabled={mainParticipant.isLocal ? isHandTrackingEnabled : false}
              subtitleText={subtitleText}
              onRegisterCanvas={onRegisterCanvas}
            />
          </div>
        </div>

        {/* Side Participants Stack (20% - 25% Width, Stacked Neatly from Top) */}
        <div className="col-span-4 lg:col-span-3 flex flex-col gap-3.5 h-full max-h-[80vh] overflow-y-auto justify-start items-center pr-1 custom-scrollbar">
          {visibleSideParticipants.map((p) => (
            <div
              key={p.id}
              className="w-full aspect-video rounded-2xl overflow-hidden shadow-md shrink-0 border border-slate-800/80"
            >
              <MeetingVideoTile
                participant={p}
                videoRef={p.isLocal ? videoRef : null}
                localStream={p.isLocal ? localStream : null}
                isPinned={pinnedId === p.id}
                onTogglePin={onTogglePin}
                isAiEnabled={shouldShowSubOnTile(p)}
                isHandTrackingEnabled={p.isLocal ? isHandTrackingEnabled : false}
                subtitleText={subtitleText}
                onRegisterCanvas={onRegisterCanvas}
              />
            </div>
          ))}

          {/* +N Others Summary Badge when side participants exceed 6 */}
          {hiddenCount > 0 && (
            <div className="w-full py-2.5 bg-slate-800/80 rounded-xl text-center text-xs text-slate-300 font-medium flex items-center justify-center space-x-2 border border-slate-700 shrink-0">
              <Users className="w-3.5 h-3.5 text-slate-300" />
              <span>+ {hiddenCount} other participants</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Mode 3: Tiled View (Equal 16:9 Grid Matrix Centered)
  const count = participants.length;

  let gridColsClass = 'grid-cols-1 max-w-4xl';
  let tileMaxHeightClass = 'max-h-[75vh]';

  if (count === 2) {
    gridColsClass = 'grid-cols-2 max-w-5xl';
    tileMaxHeightClass = 'max-h-[65vh]';
  } else if (count >= 3 && count <= 4) {
    gridColsClass = 'grid-cols-2 max-w-6xl';
    tileMaxHeightClass = 'max-h-[38vh]';
  } else if (count >= 5 && count <= 9) {
    gridColsClass = 'grid-cols-3 max-w-6xl';
    tileMaxHeightClass = 'max-h-[36vh]';
  }

  return (
    <div className="w-full h-full flex-1 flex items-center justify-center my-1 overflow-hidden min-h-0">
      <div className={`w-full ${gridColsClass} gap-6 items-center justify-center mx-auto grid`}>
        {participants.map((p) => (
          <div
            key={p.id}
            className={`w-full ${tileMaxHeightClass} aspect-video rounded-2xl overflow-hidden shadow-2xl mx-auto flex items-center justify-center`}
          >
            <MeetingVideoTile
              participant={p}
              videoRef={p.isLocal ? videoRef : null}
              localStream={p.isLocal ? localStream : null}
              isPinned={pinnedId === p.id}
              onTogglePin={onTogglePin}
              isAiEnabled={shouldShowSubOnTile(p)}
              isHandTrackingEnabled={p.isLocal ? isHandTrackingEnabled : false}
              subtitleText={subtitleText}
              onRegisterCanvas={onRegisterCanvas}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
