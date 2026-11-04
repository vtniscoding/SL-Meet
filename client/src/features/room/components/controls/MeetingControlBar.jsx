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
  UserGroupIcon as Users,
  HandsIcon as Hands,
} from '@sl-meet/shared/icons';

/**
 * Semantic Component: Google Meet Style Control Bar
 * Clean borderless controls with 3-Dots Popup Menu in main control bar.
 * Responsive for Windows Split Screen (Snap Assist) down to narrow widths:
 * secondary bar hides on smaller screens, seamlessly transferring People & Chat into 3-dots menu.
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
  isCaptionsEnabled = false,
  captionMode = 'SLT',
  isSttEnabled = false,
  sttStatus = 'idle',
  isSignLanguageEnabled = false,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onToggleAi,
  onToggleHandTracking,
  onToggleStt,
  onToggleCaptions,
  onToggleSignLanguageSupport,
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

  const ccActive = isCaptionsEnabled !== undefined ? isCaptionsEnabled : (userRole === 'signer' ? isSttEnabled : isAiEnabled);

  return (
    <footer className="w-full flex items-center justify-between pt-1 sm:pt-2 z-30 relative select-none">
      {/* Left Utility: Unpin Stream Button (Shrinkable on narrow widths) */}
      <div className="flex-1 min-w-0 flex items-center space-x-2">
        {pinnedId && (
          <button
            onClick={onResetPin}
            className="px-2.5 sm:px-3.5 py-1.5 rounded-full bg-[#3C4043] hover:bg-[#474B4F] text-slate-200 text-[11px] sm:text-xs font-medium flex items-center space-x-1.5 transition-colors outline-none focus:outline-none focus:ring-0 shrink-0 cursor-pointer"
            title="Unpin active stream"
          >
            <PinOff className="w-3.5 h-3.5 text-slate-300" />
            <span className="hidden sm:inline">Unpin View</span>
          </button>
        )}
      </div>

      {/* Main Center Control Bar Container (Media & Call Controls) */}
      <div className="relative bg-[#202124] px-3 sm:px-6 py-2 sm:py-3 rounded-full flex items-center space-x-1.5 sm:space-x-3 shadow-2xl shrink-0">
        {/* Microphone Toggle Button */}
        <button
          onClick={onToggleMic}
          className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-colors outline-none focus:outline-none focus:ring-0 cursor-pointer ${
            isMuted
              ? 'bg-[#EA4335] hover:bg-[#D93025] text-white'
              : 'bg-[#3C4043] hover:bg-[#474B4F] text-slate-200'
          }`}
          title={isMuted ? 'Turn on microphone' : 'Turn off microphone'}
        >
          {isMuted ? <MicOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Mic className="w-4 h-4 sm:w-5 sm:h-5" />}
        </button>

        {/* Camera Toggle Button */}
        <button
          onClick={onToggleCamera}
          className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-colors outline-none focus:outline-none focus:ring-0 cursor-pointer ${
            isCameraOff
              ? 'bg-[#EA4335] hover:bg-[#D93025] text-white'
              : 'bg-[#3C4043] hover:bg-[#474B4F] text-slate-200'
          }`}
          title={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
        >
          {isCameraOff ? <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Video className="w-4 h-4 sm:w-5 sm:h-5" />}
        </button>

        {/* Screen Share Toggle Button */}
        <button
          onClick={onToggleScreenShare}
          className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-colors outline-none focus:outline-none focus:ring-0 cursor-pointer ${
            isScreenSharing
              ? 'bg-[#8AB4F8] text-[#202124]'
              : 'bg-[#3C4043] hover:bg-[#474B4F] text-slate-200'
          }`}
          title={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}
        >
          <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        {/* Hand Tracking AI Vision Toggle Button (Signers only) */}
        {userRole === 'signer' && (
          <button
            onClick={onToggleHandTracking}
            className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-colors outline-none focus:outline-none focus:ring-0 cursor-pointer ${
              isHandTrackingEnabled
                ? 'bg-[#8AB4F8] text-[#202124]'
                : 'bg-[#3C4043] hover:bg-[#474B4F] text-slate-300'
            }`}
            title={isHandTrackingEnabled ? 'Turn OFF AI Vision Tracking' : 'Turn ON AI Vision Tracking'}
          >
            {isHandTrackingEnabled ? <Eye className="w-4 h-4 sm:w-5 sm:h-5" /> : <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" />}
          </button>
        )}

        {/* Universal Single Subtitles (CC) Toggle Button */}
        <button
          onClick={onToggleCaptions || (userRole === 'signer' ? onToggleStt : onToggleAi)}
          className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-colors outline-none focus:outline-none focus:ring-0 cursor-pointer ${
            ccActive
              ? 'bg-[#8AB4F8] text-[#202124]'
              : 'bg-[#3C4043] hover:bg-[#474B4F] text-slate-300'
          }`}
          title={ccActive ? 'Turn OFF captions' : 'Turn ON captions'}
        >
          {sttStatus === 'loading' && ccActive ? (
            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Captions className="w-4 h-4 sm:w-5 sm:h-5" />
          )}
        </button>

        {/* 3-Dots More Options Menu Button (Integrated in Main Control Bar) */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMoreMenu((prev) => !prev)}
            className={`relative w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-colors outline-none focus:outline-none focus:ring-0 cursor-pointer ${
              showMoreMenu
                ? 'bg-[#8AB4F8] text-[#202124]'
                : 'bg-[#3C4043] hover:bg-[#474B4F] text-slate-200'
            }`}
            title="More options"
          >
            <MoreVertical className="w-4 h-4 sm:w-5 sm:h-5" />
            {/* If secondary bar is hidden on narrow screens and there are unread messages, display an unread dot */}
            {unreadCount > 0 && (
              <span className="md:hidden absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#202124] animate-pulse" />
            )}
          </button>

          {/* Popup Menu */}
          {showMoreMenu && (
            <div className="absolute right-0 bottom-full mb-3 w-64 bg-[#1E1F22] border border-white/15 rounded-xl shadow-2xl p-1.5 z-50 text-slate-200 text-xs animate-in fade-in zoom-in-95 duration-100 space-y-1">
              {/* Responsive: People & Chat options (visible only when secondary bar is hidden on smaller windows < 768px, seamless without divider) */}
              <div className="md:hidden space-y-1">
                {/* People Option */}
                <button
                  type="button"
                  onClick={() => {
                    onTogglePeople?.();
                    setShowMoreMenu(false);
                  }}
                  className={`w-full px-3 py-2 rounded-lg flex items-center justify-between transition-colors text-left outline-none cursor-pointer group ${
                    isPeopleOpen
                      ? 'bg-white/15 text-white'
                      : 'text-slate-200 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <Users
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isPeopleOpen
                          ? 'text-[#8AB4F8]'
                          : 'text-slate-400 group-hover:text-white'
                      }`}
                    />
                    <span
                      className={`text-xs truncate transition-colors ${
                        isPeopleOpen
                          ? 'text-[#8AB4F8] font-semibold'
                          : 'text-slate-200 group-hover:text-white font-medium'
                      }`}
                    >
                      People
                    </span>
                  </div>
                  {participantCount > 1 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-600/80 text-white shrink-0">
                      {participantCount}
                    </span>
                  )}
                </button>

                {/* Chat Option */}
                <button
                  type="button"
                  onClick={() => {
                    onToggleChat?.();
                    setShowMoreMenu(false);
                  }}
                  className={`w-full px-3 py-2 rounded-lg flex items-center justify-between transition-colors text-left outline-none cursor-pointer group ${
                    isChatOpen
                      ? 'bg-white/15 text-white'
                      : 'text-slate-200 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <MessageSquare
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isChatOpen
                          ? 'text-[#8AB4F8]'
                          : 'text-slate-400 group-hover:text-white'
                      }`}
                    />
                    <span
                      className={`text-xs truncate transition-colors ${
                        isChatOpen
                          ? 'text-[#8AB4F8] font-semibold'
                          : 'text-slate-200 group-hover:text-white font-medium'
                      }`}
                    >
                      In call message
                    </span>
                  </div>
                  {unreadCount > 0 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500 text-white shrink-0 animate-pulse">
                      {unreadCount}
                    </span>
                  )}
                </button>
              </div>

              {/* Sign language support Option */}
              {onToggleSignLanguageSupport && (
                <button
                  type="button"
                  onClick={() => {
                    onToggleSignLanguageSupport();
                    setShowMoreMenu(false);
                  }}
                  className="w-full px-3 py-2 rounded-lg flex items-center justify-between text-slate-200 hover:text-white hover:bg-white/10 active:bg-white/15 transition-all text-left outline-none cursor-pointer group"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <Hands
                      className={`w-4 h-4 shrink-0 transition-colors ${
                        isSignLanguageEnabled
                          ? 'text-[#8AB4F8]'
                          : 'text-slate-400 group-hover:text-white'
                      }`}
                    />
                    <span
                      className={`text-xs truncate transition-colors ${
                        isSignLanguageEnabled
                          ? 'text-[#8AB4F8] font-semibold'
                          : 'text-slate-200 group-hover:text-white font-medium'
                      }`}
                    >
                      Sign language support
                    </span>
                  </div>
                  {/* Clean Mini Toggle Switch */}
                  <div
                    className={`w-8 h-[18px] rounded-full transition-colors duration-200 ease-in-out relative shrink-0 p-[2px] ${
                      isSignLanguageEnabled
                        ? 'bg-[#5CA0F2]'
                        : 'bg-white/20 group-hover:bg-white/30'
                    }`}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out ${
                        isSignLanguageEnabled ? 'translate-x-[14px]' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Red End Call / Leave Room Button */}
        <button
          onClick={onLeaveRoom}
          className="w-12 sm:w-14 h-10 sm:h-12 rounded-full bg-[#EA4335] hover:bg-[#D93025] text-white flex items-center justify-center transition-colors shadow-md outline-none focus:outline-none focus:ring-0 cursor-pointer"
          title="Leave call"
        >
          <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </div>

      {/* Right Side Utility: Secondary Mini Control Bar (Hidden on narrow screens < 768px) */}
      <div className="flex-1 min-w-0 flex justify-end items-center">
        <div className="hidden md:flex bg-[#202124] px-2 sm:px-3 py-1 sm:py-1.5 rounded-full items-center space-x-1 sm:space-x-2 shadow-2xl border border-slate-700/40">
          {/* People / Participants List Drawer Toggle Button */}
          <button
            onClick={onTogglePeople}
            className={`relative w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-colors outline-none focus:outline-none focus:ring-0 cursor-pointer ${
              isPeopleOpen
                ? 'bg-[#8AB4F8] text-[#202124]'
                : 'bg-[#3C4043] hover:bg-[#474B4F] text-slate-200'
            }`}
            title="People"
          >
            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            {participantCount > 1 && (
              <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[9px] sm:text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold border-2 border-[#202124]">
                {participantCount}
              </span>
            )}
          </button>

          {/* In-Call Text Chat Drawer Toggle Button */}
          <button
            onClick={onToggleChat}
            className={`relative w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-colors outline-none focus:outline-none focus:ring-0 cursor-pointer ${
              isChatOpen
                ? 'bg-[#8AB4F8] text-[#202124]'
                : 'bg-[#3C4043] hover:bg-[#474B4F] text-slate-200'
            }`}
            title="In call message"
          >
            <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] sm:text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold border-2 border-[#202124] animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </footer>
  );
}
