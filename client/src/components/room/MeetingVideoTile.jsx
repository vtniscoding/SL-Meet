import React, { useEffect, useRef } from 'react';
import { User, MicOff, Pin, PinOff } from 'lucide-react';
import AslSubtitleOverlay from './AslSubtitleOverlay';
import { createMediaPipeHandsInstance, drawHandResults, classifyGesture } from '../../services/mediapipe';

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
  onGestureDetected,
}) {
  const { id, name, isLocal, isCameraOff, isMuted, isSpeaking, isActiveSpeaker, isScreenSharing, stream: tileStream, hasStream } = participant;
  const tileVideoRef = useRef(null);
  const canvasRef = useRef(null);

  const activeStream = tileStream || (isLocal ? localStream : null);
  const hasLiveVideo =
    activeStream &&
    activeStream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live');

  // Attach stream to video element cleanly and force video play
  useEffect(() => {
    const videoEl = tileVideoRef.current;
    if (videoEl && activeStream) {
      if (videoEl.srcObject !== activeStream) {
        videoEl.srcObject = activeStream;
      }
      videoEl.play().catch((err) => {
        // Video autoplay deferred until metadata or user gesture
      });
    }
  }, [activeStream, isCameraOff, isScreenSharing, hasLiveVideo]);

  // Sync external videoRef for MediaPipe hand tracking if this is local camera tile
  useEffect(() => {
    if (isLocal && !isScreenSharing && externalVideoRef && tileVideoRef.current) {
      externalVideoRef.current = tileVideoRef.current;
    }
  }, [isLocal, isScreenSharing, externalVideoRef]);

  const onGestureDetectedRef = useRef(onGestureDetected);
  useEffect(() => {
    onGestureDetectedRef.current = onGestureDetected;
  }, [onGestureDetected]);

  // MediaPipe AI Hand Landmark Tracking Loop for Active Camera Streams (Local & Remote)
  useEffect(() => {
    if (isCameraOff || isScreenSharing || (!isAiEnabled && !isHandTrackingEnabled)) {
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      return;
    }

    let animFrameId = null;
    let handsInstance = null;

    try {
      handsInstance = createMediaPipeHandsInstance((results) => {
        if (canvasRef.current) {
          const video = tileVideoRef.current;
          if (video && video.videoWidth && video.videoHeight) {
            canvasRef.current.width = video.videoWidth;
            canvasRef.current.height = video.videoHeight;
            const ctx = canvasRef.current.getContext('2d');
            if (isHandTrackingEnabled) {
              drawHandResults(ctx, results);
            } else {
              ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            }
          }
        }

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
          const { gesture, confidence } = classifyGesture(
            results.multiHandLandmarks[0],
            results.multiHandedness?.[0],
            results.multiHandLandmarks,
            results.multiHandedness
          );
          if (gesture && gesture !== 'Signing...' && onGestureDetectedRef.current) {
            onGestureDetectedRef.current({ gesture, confidence });
          }
        }
      });

      const processFrame = async () => {
        const video = tileVideoRef.current;
        if (video && video.readyState >= 2 && !video.paused && !video.ended) {
          try {
            await handsInstance.send({ image: video });
          } catch (err) {
            // Ignore frame drop errors
          }
        }
        animFrameId = requestAnimationFrame(processFrame);
      };

      animFrameId = requestAnimationFrame(processFrame);
    } catch (err) {
      console.warn('MediaPipe initialization warning:', err);
    }

    return () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (handsInstance) handsInstance.close();
    };
  }, [isLocal, isCameraOff, isScreenSharing, isAiEnabled, isHandTrackingEnabled]);

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
        muted={isLocal || isScreenSharing}
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

      {/* MediaPipe AI Hand Tracking Overlay Canvas */}
      {!isScreenSharing && (isAiEnabled || isHandTrackingEnabled) && !isCameraOff && (
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full object-cover pointer-events-none z-10 ${
            isLocal ? 'transform -scale-x-100' : ''
          }`}
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

      {/* Floating ASL Subtitle Overlay (Renders whenever viewer enables AI CC) */}
      {isAiEnabled && (isLocal || isActiveSpeaker || subtitleText) && (
        <AslSubtitleOverlay subtitleText={subtitleText} />
      )}
    </div>
  );
}
