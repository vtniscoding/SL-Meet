import React, { useRef, useEffect, useMemo } from 'react';
import {
  MicOnIcon as Mic,
  MicOffIcon as MicOff,
  CameraOnIcon as Video,
  CameraOffIcon as VideoOff,
  EndCallIcon as PhoneOff,
  ExpandPipIcon as Maximize2,
  CaptionsIcon as Captions,
  ScreenShareIcon as Monitor,
  UserAvatarIcon as User,
} from '../../icons';
import { ROLES } from '../../constants/roles';
import ParticipantAvatar from '../common/ParticipantAvatar';

/**
 * MeetingPipView Component:
 * Streamlined, floating, always-on-top Picture-in-Picture window for SLMeet.
 * Vertical stack:
 * 1. Top Draggable Header with Full Window button.
 * 2. Dedicated Video Container.
 * 3. Dedicated Closed Captions (CC) section (Avatar + Name + Text).
 * 4. Bottom Controls bar (Mic, Cam, Expand, End Call).
 */
export default function MeetingPipView({
  mainParticipant,
  localStream,
  localAvatarColor = null,
  localAvatarUrl = null,
  userRole,
  isMuted,
  isCameraOff,
  isScreenSharing = false,
  speechCaptions = {},
  currentSentence = '',
  liveTokens = [],
  signerName = 'Signer',
  signerId = null,
  signerAvatarColor = null,
  signerAvatarUrl = null,
  isCaptionsEnabled = false,
  captionMode = 'SLT',
  isAiEnabled = false,
  isSttEnabled = false,
  onExitPiP,
  onLeaveRoom,
  onToggleMic,
  onToggleCamera,
  onToggleCaptions,
  onToggleScreenShare,
}) {
  const videoRef = useRef(null);

  // CC active check
  const isCcActive = isCaptionsEnabled !== undefined
    ? isCaptionsEnabled
    : (userRole === ROLES.SIGNER ? isSttEnabled : isAiEnabled);

  const activeMode = captionMode || (userRole === ROLES.SIGNER ? 'STT' : 'SLT');

  // Extract structured caption data for Google Meet style CC in PiP
  const captionData = useMemo(() => {
    if (!isCcActive) return null;

    if (activeMode === 'STT') {
      const entries = Object.entries(speechCaptions || {})
        .filter(([_, c]) => c && c.text && c.text.trim())
        .map(([sId, c]) => ({ ...c, senderId: c.senderId || sId }))
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      const latestSpeech = entries[0];
      if (latestSpeech) {
        const isLocalSpeech = latestSpeech.senderId === 'local';
        return {
          senderName: latestSpeech.senderName || (isLocalSpeech ? (mainParticipant?.name || 'You') : 'Speaker'),
          senderId: latestSpeech.senderId,
          avatarColor: latestSpeech.avatarColor || (isLocalSpeech ? localAvatarColor : null),
          avatarUrl: latestSpeech.avatarUrl || (isLocalSpeech ? localAvatarUrl : null),
          text: latestSpeech.text,
          isFinal: latestSpeech.isFinal,
        };
      }
    } else {
      const text =
        currentSentence ||
        (liveTokens && liveTokens.length > 0 ? liveTokens.map((t) => t.text).join(' ') : '');
      if (text) {
        const isLocalSigner = signerId === 'local' || userRole === ROLES.SIGNER;
        return {
          senderName: signerName || (isLocalSigner ? (mainParticipant?.name || 'You') : 'Signer'),
          senderId: signerId || (isLocalSigner ? 'local' : 'signer'),
          avatarColor: signerAvatarColor || (isLocalSigner ? localAvatarColor : mainParticipant?.avatarColor),
          avatarUrl: signerAvatarUrl || (isLocalSigner ? localAvatarUrl : mainParticipant?.avatarUrl),
          text,
          isFinal: true,
        };
      }
    }
    return null;
  }, [
    isCcActive,
    activeMode,
    speechCaptions,
    currentSentence,
    liveTokens,
    signerName,
    signerId,
    signerAvatarColor,
    signerAvatarUrl,
    mainParticipant,
  ]);

  const p = mainParticipant;
  const isLocal = p?.isLocal;
  const stream = p?.stream || (isLocal ? localStream : null);
  const isTileCameraOff = p ? p.isCameraOff : isCameraOff;
  const isTileMuted = isLocal ? isMuted : (p ? p.isMuted : false);
  const hasVideo =
    stream &&
    stream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live') &&
    !isTileCameraOff;

  useEffect(() => {
    const videoEl = videoRef.current;
    if (videoEl) {
      videoEl.muted = isLocal || (!isLocal && p?.isMuted);
      if (stream && videoEl.srcObject !== stream) {
        videoEl.srcObject = stream;
      }
      videoEl.play().catch(() => {});
    }
  }, [stream, isLocal, p?.isMuted]);

  return (
    <div
      onDoubleClick={onExitPiP}
      className="w-screen h-screen bg-[#121212] text-white flex flex-col justify-between font-sans select-none overflow-hidden border border-white/10 p-2 relative"
    >
      {/* Draggable Top Region (Seamless, no grey bar) */}
      <div
        style={{ WebkitAppRegion: 'drag' }}
        data-tauri-drag-region="true"
        className="absolute top-0 left-0 right-0 h-9 z-20 cursor-grab active:cursor-grabbing"
      />

      {/* Floating Expand Button (Top-Right) */}
      <div
        style={{ WebkitAppRegion: 'no-drag' }}
        className="absolute top-3.5 right-3.5 z-30"
      >
        <button
          type="button"
          onClick={onExitPiP}
          className="w-6 h-6 rounded-md bg-black/60 hover:bg-black/90 text-slate-300 hover:text-white backdrop-blur-sm flex items-center justify-center transition-all cursor-pointer outline-none border border-white/10 shadow-md"
          title="Show full meeting window"
          aria-label="Show full meeting window"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 2. Main Video Container Box */}
      <div className="flex-1 min-h-0 rounded-xl overflow-hidden relative bg-black flex items-center justify-center border border-white/10 shadow-inner transition-all duration-200">
        {hasVideo ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className={`w-full h-full object-cover ${isLocal ? 'transform -scale-x-100' : ''}`}
          />
        ) : (
          <div className="flex flex-col items-center justify-center space-y-1.5 text-slate-400 select-none">
            <ParticipantAvatar
              name={p?.name || 'User'}
              id={p?.id}
              avatarUrl={p?.avatarUrl || (p?.isLocal ? localAvatarUrl : null)}
              avatarColor={p?.avatarColor || (p?.isLocal ? localAvatarColor : null)}
              className="w-12 h-12 text-sm shadow-inner"
            />
            <span className="text-[11px] text-slate-300 font-medium truncate max-w-[160px]">
              {p?.name || 'Meeting'} {isTileCameraOff ? '(Camera off)' : ''}
            </span>
          </div>
        )}

        {/* Video Bottom-Left Participant Name Badge with Mic Status */}
        <div className="absolute bottom-1.5 left-2 z-10 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-[10px] font-medium text-white max-w-[180px] flex items-center space-x-1.5 select-none border border-white/5">
          <span className="truncate">{p?.name || 'Participant'}</span>
          {!p?.isScreenSharing && (
            isTileMuted ? (
              <MicOff className="w-3 h-3 text-rose-500 shrink-0" title="Microphone off" />
            ) : (
              <Mic className="w-3 h-3 text-[#22C55E] shrink-0" title="Microphone on" />
            )
          )}
        </div>
      </div>

      {/* 3. Dedicated Closed Captions (CC) Row */}
      {isCcActive && captionData ? (
        <div className="shrink-0 px-3 py-1 min-h-[40px] max-h-[56px] flex items-start space-x-2 select-text bg-transparent">
          <div className="mt-0.5 shrink-0 select-none">
            <ParticipantAvatar
              name={captionData.senderName}
              id={captionData.senderId}
              avatarUrl={captionData.avatarUrl}
              avatarColor={captionData.avatarColor}
              className="w-5 h-5 text-[9px]"
            />
          </div>

          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-[10px] font-medium text-slate-400 leading-tight mb-0.5 truncate select-none">
              {captionData.senderName}
            </span>
            <p className="text-[11px] text-white leading-tight line-clamp-2 break-words">
              {captionData.text}
            </p>
          </div>
        </div>
      ) : null}

      {/* 4. Bottom Controls Bar */}
      <div
        className="h-10 shrink-0 px-2 flex items-center justify-center space-x-2.5 select-none bg-[#121212]"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        {/* Mic Toggle */}
        <button
          onClick={onToggleMic}
          className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer outline-none ${
            isMuted ? 'bg-[#EA4335] text-white' : 'bg-[#3C4043] hover:bg-[#474B4F] text-white'
          }`}
          title={isMuted ? 'Turn on microphone' : 'Turn off microphone'}
        >
          {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
        </button>

        {/* Camera Toggle */}
        <button
          onClick={onToggleCamera}
          className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer outline-none ${
            isCameraOff ? 'bg-[#EA4335] text-white' : 'bg-[#3C4043] hover:bg-[#474B4F] text-white'
          }`}
          title={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
        >
          {isCameraOff ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
        </button>

        {/* Screen Share Toggle */}
        <button
          onClick={onToggleScreenShare}
          className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer outline-none ${
            isScreenSharing
              ? 'bg-[#8AB4F8] text-[#202124]'
              : 'bg-[#3C4043] hover:bg-[#474B4F] text-white'
          }`}
          title={isScreenSharing ? 'Stop presenting' : 'Present now'}
        >
          <Monitor className="w-3.5 h-3.5" />
        </button>

        {/* Captions (CC) Toggle */}
        <button
          onClick={onToggleCaptions}
          className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer outline-none ${
            isCcActive
              ? 'bg-[#8AB4F8] text-[#202124]'
              : 'bg-[#3C4043] hover:bg-[#474B4F] text-white'
          }`}
          title={isCcActive ? 'Turn off captions' : 'Turn on captions'}
        >
          <Captions className="w-3.5 h-3.5" />
        </button>

        {/* Leave / End Call */}
        <button
          onClick={onLeaveRoom}
          className="w-7 h-7 rounded-full bg-[#EA4335] hover:bg-[#D93025] text-white flex items-center justify-center transition-colors cursor-pointer outline-none shadow-xs"
          title="Leave room"
        >
          <PhoneOff className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
