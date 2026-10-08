import React, { useState } from 'react';
import RoomView from './components/RoomView';
import WaitingLobby from './components/room/WaitingLobby';
import { useLocalMedia } from './hooks/useLocalMedia';
import { useSocket } from './hooks/useSocket';

export default function App() {
  const [currentView, setCurrentView] = useState('home'); // 'home' | 'lobby' | 'room'
  const [activeRoomId, setActiveRoomId] = useState('');
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [roomCode, setRoomCode] = useState('');

  // Hardware Media Stream & Device State (Shared between Lobby & Room)
  const mediaState = useLocalMedia();

  // Socket connection hook
  const { isConnected, joinRoom, leaveRoom, toggleConnection } = useSocket();

  // 3D Tilt Hover State for Hero Illustration
  const [tiltStyle, setTiltStyle] = useState({
    transform: 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
    transition: 'transform 0.5s cubic-bezier(0.03, 0.98, 0.52, 0.99)',
  });

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -12;
    const rotateY = ((x - centerX) / centerX) * 12;

    setTiltStyle({
      transform: `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.06, 1.06, 1.06)`,
      transition: 'transform 0.1s ease-out',
    });
  };

  const handleMouseLeave = () => {
    setTiltStyle({
      transform: 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
      transition: 'transform 0.6s cubic-bezier(0.03, 0.98, 0.52, 0.99)',
    });
  };

  const handleJoinSubmit = (e) => {
    e.preventDefault();
    const targetRoom = roomCode.trim();
    if (targetRoom) {
      setActiveRoomId(targetRoom);
      setCurrentView('lobby');
      setShowCodeInput(false);
      setRoomCode('');
    }
  };

  const handleEnterMeetingFromLobby = () => {
    setCurrentView('room');
    if (!isConnected) {
      toggleConnection();
    }
  };

  const handleLeaveRoom = () => {
    leaveRoom();
    setCurrentView('home');
    setActiveRoomId('');
  };

  // Render Waiting Lobby View
  if (currentView === 'lobby') {
    return (
      <WaitingLobby
        roomId={activeRoomId}
        mediaState={mediaState}
        onJoinMeeting={handleEnterMeetingFromLobby}
        onBackHome={() => setCurrentView('home')}
      />
    );
  }

  // Render Room View
  if (currentView === 'room') {
    return (
      <RoomView
        roomId={activeRoomId}
        onLeaveRoom={handleLeaveRoom}
        mediaState={mediaState}
      />
    );
  }

  // Render Home View
  return (
    <div className="w-screen h-screen overflow-hidden bg-white text-slate-900 flex flex-col justify-between px-8 md:px-14 lg:px-20 py-4 md:py-6 font-sans select-none">
      {/* Main Hero Section & Compact Logo */}
      <main className="w-full flex-1 flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12 my-auto pt-2 overflow-hidden">
        {/* Left Column: Logo, Title & Buttons */}
        <div className="w-full lg:w-[44%] xl:w-[42%] shrink-0 space-y-5">
          {/* Logo placed directly above title with tight spacing */}
          <div className="mb-2">
            <img
              src="/assets/brand-logo.png"
              alt="SL-Meet Logo"
              className="h-16 md:h-20 lg:h-[84px] xl:h-[96px] w-auto object-contain"
            />
          </div>

          {/* Title: Exactly 2 lines matching design mockup */}
          <h1 className="text-3xl sm:text-4xl md:text-[40px] lg:text-[40px] leading-[1.15] tracking-tight">
            <span className="font-normal text-slate-900 block xl:whitespace-nowrap">
              Video calls supporting
            </span>
            <span className="font-[900] text-black block mt-1 xl:whitespace-nowrap">
              deaf and hard of hearing
            </span>
          </h1>

          <p className="text-sm md:text-base text-slate-500 max-w-md leading-relaxed pt-1 font-normal">
            Easily connect via real-time video calls that use AI to support sign language interpretation.
          </p>

          {/* CTAs Row */}
          <div className="flex items-center space-x-4 pt-2">
            <button className="bg-[#5CA0F2] hover:bg-[#4A8FE0] text-white font-semibold text-sm md:text-base px-8 py-3 rounded-full shadow-sm transition-colors">
              Log In
            </button>
            <button className="bg-white border border-[#5CA0F2]/70 text-[#5CA0F2] hover:bg-blue-50/50 font-semibold text-sm md:text-base px-8 py-3 rounded-full transition-colors">
              Register
            </button>
          </div>

          {/* Quick Action Link */}
          <div className="flex items-center space-x-6 text-xs md:text-sm text-slate-600 pt-4">
            <span>Join a meeting now</span>
            <button
              onClick={() => setShowCodeInput(true)}
              className="text-[#5CA0F2] font-semibold underline underline-offset-4"
            >
              Enter code
            </button>
          </div>
        </div>

        {/* Right Column: Interactive 3D Tilt Hover Hero Illustration */}
        <div className="w-full lg:w-[56%] xl:w-[58%] flex justify-center lg:justify-end items-center">
          <div
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={tiltStyle}
            className="cursor-pointer transform-gpu will-change-transform flex items-center justify-center p-2"
          >
            <img
              src="/assets/home-illustration.png"
              alt="AI Sign Language Video Calls"
              className="w-full max-w-xl md:max-w-2xl lg:max-w-3xl xl:max-w-5xl h-auto object-contain filter drop-shadow-xl"
            />
          </div>
        </div>
      </main>

      {/* Enter Code Modal Popup */}
      {showCodeInput && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-100">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Join a Meeting</h3>
            <p className="text-xs text-slate-500 mb-4">Enter any room ID to join or create a meeting room.</p>
            <form onSubmit={handleJoinSubmit} className="space-y-4">
              <input
                type="text"
                placeholder="e.g. room-123"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#5CA0F2]"
                autoFocus
              />
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowCodeInput(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 border border-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-[#5CA0F2]"
                >
                  Join Meeting
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bottom Right Status Bar Pill */}
      <footer className="w-full flex justify-end items-center pt-4">
        <div className="flex items-center space-x-2">
          <div className="h-3.5 w-24 rounded-full bg-[#5CA0F2]" />
          <div className="h-3.5 w-8 rounded-full bg-[#5CA0F2]/40" />
        </div>
      </footer>
    </div>
  );
}
