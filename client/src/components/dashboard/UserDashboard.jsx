import React, { useState, useEffect, useRef } from 'react';
import { Video, Keyboard, LogOut, User, AlertCircle, Loader2, Sparkles, Shield, Clock } from 'lucide-react';
import { supabase } from '../../utils/supabase';

export default function UserDashboard({
  user,
  profile,
  onSignOut,
  onCreateMeeting,
  onJoinMeeting,
}) {
  const [roomCode, setRoomCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [isCheckingCode, setIsCheckingCode] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const menuRef = useRef(null);

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

  // Create New Meeting Action
  const handleCreate = async () => {
    setIsCreatingRoom(true);
    try {
      await onCreateMeeting();
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
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="w-screen h-screen overflow-hidden bg-slate-50 text-slate-900 flex flex-col justify-between font-sans select-none">
      {/* Top Header Navigation */}
      <header className="w-full bg-white border-b border-slate-200/80 px-6 md:px-12 py-3 flex items-center justify-between z-20 shadow-xs">
        {/* Left: Brand Logo */}
        <div className="flex items-center space-x-3">
          <img
            src="/assets/brand-logo.png"
            alt="SL-Meet Logo"
            className="h-10 md:h-12 w-auto object-contain"
          />
        </div>

        {/* Right: Real-time Clock & Avatar Dropdown */}
        <div className="flex items-center space-x-5">
          {/* Time Display */}
          <div className="hidden sm:flex items-center space-x-1.5 text-xs md:text-sm text-slate-500 font-medium">
            <Clock className="w-4 h-4 text-slate-400" />
            <span>{formattedTime}</span>
            <span className="text-slate-300">•</span>
            <span>{formattedDate}</span>
          </div>

          {/* User Avatar with Sign Out Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="w-10 h-10 rounded-full bg-[#5CA0F2] hover:bg-[#4A8FE0] text-white font-bold text-sm flex items-center justify-center transition-all shadow-sm ring-2 ring-transparent hover:ring-[#5CA0F2]/40 outline-none cursor-pointer"
              title="Account menu"
            >
              {userInitial}
            </button>

            {/* Dropdown Menu Popup */}
            {isMenuOpen && (
              <div className="absolute right-0 mt-2.5 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 p-3.5 z-50 animate-in fade-in duration-150">
                {/* Account Details */}
                <div className="flex items-center space-x-3 pb-3 border-b border-slate-100">
                  <div className="w-11 h-11 rounded-full bg-[#5CA0F2] text-white font-bold text-base flex items-center justify-center shrink-0">
                    {userInitial}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{displayName}</p>
                    <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                    <span className="inline-block mt-1 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-blue-50 text-[#5CA0F2] border border-blue-100">
                      SL-Meet Account
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-2">
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      onSignOut();
                    }}
                    className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer outline-none"
                  >
                    <LogOut className="w-4 h-4 shrink-0" />
                    <span>Log Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="w-full flex-1 max-w-6xl mx-auto px-6 md:px-10 py-6 md:py-10 flex flex-col justify-center overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Welcome & Meeting Actions */}
          <div className="lg:col-span-7 space-y-6">
            <div>
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-100/70 text-[#2B73C9] text-xs font-bold mb-3">
                <span>AI-Powered Video Calling Support Sign Language</span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-[40px] font-black text-slate-900 tracking-tight leading-tight">
                Welcome, {displayName}!
              </h1>
              <p className="text-sm sm:text-base text-slate-600 mt-2 max-w-lg leading-relaxed">
                Start a new accessible meeting or enter a code to join an ongoing call.
              </p>
            </div>

            {/* Action Row */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 pt-2">
              {/* New Meeting Primary Button */}
              <button
                onClick={handleCreate}
                disabled={isCreatingRoom}
                className="bg-[#5CA0F2] hover:bg-[#4A8FE0] disabled:bg-[#5CA0F2]/70 text-white font-bold text-sm sm:text-base px-6 py-3.5 rounded-2xl shadow-md transition-all flex items-center justify-center space-x-2.5 cursor-pointer outline-none shrink-0"
              >
                {isCreatingRoom ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Video className="w-5 h-5" />
                )}
                <span>New meeting</span>
              </button>

              {/* Inline Join by Code Input Form */}
              <form onSubmit={handleJoin} className="flex-1 flex items-center space-x-2">
                <div className="relative flex-1">
                  <Keyboard className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Enter code (e.g. slm-abc-xyz)"
                    value={roomCode}
                    onChange={(e) => {
                      setRoomCode(e.target.value);
                      if (codeError) setCodeError('');
                    }}
                    className={`w-full bg-white text-slate-800 text-xs sm:text-sm pl-10 pr-3.5 py-3.5 rounded-2xl border transition-colors focus:outline-none ${
                      codeError
                        ? 'border-red-400 focus:border-red-500'
                        : 'border-slate-300 focus:border-[#5CA0F2]'
                    }`}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isCheckingCode || !roomCode.trim()}
                  className="bg-white border border-slate-300 hover:border-slate-400 disabled:opacity-50 text-slate-800 font-bold text-xs sm:text-sm px-5 py-3.5 rounded-2xl transition-all cursor-pointer outline-none shrink-0 shadow-xs flex items-center space-x-1.5"
                >
                  {isCheckingCode && <Loader2 className="w-4 h-4 animate-spin text-[#5CA0F2]" />}
                  <span>Join</span>
                </button>
              </form>
            </div>

            {/* Error Message Feedback */}
            {codeError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center space-x-2 text-xs text-red-600">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{codeError}</span>
              </div>
            )}

            {/* Feature Highlights Card */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <h4 className="text-xs font-bold text-slate-900">Sign Language AI</h4>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-normal">
                  Real-time gesture recognition translated directly to visible subtitles.
                </p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <h4 className="text-xs font-bold text-slate-900">Secure WebRTC</h4>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-normal">
                  Encrypted peer-to-peer audio and video transmission with zero recording.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Hero Art / Illustration Card */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm text-center max-w-sm w-full">
              <img
                src="/assets/home-illustration.png"
                alt="SL-Meet Call"
                className="w-44 md:w-52 h-auto mx-auto mb-4 object-contain"
              />
              <h3 className="text-base font-bold text-slate-900">Accessible Communication</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Connect deaf, hard of hearing, and hearing participants seamlessly in any video room.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Pill */}
      <footer className="w-full py-3 px-6 md:px-12 flex items-center justify-between border-t border-slate-200/60 bg-white/60 text-xs text-slate-400">
        <span></span>
        <div className="flex items-center space-x-2">
          <div className="h-2.5 w-16 rounded-full bg-[#5CA0F2]" />
          <div className="h-2.5 w-5 rounded-full bg-[#5CA0F2]/40" />
        </div>
      </footer>
    </div>
  );
}
