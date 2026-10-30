import React, { useEffect, useRef } from 'react';
import {
  UserAvatarIcon as User,
  MicOffIcon as MicOff,
  PinIcon as Pin,
  UnpinIcon as PinOff,
} from '../../icons';

/**
 * Semantic Component: Renders a single 16:9 video tile with stream attachment,
 * camera-off fallback, pin controls, speaking VAD outline, canvas hand tracking overlay, and subtitle overlay.
 */
export default function MeetingVideoTile({
  participant,
  videoRef: externalVideoRef,
  localStream,
  isPinned,
  onTogglePin,
  isAiEnabled,
  isHandTrackingEnabled = false,
  subtitleText,
  captionData,
  onRegisterCanvas,
}) {
  const { id, name, isLocal, isCameraOff, isMuted, isSpeaking, isActiveSpeaker, isScreenSharing, stream: tileStream, hasStream } = participant;
  const tileVideoRef = useRef(null);

  const activeStream = tileStream || (isLocal ? localStream : null);
  const hasLiveVideo =
    activeStream &&
    activeStream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live');

  // Attach stream to video element cleanly, ensure audio mute state is applied, and force video play
  useEffect(() => {
    const videoEl = tileVideoRef.current;
    if (videoEl) {
      videoEl.muted = isLocal || isScreenSharing || (!isLocal && isMuted);
      if (activeStream && videoEl.srcObject !== activeStream) {
        videoEl.srcObject = activeStream;
      }
      videoEl.play().catch((err) => {
        // Video autoplay deferred until metadata or user gesture
      });
    }
  }, [activeStream, isCameraOff, isScreenSharing, hasLiveVideo, isLocal, isMuted]);

  // Sync external videoRef for MediaPipe hand tracking if this is local camera tile
  useEffect(() => {
    if (isLocal && !isScreenSharing && externalVideoRef && tileVideoRef.current) {
      externalVideoRef.current = tileVideoRef.current;
    }
  }, [isLocal, isScreenSharing, externalVideoRef]);

  const cleanName = (name || '').replace(/\s*\(You\)/i, '').replace(/\s*\(Presentation\)/i, '').trim();
  const initialLetter = cleanName ? cleanName.charAt(0).toUpperCase() : 'U';

  return (
    <div className="relative w-full h-full rounded-lg overflow-hidden bg-slate-900 group flex items-center justify-center">
      {/* Video Stream Element */}
      <video
        ref={tileVideoRef}
        autoPlay
        playsInline
        muted={isLocal || isScreenSharing || (!isLocal && isMuted)}
        onLoadedMetadata={(e) => {
          e.target.play().catch(() => {});
        }}
        className={`absolute inset-0 w-full h-full ${
          isScreenSharing
            ? 'object-contain bg-black'
            : isLocal
            ? 'object-cover transform -scale-x-100'
            : 'object-cover'
        } ${isCameraOff && !isScreenSharing ? 'hidden' : 'block'}`}
      />

      {/* Camera Off Avatar Fallback (Zoom-Style: Profile Avatar with Gray Background) */}
      {!isScreenSharing && (isCameraOff || (!isLocal && (!hasStream || !hasLiveVideo))) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#202124] text-slate-300 p-2 sm:p-4 space-y-1 sm:space-y-2 select-none">
          {/* Centered Circular Profile Avatar with Neutral Gray Background */}
          <div className="w-11 h-11 sm:w-16 sm:h-16 md:w-20 md:h-20 aspect-square shrink-0 rounded-full bg-[#3C4043] border border-white/10 flex items-center justify-center text-white text-base sm:text-xl md:text-2xl font-semibold shadow-inner select-none">
            {initialLetter || <User className="w-5 h-5 sm:w-8 sm:h-8 text-slate-300" />}
          </div>
          {!hasStream && !isLocal && (
            <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate max-w-[90%]">Connecting...</span>
          )}
        </div>
      )}

      {/* Zoom-Style Solid Active Speaker Border Overlay (Always on top of video, never covered) */}
      <div
        className={`absolute inset-0 rounded-lg pointer-events-none z-20 transition-colors duration-150 border-[3px] ${
          isSpeaking && !isMuted
            ? 'border-[#22C55E]'
            : 'border-white/10'
        }`}
      />

      {/* Participant Name Tag (Zoom-Style: Bottom-Left, Basic White Text on Black Background) */}
      <div className="absolute bottom-2.5 left-2.5 z-20 bg-black/75 backdrop-blur-xs text-white px-2 py-0.5 rounded text-[12px] font-normal flex items-center space-x-1.5 select-none pointer-events-none">
        <span className="truncate max-w-[140px] sm:max-w-[180px]">{name}</span>
        {isMuted && <MicOff className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
      </div>

      {/* Pin / Unpin Button Overlay */}
      <div className="absolute top-2.5 right-2.5 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button
          onClick={() => onTogglePin(id)}
          className={`p-1.5 rounded-md backdrop-blur-md border transition-all outline-none focus:outline-none cursor-pointer ${
            isPinned
              ? 'bg-[#8AB4F8] text-[#202124] border-transparent opacity-100 shadow-md'
              : 'bg-black/60 text-slate-300 border-white/15 hover:bg-black/80 hover:text-white'
          }`}
          title={isPinned ? 'Unpin stream' : 'Pin stream'}
        >
          {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}
