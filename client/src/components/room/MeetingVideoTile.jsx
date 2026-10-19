import React, { useEffect, useRef } from 'react';
import { User, MicOff, Pin, PinOff } from 'lucide-react';
import AslSubtitleOverlay from './AslSubtitleOverlay';

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
  isHandTrackingEnabled = true,
  subtitleText,
  captionData,
  onRegisterCanvas,
}) {
  const { id, name, isLocal, isCameraOff, isMuted, isSpeaking, isActiveSpeaker, isScreenSharing, stream: tileStream, hasStream } = participant;
  const tileVideoRef = useRef(null);
  const canvasRef = useRef(null);

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

  // Register local canvas element with background MediaPipe worker
  useEffect(() => {
    if (isLocal && !isScreenSharing && onRegisterCanvas) {
      if (canvasRef.current) {
        onRegisterCanvas(canvasRef.current);
      }
    }
    return () => {
      if (isLocal && onRegisterCanvas) {
        onRegisterCanvas(null);
      }
    };
  }, [isLocal, isScreenSharing, onRegisterCanvas]);

  return (
    <div
      className={`relative w-full h-full rounded-2xl overflow-hidden bg-slate-900 transition-all duration-200 group flex items-center justify-center box-border ${
        isSpeaking
          ? 'border-2 border-[#5CA0F2]'
          : 'border border-slate-800/80'
      }`}
    >
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

      {/* MediaPipe AI Hand Tracking Overlay Canvas (Local camera only) */}
      {!isScreenSharing && isHandTrackingEnabled && !isCameraOff && isLocal && (
        <canvas
          ref={(el) => {
            canvasRef.current = el;
            if (isLocal && onRegisterCanvas) {
              onRegisterCanvas(el);
            }
          }}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10 transform -scale-x-100"
        />
      )}

      {/* Camera Off Avatar Fallback */}
      {!isScreenSharing && (isCameraOff || (!isLocal && (!hasStream || !hasLiveVideo))) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 text-slate-400 space-y-3 p-4">
          <div className="w-20 h-20 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shadow-inner">
            <User className="w-10 h-10 text-slate-400" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
            {name}{' '}
            {!hasStream
              ? '(Connecting...)'
              : !hasLiveVideo
              ? '(Audio Only)'
              : isCameraOff
              ? '(Camera Off)'
              : ''}
          </span>
        </div>
      )}

      {/* Participant Name Badge & Mute Indicator */}
      <div className="absolute top-4 left-4 z-20 bg-black/60 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 flex items-center space-x-2">
        <span>{name}</span>
        {isMuted && <MicOff className="w-3.5 h-3.5 text-rose-400" />}
      </div>

      {/* Pin / Unpin Button Overlay */}
      <div className="absolute top-4 right-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button
          onClick={() => onTogglePin(id)}
          className={`p-2 rounded-xl backdrop-blur-md border transition-all outline-none focus:outline-none ${
            isPinned
              ? 'bg-[#8AB4F8] text-[#202124] border-transparent opacity-100 shadow-md'
              : 'bg-black/60 text-slate-300 border-white/15 hover:bg-black/80 hover:text-white'
          }`}
          title={isPinned ? 'Unpin stream' : 'Pin stream'}
        >
          {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
        </button>
      </div>

      {/* Floating Subtitle / Caption Overlay */}
      {captionData && captionData.text ? (
        <AslSubtitleOverlay
          subtitleText={captionData.text}
          title={captionData.title || (captionData.variant === 'speech' ? 'LIVE CAPTION' : 'TRANSLATION')}
        />
      ) : isAiEnabled && subtitleText ? (
        <AslSubtitleOverlay subtitleText={subtitleText} title="TRANSLATION" />
      ) : null}
    </div>
  );
}
