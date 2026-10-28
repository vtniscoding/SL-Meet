import React, { useRef, useEffect, useMemo } from 'react';
import {
  MicOnIcon as Mic,
  MicOffIcon as MicOff,
  CameraOnIcon as Video,
  CameraOffIcon as VideoOff,
  EndCallIcon as PhoneOff,
  ExpandPipIcon as Maximize2,
  UserAvatarIcon as User,
} from '../../icons';
import { ROLES } from '../../constants/roles';
import { colorForSender } from './captions/captionUtils';

/**
 * MeetingPipView Component:
 * Streamlined, floating, always-on-top Picture-in-Picture window for SLMeet (Image 3).
 * Vertical stack:
 * 1. Top Draggable Header with Full Window button.
 * 2. Dedicated Video Container.
 * 3. Dedicated Closed Captions (CC) section (Avatar + Name + Text).
 * 4. Bottom Controls bar (Mic, Cam, Expand, End Call).
 */
export default function MeetingPipView({
  mainParticipant,
  localStream,
  userRole,
  isMuted,
  isCameraOff,
  speechCaptions = {},
  currentSentence = '',
  liveTokens = [],
  signerName = 'Signer',
  isAiEnabled = false,
  isSttEnabled = false,
  onExitPiP,
  onLeaveRoom,
  onToggleMic,
  onToggleCamera,
}) {
  const videoRef = useRef(null);

  const isCcActive = userRole === ROLES.SIGNER ? isSttEnabled : isAiEnabled;

  // Extract structured caption data for Google Meet style CC in PiP (Image 3)
  const captionData = useMemo(() => {
    if (!isCcActive) return null;

    if (userRole === ROLES.SIGNER) {
      const entries = Object.entries(speechCaptions || {})
        .filter(([_, c]) => c && c.text && c.text.trim())
        .map(([senderId, c]) => ({ ...c, senderId: c.senderId || senderId }))
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      const latestSpeech = entries[0];
      if (latestSpeech) {
        const name = latestSpeech.senderName || 'Speaker';
        const clean = name.replace(/\s*\(You\)/i, '').replace(/\s*\(Presentation\)/i, '').trim();
        return {
          senderName: name,
          initial: clean ? clean.charAt(0).toUpperCase() : 'U',
          senderColor: colorForSender(latestSpeech.senderId),
          text: latestSpeech.text,
          isFinal: latestSpeech.isFinal,
        };
      }
    } else {
      const text =
        currentSentence ||
        (liveTokens && liveTokens.length > 0 ? liveTokens.map((t) => t.text).join(' ') : '');
      if (text) {
        const name = signerName || mainParticipant?.name || 'Signer';
        const clean = name.replace(/\s*\(You\)/i, '').replace(/\s*\(Presentation\)/i, '').trim();
        return {
          senderName: name,
          initial: clean ? clean.charAt(0).toUpperCase() : 'S',
          senderColor: '#C58AF9',
          text,
          isFinal: true,
        };
      }
    }
    return null;
  }, [isCcActive, userRole, speechCaptions, currentSentence, liveTokens, signerName, mainParticipant]);

  const p = mainParticipant;
  const isLocal = p?.isLocal;
  const stream = p?.stream || (isLocal ? localStream : null);
  const isTileCameraOff = p ? p.isCameraOff : isCameraOff;
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
      videoEl.play?.().catch(() => {});
    }
  }, [stream, isLocal, p?.isMuted]);

  const cleanName = (p?.name || '')
    .replace(/\s*\(You\)/i, '')
    .replace(/\s*\(Presentation\)/i, '')
    .trim();
  const initialLetter = cleanName ? cleanName.charAt(0).toUpperCase() : 'U';

  return (
    <div className="w-screen h-screen bg-[#121212] text-white flex flex-col justify-between overflow-hidden select-none border border-white/15 rounded-lg shadow-2xl relative">
      {/* 1. Top Draggable Header Bar: Clean & Minimal, only 'Show full meeting window' button */}
      <header
        onDoubleClick={onExitPiP}
        className="w-full h-7 px-2.5 flex items-center justify-end z-30 shrink-0 select-none bg-[#121212]"
        style={{ WebkitAppRegion: 'drag' }}
      >
        <div style={{ WebkitAppRegion: 'no-drag' }}>
          <button
            type="button"
            onClick={onExitPiP}
            className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/15 transition-all cursor-pointer outline-none focus:outline-none"
            title="Show full meeting window"
            aria-label="Show full meeting window"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* 2. Main Video Container Box */}
      <div className="flex-1 min-h-0 mx-2 rounded-xl overflow-hidden relative bg-black flex items-center justify-center border border-white/10 shadow-inner transition-all duration-200">
        {hasVideo ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className={`w-full h-full object-cover ${isLocal ? 'transform -scale-x-100' : ''}`}
          />
        ) : (
          <div className="flex flex-col items-center justify-center space-y-1.5 text-slate-400 select-none">
            <div className="w-11 h-11 rounded-full bg-[#3C4043] border border-white/10 flex items-center justify-center text-white text-base font-semibold shadow-inner">
              {initialLetter || <User className="w-5 h-5 text-slate-300" />}
            </div>
            <span className="text-[11px] text-slate-300 font-medium truncate max-w-[160px]">
              {p?.name || 'Meeting'} {isTileCameraOff ? '(Camera off)' : ''}
            </span>
          </div>
        )}

        {/* Video Bottom-Left Participant Name Badge */}
        <div className="absolute bottom-1.5 left-2 z-10 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-xs text-[10px] font-medium text-white max-w-[180px] truncate select-none border border-white/5">
          {p?.name || 'Participant'}
        </div>
      </div>

      {/* 3. Dedicated Closed Captions (CC) Row (Clean Google Meet Image 3 - Seamless & Flat) */}
      {isCcActive && captionData ? (
        <div className="shrink-0 px-3 py-1 min-h-[40px] max-h-[56px] flex items-start space-x-2 select-text bg-transparent">
          {/* Avatar Circle */}
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5 shadow-xs select-none"
            style={{ backgroundColor: captionData.senderColor }}
          >
            {captionData.initial}
          </div>

          {/* Name + Text */}
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
        className="h-10 shrink-0 px-2 flex items-center justify-center space-x-3 select-none bg-[#121212]"
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

        {/* Large Show Full Meeting Window Button */}
        <button
          onClick={onExitPiP}
          className="w-7 h-7 rounded-full bg-[#5CA0F2] hover:bg-[#4A8FE0] text-white flex items-center justify-center transition-colors cursor-pointer outline-none shadow-xs"
          title="Show full meeting window"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        {/* Leave Meeting Button */}
        <button
          onClick={onLeaveRoom}
          className="w-7 h-7 rounded-full bg-[#EA4335] hover:bg-[#D93025] text-white flex items-center justify-center transition-colors cursor-pointer outline-none shadow-xs"
          title="Leave meeting"
        >
          <PhoneOff className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
