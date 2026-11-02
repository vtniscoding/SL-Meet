import React, { useState, useEffect } from 'react';
import {
  AlertErrorIcon as AlertCircle,
  LoadingSpinnerIcon as Loader2,
  HomeNavIcon,
  ChatNavIcon,
  MeetingsNavIcon,
  MoreHorizontalNavIcon,
  SettingsNavIcon,
} from './icons';
import WindowControls from './components/common/WindowControls';
import RoomView from './components/RoomView';
import ErrorBoundary from './components/common/ErrorBoundary';
import WaitingLobby from './components/room/WaitingLobby';
import AdminGestureStudio from './components/admin/AdminGestureStudio';
import UserDashboard from './components/dashboard/UserDashboard';
import AuthModal from './components/auth/AuthModal';
import ProfileAvatarMenu from './components/common/ProfileAvatarMenu';
import { useLocalMedia } from './hooks/useLocalMedia';
import { useAuth } from './context/AuthContext';
import { supabase } from './utils/supabase';
import { fetchDatasetFromServer, initRealtimeDatasetSync } from './services/gestureClassifier';
import { preloadMediaPipeHands } from './services/mediapipe';
import { preloadWhisperModel } from './services/whisperWorkerManager';
import { brandLogo, videoAds } from './assets';
import { saveRoomToHistory } from './hooks/useRoomHistory';
import InfinityLogoCarousel from './components/home/InfinityLogoCarousel';

export default function App() {
  const [currentView, setCurrentView] = useState('home'); // 'home' | 'dashboard' | 'lobby' | 'room'
  const [activeRoomId, setActiveRoomId] = useState('');
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [codeError, setCodeError] = useState('');
  const [isCheckingCode, setIsCheckingCode] = useState(false);
  const [userDisplayName, setUserDisplayName] = useState('');
  const [userRole, setUserRole] = useState(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('login');
  const [isAdminRoute, setIsAdminRoute] = useState(window.location.hash === '#admin');
  const [isPreloading, setIsPreloading] = useState(true);

  // Preload local MediaPipe WASM and Whisper speech model once at startup
  useEffect(() => {
    let isCancelled = false;

    const preloadAssets = async () => {
      try {
        await Promise.allSettled([
          preloadMediaPipeHands(),
          preloadWhisperModel(),
        ]);
      } catch (err) {
        console.warn('[Preload] Non-fatal asset preload warning:', err);
      } finally {
        if (!isCancelled) {
          setIsPreloading(false);
        }
      }
    };

    preloadAssets();

    return () => {
      isCancelled = true;
    };
  }, []);

  const { user, profile, signOut } = useAuth();

  // Auto-fetch active ASL dataset and connect to Supabase Realtime for live gesture dataset syncing
  useEffect(() => {
    fetchDatasetFromServer();
    const gestureChannel = initRealtimeDatasetSync();

    const handleHashChange = () => {
      setIsAdminRoute(window.location.hash === '#admin');
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      if (gestureChannel?.unsubscribe) gestureChannel.unsubscribe();
    };
  }, []);

  // When user is authenticated, redirect to User Dashboard if currently on Home
  useEffect(() => {
    if (user && currentView === 'home') {
      setCurrentView('dashboard');
    }
  }, [user, currentView]);

  // Sync display name from profile if user is logged in
  useEffect(() => {
    if (user && profile?.display_name) {
      setUserDisplayName(profile.display_name);
    } else if (user?.email) {
      setUserDisplayName(user.email.split('@')[0]);
    }
  }, [user, profile]);

  // Hardware Media Stream & Device State (Shared between Lobby & Room)
  // Hardware Media Stream & Device State (Only active in Waiting Lobby or Room View)
  const isMediaActive = !isPreloading && (currentView === 'lobby' || currentView === 'room');
  const mediaState = useLocalMedia({ isActive: isMediaActive });

  const [isHoveringCard, setIsHoveringCard] = useState(false);


  // Create New Meeting (Only authenticated users can create rooms)
  const handleCreateNewMeeting = async () => {
    if (!user) {
      setAuthModalMode('login');
      setAuthModalOpen(true);
      return;
    }

    const part1 = Math.random().toString(36).substring(2, 5);
    const part2 = Math.random().toString(36).substring(2, 6);
    const newRoomId = `slm-${part1}-${part2}`;

    // Immediately persist created room to history
    saveRoomToHistory(newRoomId, user?.id);

    try {
      await supabase.from('rooms').insert({
        id: newRoomId,
        host_id: user.id,
        status: 'active',
      });
    } catch (err) {
      console.warn('Could not record room in Supabase:', err);
    }

    const defaultName = profile?.display_name || user.email?.split('@')[0] || 'Host';
    setUserDisplayName(defaultName);
    setActiveRoomId(newRoomId);
    setCurrentView('lobby');
    return newRoomId;
  };

  // Join Existing Room via Code (Validates against Supabase active rooms)
  const handleJoinSubmit = async (e) => {
    e.preventDefault();
    const targetRoom = roomCode.trim();
    const targetName = joinName.trim() || userDisplayName.trim();

    if (!targetRoom) {
      setCodeError('Please enter a meeting code.');
      return;
    }

    if (!targetName) {
      setCodeError('Please enter your name.');
      return;
    }

    setCodeError('');
    setIsCheckingCode(true);

    try {
      // Validate that room exists and is active in Supabase
      const { data: roomData, error } = await supabase
        .from('rooms')
        .select('id, status')
        .eq('id', targetRoom)
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

      // Room is valid and active
      saveRoomToHistory(targetRoom, user?.id);
      setActiveRoomId(targetRoom);
      setUserDisplayName(targetName);
      setCurrentView('lobby');
      setShowCodeInput(false);
      setRoomCode('');
      setJoinName('');
    } catch (err) {
      console.error('Unexpected error checking room:', err);
      setCodeError('Failed to verify meeting code.');
    } finally {
      setIsCheckingCode(false);
    }
  };

  // Join Meeting from User Dashboard
  const handleJoinMeetingFromDashboard = (cleanRoomId) => {
    saveRoomToHistory(cleanRoomId, user?.id);
    setActiveRoomId(cleanRoomId);
    setUserDisplayName(profile?.display_name || user.email?.split('@')[0] || '');
    setCurrentView('lobby');
  };

  const handleSignOut = async () => {
    await signOut();
    setCurrentView('home');
    setActiveRoomId('');
  };

  const handleEnterMeetingFromLobby = (chosenName, chosenRole) => {
    if (activeRoomId) {
      saveRoomToHistory(activeRoomId, user?.id);
    }
    if (chosenName) {
      setUserDisplayName(chosenName);
    }
    if (chosenRole) {
      setUserRole(chosenRole);
    }
    setCurrentView('room');
  };

  const handleLeaveRoom = () => {
    mediaState.stopMedia();
    setUserRole(null);
    setCurrentView(user ? 'dashboard' : 'home');
    setActiveRoomId('');
  };

  const handleBackHomeFromLobby = () => {
    mediaState.stopMedia();
    setUserRole(null);
    setCurrentView(user ? 'dashboard' : 'home');
    setActiveRoomId('');
  };

  // Render simple minimal loading spinner during initial offline preload
  if (isPreloading) {
    return (
      <div className="w-screen h-screen bg-[#121212] flex items-center justify-center select-none">
        <Loader2 className="w-8 h-8 text-[#5CA0F2] animate-spin" />
      </div>
    );
  }

  // Render Isolated Admin Gesture Studio Portal (Accessed exclusively via /#admin)
  if (isAdminRoute) {
    return (
      <AdminGestureStudio
        onBackToApp={() => {
          window.location.hash = '';
          setIsAdminRoute(false);
        }}
      />
    );
  }

  // Render User Dashboard (When authenticated and on dashboard view)
  if (user && currentView === 'dashboard') {
    return (
      <UserDashboard
        user={user}
        profile={profile}
        onSignOut={handleSignOut}
        onCreateMeeting={handleCreateNewMeeting}
        onJoinMeeting={handleJoinMeetingFromDashboard}
      />
    );
  }

  // Render Waiting Lobby View
  if (currentView === 'lobby') {
    return (
      <WaitingLobby
        roomId={activeRoomId}
        mediaState={mediaState}
        onJoinMeeting={handleEnterMeetingFromLobby}
        onBackHome={handleBackHomeFromLobby}
        initialDisplayName={userDisplayName || profile?.display_name || (user ? user.email?.split('@')[0] : '')}
        isAuthenticated={!!user}
        user={user}
        profile={profile}
        onSignOut={handleSignOut}
      />
    );
  }

  // Render Room View with ErrorBoundary protection
  if (currentView === 'room') {
    return (
      <ErrorBoundary onReset={handleLeaveRoom}>
        <RoomView
          roomId={activeRoomId}
          onLeaveRoom={handleLeaveRoom}
          mediaState={mediaState}
          userName={userDisplayName || (user ? user.email?.split('@')[0] : 'Participant')}
          currentUser={user}
          profile={profile}
          initialRole={userRole}
        />
      </ErrorBoundary>
    );
  }

  // Render Home View (With desktop container shell & left sidebar)
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

        {/* Top-Right: [Sign In CTA] [Minimize] [Maximize/Restore] [Close] */}
        <div className="flex items-center h-full space-x-2.5">
          {user && (
            <ProfileAvatarMenu
              user={user}
              profile={profile}
              onSignOut={handleSignOut}
            />
          )}
          <button
            onClick={() => {
              setAuthModalMode('login');
              setAuthModalOpen(true);
            }}
            style={{ WebkitAppRegion: 'no-drag' }}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full bg-white hover:bg-slate-100 text-[#0B57D0] border border-slate-200/80 shadow-xs transition-colors cursor-pointer ${user ? 'hidden' : 'block'}`}
          >
            Sign In
          </button>
          <WindowControls />
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
              onClick={() => {
                setAuthModalMode('login');
                setAuthModalOpen(true);
              }}
              className="w-full py-2.5 rounded-xl flex flex-col items-center text-slate-500 hover:text-slate-800 hover:bg-white/60 transition-all cursor-pointer"
              title="Chat"
            >
              <ChatNavIcon className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-medium">Chat</span>
            </button>

            {/* Meetings (Requires Sign In) */}
            <button
              type="button"
              onClick={() => {
                setAuthModalMode('login');
                setAuthModalOpen(true);
              }}
              className="w-full py-2.5 rounded-xl flex flex-col items-center text-slate-500 hover:text-slate-800 hover:bg-white/60 transition-all cursor-pointer"
              title="Meetings"
            >
              <MeetingsNavIcon className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-medium">Meetings</span>
            </button>

            {/* More */}
            <button
              type="button"
              onClick={() => {
                setAuthModalMode('login');
                setAuthModalOpen(true);
              }}
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

        {/* 3. Main Home Card (Elevated White Card with Full-Bleed Video Ads Dock, Blue Inner Vignette & Logo Carousel) */}
        <div
          onMouseEnter={() => setIsHoveringCard(true)}
          onMouseLeave={() => setIsHoveringCard(false)}
          className="flex-1 bg-white rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between p-4 sm:p-6 md:p-8 lg:px-12 lg:pt-10 lg:pb-5 overflow-hidden min-h-0 relative group/card transition-colors duration-500"
        >
          {/* Vignetting Effect: Deep Ocean Blue Inner Shadow & Edge Vignette on Container Hover */}
          <div
            aria-hidden="true"
            className={`absolute inset-0 rounded-xl pointer-events-none transition-all duration-700 ease-out z-0 ${
              isHoveringCard
                ? 'opacity-100 shadow-[inset_0_0_120px_rgba(29,78,216,0.15),inset_0_0_40px_rgba(30,58,138,0.12)] bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(30,58,138,0.06)_85%,rgba(29,78,216,0.14)_100%)] ring-1 ring-blue-500/20'
                : 'opacity-0 shadow-[inset_0_0_0px_rgba(0,0,0,0)] ring-0'
            }`}
          />

          {/* Main Hero Section */}
          <main className="w-full flex-1 flex flex-col lg:flex-row items-center justify-between gap-6 lg:gap-10 my-auto overflow-y-auto lg:overflow-hidden relative z-10 py-2">
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

            {/* Right Dock: Full-bleed Video Ads with Radial Fade (Hidden on small screens / mobile as requested) */}
            <div className="hidden lg:flex lg:absolute lg:top-0 lg:bottom-0 lg:right-0 lg:w-[44%] xl:w-[46%] items-center justify-center p-4 lg:p-6 overflow-hidden pointer-events-none select-none z-0">
              <div
                className="w-full h-full max-h-[370px] xl:max-h-[400px] max-w-[460px] xl:max-w-[500px] relative flex items-center justify-center -translate-y-4 lg:-translate-y-6"
                style={{
                  WebkitMaskImage:
                    'radial-gradient(ellipse 65% 65% at 50% 50%, rgba(0,0,0,1) 35%, rgba(0,0,0,0.7) 60%, rgba(0,0,0,0) 100%)',
                  maskImage:
                    'radial-gradient(ellipse 65% 65% at 50% 50%, rgba(0,0,0,1) 35%, rgba(0,0,0,0.7) 60%, rgba(0,0,0,0) 100%)',
                }}
              >
                <video
                  src={videoAds}
                  autoPlay
                  loop
                  muted
                  playsInline
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
            {/* 1. Dedicated Hardware-Accelerated Static Shadow Layer (Immune to Input Focus/Blur Repaints) */}
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

      {/* Auth Modal for Sign In / Sign Up */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authModalMode}
      />
    </div>
  );
}
