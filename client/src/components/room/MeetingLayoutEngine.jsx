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
  subtitleText,
  onGestureDetected,
}) {
  const pinnedParticipant = participants.find((p) => p.id === pinnedId);
  const mainParticipant = pinnedParticipant || participants.find((p) => p.isActiveSpeaker) || participants[0];
  const localParticipant = participants.find((p) => p.isLocal) || participants[0];

  // Mode 1: Spotlight View (100% Full Main Viewport + Floating Mini Stream Picture-in-Picture)
  if (layoutMode === 'spotlight') {
    const isLocalMain = mainParticipant.id === localParticipant.id;
    // If local user is main speaker, float the secondary participant; otherwise float local self-view
    const floatingParticipant = isLocalMain
      ? participants.find((p) => p.id !== mainParticipant.id) || localParticipant
      : localParticipant;

    return (
      <div className="w-full flex-1 relative flex items-center justify-center my-4 overflow-hidden">
        {/* 100% Main Spotlight Active Speaker Tile */}
        <div className="w-full h-full max-h-[82vh] aspect-video rounded-2xl overflow-hidden shadow-2xl mx-auto">
          <MeetingVideoTile
            participant={mainParticipant}
            videoRef={mainParticipant.isLocal ? videoRef : null}
            localStream={mainParticipant.isLocal ? localStream : null}
            isPinned={pinnedId === mainParticipant.id}
            onTogglePin={onTogglePin}
            isAiEnabled={isAiEnabled}
            isHandTrackingEnabled={isHandTrackingEnabled}
            subtitleText={subtitleText}
            onGestureDetected={onGestureDetected}
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
              isAiEnabled={false}
              isHandTrackingEnabled={isHandTrackingEnabled}
              subtitleText={subtitleText}
              onGestureDetected={onGestureDetected}
            />
          </div>
        )}
      </div>
    );
  }

  // Mode 2: Sidebar View (75% Main View Left + Max 6 Visible Sidebar Slots Right, No Scrollbar)
  if (layoutMode === 'sidebar') {
    const sideParticipants = participants.filter((p) => p.id !== mainParticipant.id);
    const MAX_SIDEBAR_SLOTS = 6;
    const visibleSideParticipants = sideParticipants.slice(0, MAX_SIDEBAR_SLOTS);
    const hiddenCount = Math.max(0, sideParticipants.length - MAX_SIDEBAR_SLOTS);

    return (
      <div className="w-full flex-1 grid grid-cols-12 gap-6 my-4 items-stretch overflow-hidden">
        {/* Main Speaker View (75% Width) */}
        <div className="col-span-8 h-full min-h-0">
          <MeetingVideoTile
            participant={mainParticipant}
            videoRef={mainParticipant.isLocal ? videoRef : null}
            localStream={mainParticipant.isLocal ? localStream : null}
            isPinned={pinnedId === mainParticipant.id}
            onTogglePin={onTogglePin}
            isAiEnabled={isAiEnabled}
            isHandTrackingEnabled={isHandTrackingEnabled}
            subtitleText={subtitleText}
            onGestureDetected={onGestureDetected}
          />
        </div>

        {/* Side Participants Stack (25% Width, Max 6 slots without scrollbars) */}
        <div className="col-span-4 flex flex-col gap-3 h-full overflow-hidden items-center justify-between">
          {visibleSideParticipants.map((p) => {
            const sideCount = visibleSideParticipants.length;
            let sideTileClass = 'w-full aspect-video shrink-0';
            if (sideCount === 3) {
              sideTileClass = 'w-full flex-1 min-h-0 aspect-video max-h-[31%]';
            } else if (sideCount > 3) {
              sideTileClass = 'w-full flex-1 min-h-0 aspect-video max-h-[15%]';
            }

            return (
              <div key={p.id} className={`${sideTileClass} rounded-2xl overflow-hidden shadow-md mx-auto`}>
                <MeetingVideoTile
                  participant={p}
                  videoRef={p.isLocal ? videoRef : null}
                  localStream={p.isLocal ? localStream : null}
                  isPinned={pinnedId === p.id}
                  onTogglePin={onTogglePin}
                  isAiEnabled={false}
                  isHandTrackingEnabled={isHandTrackingEnabled}
                  subtitleText={subtitleText}
                  onGestureDetected={onGestureDetected}
                />
              </div>
            );
          })}

          {/* +N Others Summary Badge when side participants exceed 6 */}
          {hiddenCount > 0 && (
            <div className="w-full py-2 bg-slate-800/80 rounded-xl text-center text-xs text-slate-300 font-medium flex items-center justify-center space-x-2 border border-slate-700">
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

  let gridColsClass = 'grid-cols-1';
  let tileMaxHeightClass = 'max-h-[80vh]';

  if (count === 2) {
    gridColsClass = 'grid-cols-2';
    tileMaxHeightClass = 'max-h-[65vh]';
  } else if (count >= 3 && count <= 4) {
    gridColsClass = 'grid-cols-2';
    tileMaxHeightClass = 'max-h-[38vh]';
  } else if (count >= 5 && count <= 9) {
    gridColsClass = 'grid-cols-3';
    tileMaxHeightClass = 'max-h-[36vh]';
  }

  return (
    <div className="w-full flex-1 flex items-center justify-center my-4 overflow-hidden">
      <div className={`w-full max-w-6xl grid ${gridColsClass} gap-6 items-center justify-center`}>
        {participants.map((p) => (
          <div
            key={p.id}
            className={`w-full ${tileMaxHeightClass} aspect-video rounded-2xl overflow-hidden shadow-2xl mx-auto`}
          >
            <MeetingVideoTile
              participant={p}
              videoRef={p.isLocal ? videoRef : null}
              localStream={p.isLocal ? localStream : null}
              isPinned={pinnedId === p.id}
              onTogglePin={onTogglePin}
              isAiEnabled={isAiEnabled && (p.isLocal || p.isActiveSpeaker)}
              isHandTrackingEnabled={isHandTrackingEnabled}
              subtitleText={subtitleText}
              onGestureDetected={onGestureDetected}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
