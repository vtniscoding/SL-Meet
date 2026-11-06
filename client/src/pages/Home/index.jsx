import React, { useState } from 'react';
import {
  AlertErrorIcon as AlertCircle,
  LoadingSpinnerIcon as Loader2,
  HomeNavIcon,
  ChatNavIcon,
  MeetingsNavIcon,
  MoreHorizontalNavIcon,
  SettingsNavIcon,
} from '@sl-meet/shared/icons';
import { TitleBar } from '@sl-meet/shared';
import { NotificationBellMenu, ProfileAvatarMenu } from '../../features';
import InfinityLogoCarousel from './components/InfinityLogoCarousel';
import WaveRibbonBackground from './components/WaveRibbonBackground';
import TransparentVideo from './components/TransparentVideo';
import { brandLogo, videoAds } from '../../assets';

const HOME_VIDEO_CHROMA_KEY = {
  color: '#ffffff',
  threshold: 0.035,
  feather: 0.008,
  spillSuppression: true,
  preserveInterior: true,
  shadowSoftness: 0.2,
};

/**
 * HomePage Component (Landing View)
 * Displays desktop shell header, sidebar rail, elevated hero section with video ads,
 * partner logo carousel, and join meeting modal.
 */
export default function HomePage({
  user,
  profile,
  onSignOut,
  onOpenAuthModal,
  showCodeInput,
  setShowCodeInput,
  roomCode,
  setRoomCode,
  joinName,
  setJoinName,
  codeError,
  setCodeError,
  isCheckingCode,
  handleJoinSubmit,
  userDisplayName,
}) {
  const [isHoveringCard, setIsHoveringCard] = useState(false);

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

        {/* Top-Right: [Notifications] [Avatar / Sign In CTA] [Minimize] [Maximize/Restore] [Close] */}
        <div style={{ WebkitAppRegion: 'no-drag' }} className="flex items-center h-full space-x-2.5">
          <NotificationBellMenu />
          {user && (
            <ProfileAvatarMenu
              user={user}
              profile={profile}
              onSignOut={onSignOut}
            />
          )}
          <button
            onClick={() => onOpenAuthModal('login')}
            style={{ WebkitAppRegion: 'no-drag' }}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full bg-white hover:bg-slate-100 text-[#0B57D0] border border-slate-200/80 shadow-xs transition-colors cursor-pointer ${user ? 'hidden' : 'block'}`}
          >
            Sign In
          </button>
          <TitleBar />
        </div>
      </header>

      {/* 2. Main Body Area: [Sidebar | Home Card] */}
      <div className="flex-1 flex overflow-hidden px-3 pb-3 pt-1 gap-2.5">
        {/* Left Sidebar Rail (Zoom style icon column) */}
        <aside className="w-16 md:w-[70px] flex flex-col items-center justify-between py-2 shrink-0 select-none">
          {/* Top Group: Home, Chat, Meetings, More */}
          <div className="flex flex-col items-center space-y-2 w-full px-1">
            {/* Home (Active) */}
            <button
              type="button"
              className="w-full py-2.5 rounded-xl flex flex-col items-center bg-white shadow-xs text-[#0B57D0] transition-all cursor-pointer border border-slate-200/60"
              title="Home"
            >
              <HomeNavIcon className="w-5 h-5 mb-1 text-[#0B57D0]" />
              <span className="text-[10px] font-bold">Home</span>
            </button>

            {/* Chat (Requires Sign In) */}
            <button
              type="button"
              onClick={() => onOpenAuthModal('login')}
              className="w-full py-2.5 rounded-xl flex flex-col items-center text-slate-500 hover:text-slate-800 hover:bg-white/60 transition-all cursor-pointer"
              title="Chat"
            >
              <ChatNavIcon className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-medium">Chat</span>
            </button>

            {/* Meetings (Requires Sign In) */}
            <button
              type="button"
              onClick={() => onOpenAuthModal('login')}
              className="w-full py-2.5 rounded-xl flex flex-col items-center text-slate-500 hover:text-slate-800 hover:bg-white/60 transition-all cursor-pointer"
              title="Meetings"
            >
              <MeetingsNavIcon className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-medium">Meetings</span>
            </button>

            {/* More */}
            <button
              type="button"
              onClick={() => onOpenAuthModal('login')}
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

        {/* 3. Main Home Card (Elevated White Card with Full-Bleed Video Ads Dock & Logo Carousel) */}
        <div
          onMouseEnter={() => setIsHoveringCard(true)}
          onMouseLeave={() => setIsHoveringCard(false)}
          className="flex-1 bg-white rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between p-4 sm:p-6 md:p-8 lg:px-12 lg:pt-10 lg:pb-5 overflow-hidden min-h-0 relative isolate"
        >
          {/* Hardware-accelerated Wave Ribbon Canvas (z-0 sits above card bg-white, under hero elements) */}
          <div
            className={`absolute inset-0 pointer-events-none select-none z-0 transition-opacity duration-500 ease-out ${
              isHoveringCard ? 'opacity-45' : 'opacity-20'
            }`}
          >
            <WaveRibbonBackground
              background="transparent"
              offsetY={-0.08}
              lineWidth={1.0}
              alpha={0.65}
              zIndex={0}
            />
          </div>

          {/* Main Hero Section */}
          <main className="w-full flex-1 flex flex-col lg:flex-row items-center justify-between gap-6 lg:gap-10 my-auto overflow-y-auto lg:overflow-hidden relative py-2">
            {/* Left Column: Title & Buttons (Shifted slightly right and upward) */}
            <div className="w-full lg:w-[46%] xl:w-[42%] shrink-0 space-y-4 relative z-10 transform lg:translate-x-6 xl:translate-x-10 -translate-y-4 lg:-translate-y-6">
              {/* Title: Equal font size for both lines (Open Sans) */}
              <h1 className="font-opensans text-xl sm:text-2xl md:text-[24px] leading-tight tracking-tight">
                <span className="font-normal text-slate-900 block xl:whitespace-nowrap">
                  Video calls supporting
                </span>
                <span className="font-bold text-black block mt-1 xl:whitespace-nowrap">
                  deaf and hard of hearing
                </span>
              </h1>

              {/* Subtitle: Smaller font size as requested (Open Sans) */}
              <p className="font-opensans text-xs sm:text-sm text-slate-500 max-w-md leading-relaxed font-normal">
                Easily connect via real-time video calls that<br />
                use AI to support sign language interpretation.
              </p>

              {/* Single Highlighted Join a meeting CTA button (No underline, prominent action) */}
              <div className="pt-2">
                <button
                  onClick={() => {
                    setShowCodeInput(true);
                    setJoinName(userDisplayName || '');
                    setCodeError('');
                  }}
                  className="bg-[#5CA0F2] hover:bg-[#4A8FE0] text-white font-semibold text-sm md:text-base px-8 py-3 rounded-full shadow-sm hover:shadow transition-all cursor-pointer inline-flex items-center justify-center outline-none"
                >
                  Join a meeting
                </button>
              </div>
            </div>

            {/* Right Dock: Transparent Video Ads (WebGL White-Background Keying over WaveRibbon) */}
            <div className="hidden lg:flex lg:absolute lg:top-0 lg:bottom-0 lg:right-0 lg:w-[44%] xl:w-[46%] items-center justify-center p-4 lg:p-6 overflow-hidden pointer-events-none select-none">
              <div className="w-full h-full max-h-[370px] xl:max-h-[400px] max-w-[460px] xl:max-w-[500px] relative flex items-center justify-center mb-8 lg:mb-12">
                <TransparentVideo
                  src={videoAds}
                  autoPlay
                  loop
                  muted
                  playsInline
                  chromaKey={HOME_VIDEO_CHROMA_KEY}
                  className="w-full h-full object-cover object-center"
                />
              </div>
            </div>
          </main>

          {/* Bottom Technology Stack Infinity Logo Carousel */}
          <div className="w-full pt-2 relative z-10 select-none">
            <InfinityLogoCarousel />
          </div>
        </div>
      </div>

      {/* Join Meeting Modal (Room ID + Name) */}
      {showCodeInput && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          {/* Modal Outer Wrapper */}
          <div className="relative w-full max-w-md">
            {/* 1. Dedicated Hardware-Accelerated Static Shadow Layer */}
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.3)] pointer-events-none transform-gpu"
            />

            {/* 2. Modal Card Surface */}
            <div className="relative bg-white rounded-xl p-6 border border-slate-200/80 antialiased">
              <h3 className="text-lg font-bold text-slate-900 mb-1">Join a Meeting</h3>
              <p className="text-xs text-slate-500 mb-4">
                Enter the meeting ID and your name to join the lobby.
              </p>

              {codeError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2 text-xs text-red-600">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{codeError}</span>
                </div>
              )}

              <form onSubmit={handleJoinSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Meeting ID / Room Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. slm-abc-xyz"
                    value={roomCode}
                    onChange={(e) => {
                      setRoomCode(e.target.value);
                      if (codeError) setCodeError('');
                    }}
                    className={`w-full px-4 py-2.5 rounded-lg border text-sm focus:outline-none transition-colors ${
                      codeError && !roomCode.trim()
                        ? 'border-red-400 focus:border-red-500'
                        : 'border-slate-300 focus:border-[#5CA0F2]'
                    }`}
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Your Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. John Doe"
                    value={joinName}
                    onChange={(e) => {
                      setJoinName(e.target.value);
                      if (codeError) setCodeError('');
                    }}
                    className={`w-full px-4 py-2.5 rounded-lg border text-sm focus:outline-none transition-colors ${
                      codeError && !joinName.trim()
                        ? 'border-red-400 focus:border-red-500'
                        : 'border-slate-300 focus:border-[#5CA0F2]'
                    }`}
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-2">
                  <button
                    type="submit"
                    disabled={isCheckingCode || !roomCode.trim() || !joinName.trim()}
                    className="px-6 py-2 rounded-lg text-xs font-semibold text-white bg-[#5CA0F2] hover:bg-[#4A8FE0] disabled:bg-[#5CA0F2]/60 cursor-pointer flex items-center space-x-2 transition-all shadow-xs"
                  >
                    {isCheckingCode && <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />}
                    <span>{isCheckingCode ? 'Verifying...' : 'Join'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCodeInput(false);
                      setRoomCode('');
                      setJoinName('');
                      setCodeError('');
                    }}
                    className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

