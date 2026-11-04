import React, { useState, useEffect } from 'react';
import { LoadingSpinnerIcon as Loader2 } from '@sl-meet/shared/icons';
import {
  AuthModal,
  useAuth,
  saveRoomToHistory,
  ErrorBoundary,
  useLocalMedia,
  preloadWhisperModel,
} from './features';
import { HomePage, DashboardPage, LobbyPage, RoomPage } from './pages';
import {
  supabase,
  fetchDatasetFromServer,
  initRealtimeDatasetSync,
  preloadMediaPipeHands,
} from '@sl-meet/shared';

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
      const hash = window.location.hash;
      if (hash === '#admin' || hash === '#debugger' || hash === '#vision-debugger') {
        window.location.href = `http://localhost:5174/${hash}`;
      }
    };
    handleHashChange();

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

  // Hardware Media Stream & Device State (Only active in Waiting Lobby or Room View)
  const isMediaActive = !isPreloading && (currentView === 'lobby' || currentView === 'room');
  const mediaState = useLocalMedia({ isActive: isMediaActive });

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

  // Render User Dashboard (When authenticated and on dashboard view)
  if (user && currentView === 'dashboard') {
    return (
      <DashboardPage
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
      <LobbyPage
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
        <RoomPage
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
    <>
      <HomePage
        user={user}
        profile={profile}
        onSignOut={handleSignOut}
        onOpenAuthModal={(mode) => {
          setAuthModalMode(mode);
          setAuthModalOpen(true);
        }}
        showCodeInput={showCodeInput}
        setShowCodeInput={setShowCodeInput}
        roomCode={roomCode}
        setRoomCode={setRoomCode}
        joinName={joinName}
        setJoinName={setJoinName}
        codeError={codeError}
        setCodeError={setCodeError}
        isCheckingCode={isCheckingCode}
        handleJoinSubmit={handleJoinSubmit}
        userDisplayName={userDisplayName}
      />

      {/* Auth Modal for Sign In / Sign Up */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode={authModalMode}
      />
    </>
  );
}
