import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Captions, Eye, EyeOff, Monitor, Grid, Columns, Maximize2, PinOff, MoreVertical, Check, MessageSquare, Users, Download } from 'lucide-react';

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
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onToggleAi,
  onToggleHandTracking,
  onToggleChat,
  onTogglePeople,
  onChangeLayout,
  onExportTranscript,
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

  const handleSelectLayout = (mode) => {
    if (onChangeLayout) {
      onChangeLayout(mode);
    }
    setShowMoreMenu(false);
  };

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

        {/* AI CC Subtitle Toggle Button */}
        <button
          onClick={onToggleAi}
          className={`px-4 h-12 rounded-full text-xs font-bold flex items-center space-x-2 transition-colors outline-none focus:outline-none focus:ring-0 ${
            isAiEnabled
              ? 'bg-[#8AB4F8] text-[#202124]'
              : 'bg-[#3C4043] hover:bg-[#474B4F] text-slate-300'
          }`}
          title={isAiEnabled ? 'Turn OFF ASL AI Subtitles' : 'Turn ON ASL AI Subtitles'}
        >
          <Captions className="w-5 h-5" />
          <span>AI CC</span>
        </button>

        {/* Hand Tracking Toggle Button */}
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

          {/* 3-Dots More Options Menu Button & Layout Selector Popup */}
          <div className="relative" ref={menuRef}>
            {showMoreMenu && (
              <div className="absolute bottom-14 right-0 w-60 bg-[#28292C] rounded-2xl p-2 shadow-2xl z-50 text-slate-200 text-xs font-medium space-y-1 outline-none focus:outline-none border border-slate-700/60">
                <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-700/50">
                  Change layout
                </div>

                {/* Option 1: Tiled View */}
                <button
                  onClick={() => handleSelectLayout('tiled')}
                  className={`w-full px-3 py-2 rounded-xl flex items-center justify-between transition-colors outline-none focus:outline-none ${
                    layoutMode === 'tiled' ? 'bg-[#3C4043] text-white font-semibold' : 'hover:bg-[#35373A] text-slate-300'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Grid className="w-4 h-4 text-slate-300" />
                    <span>Tiled View</span>
                  </div>
                  {layoutMode === 'tiled' && <Check className="w-4 h-4 text-blue-400" />}
                </button>

                {/* Option 2: Sidebar View */}
                <button
                  onClick={() => handleSelectLayout('sidebar')}
                  className={`w-full px-3 py-2 rounded-xl flex items-center justify-between transition-colors outline-none focus:outline-none ${
                    layoutMode === 'sidebar' ? 'bg-[#3C4043] text-white font-semibold' : 'hover:bg-[#35373A] text-slate-300'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Columns className="w-4 h-4 text-slate-300" />
                    <span>Sidebar View</span>
                  </div>
                  {layoutMode === 'sidebar' && <Check className="w-4 h-4 text-blue-400" />}
                </button>

                {/* Option 3: Spotlight View */}
                <button
                  onClick={() => handleSelectLayout('spotlight')}
                  className={`w-full px-3 py-2 rounded-xl flex items-center justify-between transition-colors outline-none focus:outline-none ${
                    layoutMode === 'spotlight' ? 'bg-[#3C4043] text-white font-semibold' : 'hover:bg-[#35373A] text-slate-300'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Maximize2 className="w-4 h-4 text-slate-300" />
                    <span>Spotlight View</span>
                  </div>
                  {layoutMode === 'spotlight' && <Check className="w-4 h-4 text-blue-400" />}
                </button>

                <div className="border-t border-slate-700/50 my-1 pt-1">
                  {/* Option 4: Export Transcript */}
                  <button
                    onClick={() => {
                      if (onExportTranscript) onExportTranscript();
                      setShowMoreMenu(false);
                    }}
                    className="w-full px-3 py-2 rounded-xl flex items-center space-x-3 hover:bg-[#35373A] text-slate-300 transition-colors outline-none focus:outline-none"
                    title="Export meeting transcript as .txt file"
                  >
                    <Download className="w-4 h-4 text-blue-400" />
                    <span>Export Transcript</span>
                  </button>
                </div>
              </div>

            )}

            <button
              onClick={() => setShowMoreMenu((prev) => !prev)}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors outline-none focus:outline-none focus:ring-0 ${
                showMoreMenu
                  ? 'bg-[#474B4F] text-white'
                  : 'bg-[#3C4043] hover:bg-[#474B4F] text-slate-200'
              }`}
              title="More options (Change layout)"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}


