import React, { useState, useEffect } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import RoomView from './components/RoomView';
import ErrorBoundary from './components/common/ErrorBoundary';
import WaitingLobby from './components/room/WaitingLobby';
import AdminGestureStudio from './components/admin/AdminGestureStudio';
import UserDashboard from './components/dashboard/UserDashboard';
import AuthModal from './components/auth/AuthModal';
import { useLocalMedia } from './hooks/useLocalMedia';
import { useSocket } from './hooks/useSocket';
import { useAuth } from './context/AuthContext';
import { supabase } from './utils/supabase';
import { fetchDatasetFromServer, initRealtimeDatasetSync } from './services/gestureClassifier';
import { preloadMediaPipeHands } from './services/mediapipe';
import { preloadWhisperModel } from './services/whisperWorkerManager';
import { brandLogo, homeIllustration } from './assets';

export default function App() {
  const [currentView, setCurrentView] = useState('home'); // 'home' | 'dashboard' | 'lobby' | 'room'
  const [activeRoomId, setActiveRoomId] = useState('');
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [roomCode, setRoomCode] = useState('');
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
  const mediaState = useLocalMedia();

  // Socket connection hook
  const { isConnected, leaveRoom, toggleConnection } = useSocket();

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
  };

  // Join Existing Room via Code (Validates against Supabase active rooms)
  const handleJoinSubmit = async (e) => {
    e.preventDefault();
    const targetRoom = roomCode.trim();
    if (!targetRoom) return;

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
      setActiveRoomId(targetRoom);
      if (user) {
        setUserDisplayName(profile?.display_name || user.email?.split('@')[0] || '');
      } else {
        setUserDisplayName(''); // Guest will enter their name in lobby
      }
      setCurrentView('lobby');
      setShowCodeInput(false);
      setRoomCode('');
    } catch (err) {
      console.error('Unexpected error checking room:', err);
      setCodeError('Failed to verify meeting code.');
    } finally {
      setIsCheckingCode(false);
    }
  };

  // Join Meeting from User Dashboard
  const handleJoinMeetingFromDashboard = (cleanRoomId) => {
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
    if (chosenName) {
      setUserDisplayName(chosenName);
    }
    if (chosenRole) {
      setUserRole(chosenRole);
    }
    setCurrentView('room');
    if (!isConnected) {
      toggleConnection();
    }
  };

  const handleLeaveRoom = () => {
    leaveRoom();
    setUserRole(null);
    setCurrentView(user ? 'dashboard' : 'home');
    setActiveRoomId('');
  };

  const handleBackHomeFromLobby = () => {
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
          initialRole={userRole}
        />
      </ErrorBoundary>
    );
  }

  // Render Home View (Preserving exact original UI design for non-logged-in users)
  return (
    <div className="w-screen h-screen overflow-hidden bg-white text-slate-900 flex flex-col justify-between px-8 md:px-14 lg:px-20 py-4 md:py-6 font-sans select-none">
      {/* Main Hero Section & Compact Logo */}
      <main className="w-full flex-1 flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12 my-auto pt-2 overflow-hidden">
        {/* Left Column: Logo, Title & Buttons */}
        <div className="w-full lg:w-[44%] xl:w-[42%] shrink-0 space-y-5">
          {/* Logo placed directly above title with tight spacing */}
          <div className="mb-2">
            <img
              src={brandLogo}
              alt="SLMeet Logo"
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
            <button
              onClick={() => {
                setAuthModalMode('login');
                setAuthModalOpen(true);
              }}
              className="bg-[#5CA0F2] hover:bg-[#4A8FE0] text-white font-semibold text-sm md:text-base px-8 py-3 rounded-full shadow-sm transition-colors cursor-pointer"
            >
              Sign In
            </button>
            <button
              type="button"
              className="bg-white border border-[#5CA0F2]/70 text-[#5CA0F2] hover:bg-blue-50/50 font-semibold text-sm md:text-base px-8 py-3 rounded-full transition-colors cursor-pointer"
            >
              About SLMeet
            </button>
          </div>

          {/* Quick Action Link */}
          <div className="flex items-center space-x-6 text-xs md:text-sm text-slate-600 pt-4">
            <span>Join a meeting now</span>
            <button
              onClick={() => {
                setShowCodeInput(true);
                setCodeError('');
              }}
              className="text-[#5CA0F2] font-semibold underline underline-offset-4 cursor-pointer"
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
              src={homeIllustration}
              alt="AI Sign Language Video Calls"
              className="w-full max-w-xl md:max-w-2xl lg:max-w-3xl xl:max-w-5xl h-auto object-contain filter drop-shadow-xl"
            />
          </div>
        </div>
      </main>

      {/* Enter Code Modal Popup with DB Validation */}
      {showCodeInput && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-100">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Join a Meeting</h3>
            <p className="text-xs text-slate-500 mb-4">
              Enter the meeting code provided by the host to join.
            </p>

            {codeError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center space-x-2 text-xs text-red-600">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{codeError}</span>
              </div>
            )}

            <form onSubmit={handleJoinSubmit} className="space-y-4">
              <input
                type="text"
                placeholder="e.g. slm-abc-xyz"
                value={roomCode}
                onChange={(e) => {
                  setRoomCode(e.target.value);
                  if (codeError) setCodeError('');
                }}
                className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none transition-colors ${
                  codeError ? 'border-red-400 focus:border-red-500' : 'border-slate-300 focus:border-[#5CA0F2]'
                }`}
                autoFocus
              />
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCodeInput(false);
                    setRoomCode('');
                    setCodeError('');
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 border border-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCheckingCode || !roomCode.trim()}
                  className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-[#5CA0F2] hover:bg-[#4A8FE0] disabled:bg-[#5CA0F2]/60 cursor-pointer flex items-center space-x-2"
                >
                  {isCheckingCode && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isCheckingCode ? 'Verifying...' : 'Join Meeting'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Auth Modal for Sign In / Sign Up */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authModalMode}
      />

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
