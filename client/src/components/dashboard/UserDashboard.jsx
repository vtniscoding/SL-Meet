import React, { useState, useEffect, useRef } from 'react';
import {
  CameraOnIcon as Video,
  KeyboardShortcutIcon as Keyboard,
  LeaveRoomIcon as LogOut,
  AlertErrorIcon as AlertCircle,
  LoadingSpinnerIcon as Loader2,
  HomeNavIcon,
  ChatNavIcon,
  MeetingsNavIcon,
  MoreHorizontalNavIcon,
  SettingsNavIcon,
  HistoryNavIcon as History,
} from '../../icons';
import { supabase } from '../../utils/supabase';
import { brandLogo, andyNote } from '../../assets';
import WindowControls from '../common/WindowControls';
import { useRoomHistory } from '../../hooks/useRoomHistory';
import RoomHistoryCard from './RoomHistoryCard';

// Fun Andy Pop Sound (Single pleasant, bubbly cartoon pop via Web Audio API)
const playAndyPopSound = () => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(920, now + 0.07);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  } catch (err) {
    console.warn('AudioContext failed:', err);
  }
};

export default function UserDashboard({
  user,
  profile,
  onSignOut,
  onCreateMeeting,
  onJoinMeeting,
}) {
  const [activeTab, setActiveTab] = useState('home');
  const [roomCode, setRoomCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [isCheckingCode, setIsCheckingCode] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const menuRef = useRef(null);

  // Persistent Room History Hook (Scoped by user ID)
  const { rooms, addRoom, updateRoomName, removeRoom } = useRoomHistory(user?.id);

  // Live Clock (Hours:Minutes • Day, Date)
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Close avatar dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayName = profile?.display_name || user?.email?.split('@')[0] || 'User';
  const userInitial = displayName.charAt(0).toUpperCase();

  // Andy Note Pop-up & Fun Sound State
  const [showAndyPopup, setShowAndyPopup] = useState(false);
  const [isAndyBouncing, setIsAndyBouncing] = useState(false);
  const andyRef = useRef(null);
  const popupRef = useRef(null);

  const handleAndyClick = (e) => {
    if (e) e.stopPropagation();

    // 1. Play 1 fun, pleasant pop sound
    playAndyPopSound();

    // 2. Cute quick bounce animation
    setIsAndyBouncing(true);
    setTimeout(() => setIsAndyBouncing(false), 200);

    // 3. Toggle message pop-up (click to open, click again to close)
    setShowAndyPopup((prev) => !prev);
  };

  // Close Andy pop-up when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (
        showAndyPopup &&
        popupRef.current &&
        !popupRef.current.contains(e.target) &&
        andyRef.current &&
        !andyRef.current.contains(e.target)
      ) {
        setShowAndyPopup(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showAndyPopup]);

  // Create New Meeting Action
  const handleCreate = async () => {
    setIsCreatingRoom(true);
    try {
      const createdId = await onCreateMeeting();
      if (createdId) {
        addRoom(createdId);
      }
    } finally {
      setIsCreatingRoom(false);
    }
  };

  // Join Existing Meeting Action
  const handleJoin = async (e) => {
    e.preventDefault();
    const cleanCode = roomCode.trim();
    if (!cleanCode) return;

    setCodeError('');
    setIsCheckingCode(true);

    try {
      // Validate that room exists and is active in Supabase
      const { data: roomData, error } = await supabase
        .from('rooms')
        .select('id, status')
        .eq('id', cleanCode)
        .eq('status', 'active')
        .maybeSingle();

      if (error) {
        console.error('Error verifying room in Supabase:', error);
        setCodeError('Cannot verify meeting room right now. Please try again.');
        return;
      }

      if (!roomData) {
        setCodeError('Meeting code does not exist or has ended.');
        return;
      }

      addRoom(cleanCode);
      onJoinMeeting(cleanCode);
    } catch (err) {
      console.error('Unexpected error checking room:', err);
      setCodeError('Failed to verify meeting code.');
    } finally {
      setIsCheckingCode(false);
    }
  };

  const formattedTime = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formattedDate = currentTime.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#EAECEE] text-slate-900 flex flex-col font-sans select-none">
      {/* 1. Custom Frameless Window TitleBar (Zoom Workplace Style) */}
      <header
        onDoubleClick={() => window.electronAPI?.toggleMaximize?.()}
        style={{ WebkitAppRegion: 'drag' }}
        data-tauri-drag-region="true"
        className="w-full h-12 pl-4 md:pl-5 pr-3 flex items-center justify-between z-30 shrink-0 select-none bg-transparent"
      >
        {/* Top-Left: SLMeet Brand Logo (Balanced Proportion) */}
        <div
          style={{ WebkitAppRegion: 'no-drag' }}
          className="flex items-center"
        >
          <img
            src={brandLogo}
            alt="SLMeet Logo"
            className="h-7 md:h-8 w-auto object-contain pointer-events-auto transition-all"
          />
        </div>

        {/* Top-Right: [Avatar] [Minimize] [Maximize/Restore] [Close] */}
        <div className="flex items-center h-full space-x-2.5">
          {/* Compact Profile Avatar Button */}
          <div
            className="relative"
            ref={menuRef}
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            <button
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="w-7 h-7 rounded-full bg-[#5CA0F2] hover:bg-[#4A8FE0] text-white font-bold text-xs flex items-center justify-center transition-all shadow-xs ring-1 ring-[#5CA0F2]/40 outline-none cursor-pointer"
              title="Account profile"
            >
              {userInitial}
            </button>

            {/* Profile Dropdown Menu */}
            {isMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 p-3.5 z-50 animate-in fade-in duration-150">
                <div className="flex items-center space-x-3 pb-3 border-b border-slate-100">
                  <div className="w-10 h-10 rounded-full bg-[#5CA0F2] text-white font-bold text-sm flex items-center justify-center shrink-0">
                    {userInitial}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{displayName}</p>
                    <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      onSignOut();
                    }}
                    className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer outline-none"
                  >
                    <LogOut className="w-4 h-4 shrink-0" />
                    <span>Log Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Windows 11 Native-Style Window Control Buttons */}
          <WindowControls />
        </div>
      </header>

      {/* 2. Main Body Area: [Sidebar | Dock 1 | Dock 2] (Balanced top spacing) */}
      <div className="flex-1 flex overflow-hidden px-3 pb-3 pt-1 gap-2.5">
        {/* Left Sidebar Rail (Zoom style icon column) */}
        <aside className="w-16 md:w-[70px] flex flex-col items-center justify-between py-2 shrink-0 select-none">
          {/* Top Group: Home, Chat, Meetings, More */}
          <div className="flex flex-col items-center space-y-2 w-full px-1">
            {/* Home (Active) */}
            <button
              onClick={() => setActiveTab('home')}
              className="w-full py-2.5 rounded-xl flex flex-col items-center bg-white shadow-xs text-[#0B57D0] transition-all cursor-pointer border border-slate-200/60"
              title="Home"
            >
              <HomeNavIcon className="w-5 h-5 mb-1 text-[#0B57D0]" />
              <span className="text-[10px] font-bold">Home</span>
            </button>

            {/* Chat (UI Placeholder) */}
            <button
              type="button"
              className="w-full py-2.5 rounded-xl flex flex-col items-center text-slate-500 hover:text-slate-800 hover:bg-white/60 transition-all cursor-pointer"
              title="Chat"
            >
              <ChatNavIcon className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-medium">Chat</span>
            </button>

            {/* Meetings (UI Placeholder) */}
            <button
              type="button"
              className="w-full py-2.5 rounded-xl flex flex-col items-center text-slate-500 hover:text-slate-800 hover:bg-white/60 transition-all cursor-pointer"
              title="Meetings"
            >
              <MeetingsNavIcon className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-medium">Meetings</span>
            </button>

            {/* More (UI Placeholder) */}
            <button
              type="button"
              className="w-full py-2.5 rounded-xl flex flex-col items-center text-slate-500 hover:text-slate-800 hover:bg-white/60 transition-all cursor-pointer"
              title="More"
            >
              <MoreHorizontalNavIcon className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-medium">More</span>
            </button>
          </div>

          {/* Bottom Settings Button (Solid Filled Gear) */}
          <div className="w-full px-1">
            <button
              type="button"
              className="w-full py-2.5 rounded-xl flex flex-col items-center text-slate-500 hover:text-slate-800 hover:bg-white/60 transition-all cursor-pointer"
              title="Settings"
            >
              <SettingsNavIcon className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-medium">Settings</span>
            </button>
          </div>
        </aside>

        {/* DOCK 1: Main Action Zone (White Card, Flex-1, Stretches/Shrinks) */}
        <section className="flex-1 bg-white rounded-xl border border-slate-200/80 shadow-xs p-8 md:p-12 lg:p-16 flex flex-col justify-center overflow-y-auto">
          <div className="max-w-xl space-y-6">
            <div>
              <h1 className="text-xl sm:text-2xl md:text-[26px] font-bold text-slate-900 tracking-tight leading-tight">
                Welcome, {displayName}!
              </h1>
              <p className="text-sm sm:text-base text-slate-600 mt-2 leading-relaxed">
                Start an instant meeting or enter a code or link to join.
              </p>
            </div>

            {/* Action Row: Enter Code Pill (with embedded Join) + New Button */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
              {/* Inline Join by Code Input Pill */}
              <form
                onSubmit={handleJoin}
                className="flex-1 max-w-md bg-[#e9eef6] rounded-full p-1 pl-4 flex items-center transition-all border border-transparent focus-within:border-[#0b57d0]/30 focus-within:bg-white focus-within:shadow-sm"
              >
                <Keyboard className="w-5 h-5 text-slate-600 shrink-0 mr-3" />
                <input
                  type="text"
                  placeholder="Enter code or link"
                  value={roomCode}
                  onChange={(e) => {
                    setRoomCode(e.target.value);
                    if (codeError) setCodeError('');
                  }}
                  className="bg-transparent text-slate-800 text-sm placeholder-slate-500 focus:outline-none flex-1 min-w-0 py-1.5"
                />
                <button
                  type="submit"
                  disabled={isCheckingCode || !roomCode.trim()}
                  className={`font-medium text-sm px-5 py-2 rounded-full transition-all shrink-0 cursor-pointer flex items-center space-x-1.5 ${
                    roomCode.trim()
                      ? 'bg-[#0b57d0] hover:bg-[#0842a0] text-white shadow-xs'
                      : 'text-slate-400 bg-transparent cursor-not-allowed'
                  }`}
                >
                  {isCheckingCode && <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />}
                  <span>Join</span>
                </button>
              </form>

              {/* New Meeting Button (Brand Primary Theme) */}
              <button
                onClick={handleCreate}
                disabled={isCreatingRoom}
                className="bg-[#5CA0F2] hover:bg-[#4A8FE0] disabled:bg-[#5CA0F2]/70 text-white font-semibold text-sm sm:text-base px-5 py-2.5 rounded-full shadow-sm transition-all flex items-center justify-center space-x-2 cursor-pointer outline-none shrink-0"
              >
                {isCreatingRoom ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <Video className="w-4 h-4 text-white" />
                )}
                <span>New</span>
              </button>
            </div>

            {/* Error Message Feedback */}
            {codeError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2 text-xs text-red-600">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{codeError}</span>
              </div>
            )}
          </div>
        </section>

        {/* DOCK 2: Right Panel (White Card, Fixed Width ~400-430px) */}
        <section className="w-[380px] lg:w-[410px] xl:w-[430px] shrink-0 bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 md:p-6 flex flex-col h-full overflow-hidden relative">
          {/* Live Date & Time Widget Card (Zoom Workplace style) */}
          <div className="w-full bg-gradient-to-br from-[#1E293B] to-[#0F172A] text-white rounded-xl p-5 shadow-sm relative overflow-hidden shrink-0">
            <div className="relative z-10">
              <div className="text-3xl font-extrabold tracking-tight">
                {formattedTime}
              </div>
              <div className="text-xs text-slate-300 font-medium mt-1">
                {formattedDate}
              </div>
            </div>
            {/* Subtle background decorative gradient glow */}
            <div className="absolute -right-4 -bottom-6 w-28 h-28 bg-blue-500/15 rounded-full blur-xl pointer-events-none" />
          </div>

          {/* Sub-Dock Container: Recent Rooms (Bo tròn linh hoạt, tự động cuộn khi mở rộng) */}
          <div className="flex-1 flex flex-col my-3 min-h-0 bg-slate-50/70 rounded-xl border border-slate-200/80 p-3.5 overflow-hidden">
            {/* Sub-Dock Header */}
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200/60 shrink-0">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800">
                <History className="w-3.5 h-3.5 text-[#5CA0F2]" />
                <span>Recent Meetings</span>
                {rooms.length > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-[#0B57D0]">
                    {rooms.length}
                  </span>
                )}
              </div>
            </div>

            {/* Scrollable Room List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {rooms.length === 0 ? (
                <div className="h-full min-h-[90px] flex flex-col items-center justify-center text-center p-3 text-slate-400">
                  <p className="text-xs font-medium text-slate-500">No recent meetings</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 max-w-[200px]">
                    Created or joined rooms will be saved here automatically.
                  </p>
                </div>
              ) : (
                rooms.map((room) => (
                  <RoomHistoryCard
                    key={room.id}
                    room={room}
                    onJoin={onJoinMeeting}
                    onRename={updateRoomName}
                    onDelete={removeRoom}
                  />
                ))
              )}
            </div>
          </div>

          {/* Bottom Area: Compact Speech Bubble on the Left + Andy Note on the Right */}
          <div className="flex items-end justify-end select-none shrink-0 relative mt-auto">
            {/* Compact Speech Bubble (Messenger Blue Bubble to the left of Andy) */}
            {showAndyPopup && (
              <div
                ref={popupRef}
                className="mr-0.5 sm:mr-0 mb-10 bg-[#5CA0F2] text-white rounded-[18px] py-1.5 px-3 text-[11px] sm:text-xs font-medium max-w-[105px] sm:max-w-[115px] relative z-20 animate-in fade-in zoom-in-95 duration-150 select-text text-center leading-tight shadow-none border-0"
              >
                {/* Speech Bubble Tail at bottom-right (as shown in reference image) */}
                <svg
                  aria-hidden="true"
                  className="absolute -bottom-2 right-2 w-3.5 h-2.5 text-[#5CA0F2] fill-current pointer-events-none"
                  viewBox="0 0 14 10"
                >
                  <path d="M0 0 L11 0 C11 3 11.5 6 13.5 9.5 C9 8.5 4.5 5 0 0 Z" />
                </svg>
                <p className="whitespace-normal break-words">
                  Ready for meetings?
                </p>
              </div>
            )}

            {/* Interactive Andy Note Character */}
            <div
              ref={andyRef}
              onClick={handleAndyClick}
              className="cursor-pointer select-none group relative shrink-0"
              title="Andy Note"
            >
              <img
                src={andyNote}
                alt="Andy note decoration"
                className={`w-24 sm:w-28 md:w-32 max-h-40 md:max-h-44 object-contain -mb-5 md:-mb-12 select-none transition-all duration-200 ${
                  isAndyBouncing
                    ? 'scale-100 -rotate-3 brightness-105'
                    : 'opacity-85 hover:opacity-100 hover:scale-105 active:scale-95'
                }`}
                draggable="false"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
