import React, { useState, useRef, useEffect } from 'react';
import {
  MicOnIcon as Mic,
  MicOffIcon as MicOff,
  CameraOnIcon as Video,
  CameraOffIcon as VideoOff,
  EndCallIcon as PhoneOff,
  CaptionsIcon as Captions,
  HandTrackingOnIcon as Eye,
  HandTrackingOffIcon as EyeOff,
  ScreenShareIcon as Monitor,
  UnpinIcon as PinOff,
  MoreOptionsIcon as MoreVertical,
  ChatDrawerIcon as MessageSquare,
  ParticipantsDrawerIcon as Users,
  RoleAssignedIcon as UserCheck,
} from '../../icons';

/**
 * Semantic Component: Google Meet Style Control Bar
 * Clean borderless controls with 3-Dots Popup Menu for layout options, In-Call Chat & People Drawer.
 */
export default function MeetingControlBar({
  isMuted,
  isCameraOff,
  isScreenSharing,
  isAiEnabled,
  isHandTrackingEnabled,
  isChatOpen,
  isPeopleOpen,
  unreadCount = 0,
  participantCount = 1,
  layoutMode,
  pinnedId,
  userRole = 'non_signer',
  isSttEnabled = false,
  sttStatus = 'idle',
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onToggleAi,
  onToggleHandTracking,
  onToggleStt,
  onRequestSwitchRole,
  onToggleChat,
  onTogglePeople,
  onResetPin,
  onLeaveRoom,
}) {



  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const menuRef = useRef(null);

  // Close popup menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <footer className="w-full flex items-center justify-between pt-2 z-30 relative select-none">
      {/* Left Utility: Unpin Stream Button */}
      <div className="w-1/4 flex items-center space-x-2">
        {pinnedId && (
          <button
            onClick={onResetPin}
            className="px-3.5 py-1.5 rounded-full bg-[#3C4043] hover:bg-[#474B4F] text-slate-200 text-xs font-medium flex items-center space-x-2 transition-colors outline-none focus:outline-none focus:ring-0"
            title="Unpin active stream"
          >
            <PinOff className="w-4 h-4 text-slate-300" />
            <span>Unpin View</span>
          </button>
        )}
      </div>

      {/* Main Center Control Bar Container (Media & Call Controls) */}
      <div className="relative bg-[#202124] px-6 py-3 rounded-full flex items-center space-x-3 shadow-2xl">
        {/* Microphone Toggle Button */}
        <button
          onClick={onToggleMic}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors outline-none focus:outline-none focus:ring-0 ${
            isMuted
              ? 'bg-[#EA4335] hover:bg-[#D93025] text-white'
              : 'bg-[#3C4043] hover:bg-[#474B4F] text-slate-200'
          }`}
          title={isMuted ? 'Turn on microphone' : 'Turn off microphone'}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Camera Toggle Button */}
        <button
          onClick={onToggleCamera}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors outline-none focus:outline-none focus:ring-0 ${
            isCameraOff
              ? 'bg-[#EA4335] hover:bg-[#D93025] text-white'
              : 'bg-[#3C4043] hover:bg-[#474B4F] text-slate-200'
          }`}
          title={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
        >
          {isCameraOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
        </button>

        {/* Screen Share Toggle Button */}
        <button
          onClick={onToggleScreenShare}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors outline-none focus:outline-none focus:ring-0 ${
            isScreenSharing
              ? 'bg-[#8AB4F8] text-[#202124]'
              : 'bg-[#3C4043] hover:bg-[#474B4F] text-slate-200'
          }`}
          title={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}
        >
          <Monitor className="w-5 h-5" />
        </button>

        {/* Subtitles (CC) Toggle Button (Non-Signers) */}
        {userRole !== 'signer' && (
          <button
            onClick={onToggleAi}
            className={`px-4 h-12 rounded-full text-xs font-bold flex items-center space-x-2 transition-colors outline-none focus:outline-none focus:ring-0 ${
              isAiEnabled
                ? 'bg-[#8AB4F8] text-[#202124]'
                : 'bg-[#3C4043] hover:bg-[#474B4F] text-slate-300'
            }`}
            title={isAiEnabled ? 'Turn OFF Subtitles' : 'Turn ON Subtitles'}
          >
            <Captions className="w-5 h-5" />
            <span>CC</span>
          </button>
        )}

        {/* Hand Tracking AI Vision Toggle Button (Signers only) */}
        {userRole === 'signer' && (
          <button
            onClick={onToggleHandTracking}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors outline-none focus:outline-none focus:ring-0 ${
              isHandTrackingEnabled
                ? 'bg-[#8AB4F8] text-[#202124]'
                : 'bg-[#3C4043] hover:bg-[#474B4F] text-slate-300'
            }`}
            title={isHandTrackingEnabled ? 'Turn OFF AI Vision Tracking' : 'Turn ON AI Vision Tracking'}
          >
            {isHandTrackingEnabled ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
          </button>
        )}

        {/* Live Speech-to-Text Captions Toggle Button (Signers only) */}
        {userRole === 'signer' && (
          <button
            onClick={onToggleStt}
            className={`px-4 h-12 rounded-full text-xs font-bold flex items-center space-x-2 transition-colors outline-none focus:outline-none focus:ring-0 ${
              isSttEnabled
                ? 'bg-[#8AB4F8] text-[#202124]'
                : 'bg-[#3C4043] hover:bg-[#474B4F] text-slate-300'
            }`}
            title={
              sttStatus === 'loading'
                ? 'Loading Whisper AI model...'
                : isSttEnabled
                ? 'Turn OFF Subtitles'
                : 'Turn ON Subtitles'
            }
          >
            {sttStatus === 'loading' ? (
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Captions className="w-5 h-5" />
            )}
            <span>
              {sttStatus === 'loading'
                ? 'Loading...'
                : 'CC'}
            </span>
          </button>
        )}

        {/* Red End Call / Leave Room Button */}
        <button
          onClick={onLeaveRoom}
          className="w-14 h-12 rounded-full bg-[#EA4335] hover:bg-[#D93025] text-white flex items-center justify-center transition-colors shadow-md outline-none focus:outline-none focus:ring-0"
          title="Leave call"
        >
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>

      {/* Right Side Utility: Secondary Mini Control Bar (People, Chat, Layout Selector) */}
      <div className="w-1/4 flex justify-end items-center">
        <div className="bg-[#202124] px-3 py-1.5 rounded-full flex items-center space-x-2 shadow-2xl border border-slate-700/40">
          {/* People / Participants List Drawer Toggle Button */}
          <button
            onClick={onTogglePeople}
            className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-colors outline-none focus:outline-none focus:ring-0 ${
              isPeopleOpen
                ? 'bg-[#8AB4F8] text-[#202124]'
                : 'bg-[#3C4043] hover:bg-[#474B4F] text-slate-200'
            }`}
            title={isPeopleOpen ? 'Close participants panel' : 'Open participants panel'}
          >
            <Users className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] font-bold min-w-[16px] h-[16px] rounded-full flex items-center justify-center px-1 shadow-md">
              {participantCount}
            </span>
          </button>

          {/* Real-Time In-Call Chat Drawer Toggle Button */}
          <button
            onClick={onToggleChat}
            className={`relative w-10 h-10 rounded-full flex items-center justify-center transition-colors outline-none focus:outline-none focus:ring-0 ${
              isChatOpen
                ? 'bg-[#8AB4F8] text-[#202124]'
                : 'bg-[#3C4043] hover:bg-[#474B4F] text-slate-200'
            }`}
            title={isChatOpen ? 'Close in-call chat' : 'Open in-call chat'}
          >
            <MessageSquare className="w-4 h-4" />
            {!isChatOpen && unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold min-w-[16px] h-[16px] rounded-full flex items-center justify-center px-1 shadow-md animate-pulse">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* 3-Dots More Options Menu Button */}
          <div className="relative" ref={menuRef}>
            {showMoreMenu && (
              <div className="absolute bottom-14 right-0 w-48 bg-[#28292C] rounded-xl p-3 shadow-2xl z-50 text-slate-400 text-xs text-center border border-white/10 select-none">
                More options coming soon
              </div>
            )}

            <button
              onClick={() => setShowMoreMenu((prev) => !prev)}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors outline-none focus:outline-none focus:ring-0 ${
                showMoreMenu
                  ? 'bg-[#474B4F] text-white'
                  : 'bg-[#3C4043] hover:bg-[#474B4F] text-slate-200'
              }`}
              title="More options"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}


