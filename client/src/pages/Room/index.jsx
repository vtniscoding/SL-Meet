import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  useSocket,
  useWebRTC,
  useScreenShare,
  useHandTrackingWorker,
  useSpeechToText,
  useCaptionPrefs,
  useRoomModeration,
  downloadMeetingTranscript,
  getRandomSpeakerColor,
  colorForSender,
  MeetingLayoutEngine,
  MeetingControlBar,
  MeetingChatDrawer,
  MeetingParticipantsDrawer,
  CaptionDock,
  MeetingConfirmModal,
  MeetingPipView,
  HandMotionWindow,
  playJoinRoomSound,
} from '../../features';
import { TitleBar, useAslAggregator } from '@sl-meet/shared';
import {
  ZoomSpeakerFillIcon,
  ZoomGalleryFillIcon,
  ZoomSideBySideFillIcon,
  CheckmarkIcon,
  LoadingSpinnerIcon,
} from '@sl-meet/shared/icons';
import { ROLES } from '@sl-meet/shared/constants';

/**
 * Top-Level Room Layout Container Component
 */
export default function RoomView({
  roomId,
  onLeaveRoom,
  mediaState,
  userName = 'You',
  currentUser = null,
  profile = null,
  initialRole = ROLES.NON_SIGNER,
}) {
  // Participant Communication Role State ('signer' | 'non_signer')
  const [userRole, setUserRole] = useState(() => initialRole || ROLES.NON_SIGNER);

  // Independent Caption State & Mode (STT / SLT)
  const [isCaptionsEnabled, setIsCaptionsEnabled] = useState(false);
  const [captionMode, setCaptionMode] = useState(() => (initialRole === ROLES.SIGNER ? 'STT' : 'SLT'));
  const [isSttEnabled, setIsSttEnabled] = useState(false);
  const [speechLogs, setSpeechLogs] = useState([]);
  const [localSpeechCaptions, setLocalSpeechCaptions] = useState({});

  // Deterministic avatar color & user avatar URL for local participant
  const localAvatarColor = useMemo(() => {
    const stableKey = (userName || currentUser?.email?.split('@')[0] || currentUser?.id || 'user')
      .replace(/\s*\(You\)/i, '')
      .trim()
      .toLowerCase();
    return colorForSender(stableKey || 'user');
  }, [userName, currentUser?.email, currentUser?.id]);
  const localAvatarUrl = profile?.avatar_url || currentUser?.user_metadata?.avatar_url || null;

  // Caption preferences hook (persists font size, colors, opacity, token strip)
  const { prefs: captionPrefs, updatePref: updateCaptionPref, resetPrefs: resetCaptionPrefs } = useCaptionPrefs();

  // Real-Time ASL Sentence Aggregator Hook (Buffers raw gestures into fluent sentences with auto-clearing)
  const { currentSentence, transcriptLogs, liveTokens, pushGesture, notifyHandReset } = useAslAggregator(
    2800,
    7,
    650,
    2200,
    1800
  );

  // Destructure hardware media from parent App lifecycle (Prevents duplicate getUserMedia)
  const {
    videoRef,
    localStream,
    isMuted,
    isCameraOff,
    isSpeaking,
    toggleMic,
    muteMic,
    toggleCamera,
    stopMedia,
    audioDevices = [],
    videoDevices = [],
    speakerDevices = [],
    selectedAudioDeviceId = '',
    selectedVideoDeviceId = '',
    selectedSpeakerDeviceId = '',
    changeAudioDevice,
    changeVideoDevice,
    changeSpeakerDevice,
  } = mediaState || {};

  // 1.5s Transition Screen & Join Chime when entering room
  const [isJoiningRoom, setIsJoiningRoom] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsJoiningRoom(false);
      playJoinRoomSound(selectedSpeakerDeviceId).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [selectedSpeakerDeviceId]);

  // Screen Sharing Hook
  const { isScreenSharing, screenStream, toggleScreenShare, stopScreenShare } = useScreenShare();

  // Active Stream passed to WebRTC & Canvas (screenStream if sharing, else localStream)
  const activeLocalStream = isScreenSharing ? screenStream : localStream;

  // Socket.io Real-Time Connection & Signaling Hook
  const {
    isConnected,
    socketId,
    hostId,
    isHost,
    remoteGestures,
    roomUsers,
    presentingUsers,
    peerMediaStatus,
    chatMessages,
    speechCaptions,
    toggleConnection,
    joinRoom,
    leaveRoom,
    endRoom,
    sendGesture,
    sendPresentingStatus,
    sendMediaStatusChange,
    sendChatMessage,
    sendMutePeer,
    sendKickPeer,
    changeRole,
    sendSpeechCaption,
  } = useSocket();

  // WebRTC Real-Time P2P Video/Audio Streaming Hook
  const { peerStreams, peerScreenStreams } = useWebRTC(roomId, localStream, screenStream, presentingUsers);

  // Track the most recently speaking participant for accurate transcript speaker attribution
  const lastActiveSpeakerRef = useRef({
    userId: 'local',
    name: userName || 'You',
    avatarColor: localAvatarColor,
    avatarUrl: localAvatarUrl,
    timestamp: Date.now(),
  });

  useEffect(() => {
    if (isSpeaking && !isMuted) {
      lastActiveSpeakerRef.current = {
        userId: 'local',
        name: userName || 'You',
        avatarColor: localAvatarColor,
        avatarUrl: localAvatarUrl,
        timestamp: Date.now(),
      };
      return;
    }
    const speakingPeerId = Object.keys(peerMediaStatus).find(
      (id) => peerMediaStatus[id]?.isSpeaking && !peerMediaStatus[id]?.isMuted
    );
    if (speakingPeerId && speakingPeerId !== socketId) {
      const peer = roomUsers.find((u) => u.userId === speakingPeerId);
      if (peer) {
        lastActiveSpeakerRef.current = {
          userId: peer.userId,
          name: peer.userMeta?.name || `Participant ${peer.userId.slice(0, 4)}`,
          avatarColor: peer.avatarColor || peer.userMeta?.avatarColor || colorForSender(peer.userId),
          avatarUrl: peer.avatarUrl || peer.userMeta?.avatarUrl || null,
          timestamp: Date.now(),
        };
      }
    }
  }, [isSpeaking, isMuted, peerMediaStatus, roomUsers, userName, localAvatarColor, localAvatarUrl, socketId]);

  // Speech-to-Text Pipeline: captures local microphone audio and broadcasts captions to room peers
  const shouldListenSpeech = (isCaptionsEnabled && captionMode === 'STT') || (!isMuted && !!localStream);
  const sttTracks = useMemo(() => {
    if (!shouldListenSpeech || !localStream || isMuted) return [];
    return localStream.getAudioTracks().filter((track) => track.readyState === 'live');
  }, [shouldListenSpeech, localStream, isMuted]);

  const sttTracksKey = sttTracks.map((t) => t.id).sort().join('|');
  const sttAudioStream = useMemo(
    () => (sttTracks.length ? new MediaStream(sttTracks) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sttTracksKey]
  );

  const isSttActive = shouldListenSpeech && !!sttAudioStream;
  const {
    status: sttStatus,
    loadProgress: sttProgress,
    interimText: sttInterimText,
  } = useSpeechToText({
    stream: sttAudioStream,
    enabled: isSttActive,
    onCaption: useCallback(
      ({ text, isFinal }) => {
        if (!text) return;

        const speakerId = 'local';
        const speakerName = userName || 'You';
        const speakerAvatarColor = localAvatarColor;
        const speakerAvatarUrl = localAvatarUrl;

        setLocalSpeechCaptions((prev) => ({
          ...prev,
          [speakerId]: {
            senderId: speakerId,
            text,
            isFinal,
            senderName: speakerName,
            avatarColor: speakerAvatarColor,
            avatarUrl: speakerAvatarUrl,
            timestamp: Date.now(),
          },
        }));

        if (sendSpeechCaption) {
          sendSpeechCaption(text, isFinal, {
            senderId: socketId,
            senderName: userName || 'Speaker',
            avatarColor: localAvatarColor,
            avatarUrl: localAvatarUrl,
          });
        }

        if (isFinal) {
          const timestamp = Date.now();
          setSpeechLogs((prev) => [
            ...prev,
            {
              id: `speech-${speakerId}-${timestamp}-${Math.random().toString(36).substr(2, 5)}`,
              timestamp,
              time: new Date(timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }),
              sender: speakerName,
              avatarColor: speakerAvatarColor,
              avatarUrl: speakerAvatarUrl,
              type: 'SPEECH',
              text,
            },
          ]);
        }
      },
      [socketId, userName, localAvatarColor, localAvatarUrl, sendSpeechCaption]
    ),
  });

  // Unified speech captions: merges socket captions and local transcription captions
  const combinedSpeechCaptions = useMemo(() => {
    const remoteCaptions = { ...(speechCaptions || {}) };
    if (socketId && remoteCaptions[socketId]) {
      delete remoteCaptions[socketId];
    }
    return {
      ...remoteCaptions,
      ...localSpeechCaptions,
    };
  }, [speechCaptions, localSpeechCaptions, socketId]);

  // Track finalized remote speech captions from socket
  const loggedSpeechCaptionsRef = useRef(new Set());
  useEffect(() => {
    if (speechCaptions && isCaptionsEnabled && captionMode === 'STT') {
      Object.entries(speechCaptions).forEach(([senderId, cap]) => {
        if (senderId === socketId) return;
        if (cap && cap.isFinal && cap.text) {
          const capKey = `${senderId}-${cap.timestamp}-${cap.text}`;
          if (!loggedSpeechCaptionsRef.current.has(capKey)) {
            loggedSpeechCaptionsRef.current.add(capKey);
            const timestamp = cap.timestamp || Date.now();
            setSpeechLogs((prev) => [
              ...prev,
              {
                id: `speech-remote-${timestamp}-${Math.random().toString(36).substr(2, 5)}`,
                timestamp,
                time: new Date(timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                }),
                sender: cap.senderName || `Speaker ${senderId.slice(0, 4)}`,
                avatarColor: cap.avatarColor || colorForSender(senderId),
                avatarUrl: cap.avatarUrl || null,
                type: 'SPEECH',
                text: cap.text,
              },
            ]);
          }
        }
      });
    }
  }, [speechCaptions, isCaptionsEnabled, captionMode, socketId]);

  // Meeting Room Layout Modes: 'tiled' (Auto Grid) | 'sidebar' (Thanh bên) | 'spotlight' (Tiêu điểm)
  const [isPipMode, setIsPipMode] = useState(false);
  const [layoutMode, setLayoutMode] = useState('tiled');
  const [pinnedId, setPinnedId] = useState(null);
  const [isAiEnabled, setIsAiEnabled] = useState(false);
  const [isHandTrackingEnabled, setIsHandTrackingEnabled] = useState(false);
  const [activeSignerId, setActiveSignerId] = useState(null);

  // Real-time meeting clock (Google Meet style: e.g. 2:56 PM)
  const [meetingTime, setMeetingTime] = useState(() =>
    new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  );

  useEffect(() => {
    const updateTime = () => {
      setMeetingTime(
        new Date().toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
      );
    };
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Zoom-Style View Mode dropdown state & ref
  const [isViewDropdownOpen, setIsViewDropdownOpen] = useState(false);
  const viewDropdownRef = useRef(null);

  // Close View dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (viewDropdownRef.current && !viewDropdownRef.current.contains(event.target)) {
        setIsViewDropdownOpen(false);
      }
    };
    if (isViewDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isViewDropdownOpen]);

    // Picture-in-Picture IPC State Synchronization
  useEffect(() => {
    if (window.electronAPI?.onPiPState) {
      const cleanup = window.electronAPI.onPiPState((isPip) => {
        setIsPipMode(isPip);
      });
      return () => {
        if (typeof cleanup === 'function') cleanup();
      };
    }
  }, []);

  const handleEnterPiP = useCallback(async () => {
    if (window.electronAPI?.enterPiP) {
      await window.electronAPI.enterPiP();
    }
    setIsPipMode(true);
  }, []);

  const handleExitPiP = useCallback(async () => {
    if (window.electronAPI?.exitPiP) {
      await window.electronAPI.exitPiP();
    }
    setIsPipMode(false);
  }, []);

  // Sync role with initialRole if it changes or becomes available
  useEffect(() => {
    if (initialRole && initialRole !== userRole) {
      setUserRole(initialRole);
      
    }
  }, [initialRole]);

  // In-Call Real-Time Drawers state (Mutually Exclusive: Chat | People)
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isPeopleOpen, setIsPeopleOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const prevLocalPresentingRef = useRef(false);
  const prevRemotePresenterRef = useRef(null);
  const lastMessageCountRef = useRef(0);
  const savedLayoutModeRef = useRef('tiled');
  const layoutModeRef = useRef(layoutMode);
  useEffect(() => {
    layoutModeRef.current = layoutMode;
  }, [layoutMode]);

  // Unified helper to cleanly shutdown local hand motion tracking across all triggers
  const disableLocalHandTracking = useCallback(() => {
    setIsHandTrackingEnabled(false);
    if (activeSignerId === 'local') {
      setActiveSignerId(null);
    }
    if (window.electronAPI?.closeHandMotion) {
      window.electronAPI.closeHandMotion();
    }
  }, [activeSignerId]);

  // Toggle Sign Language Support callback ('signer' <-> 'non_signer')
  const handleToggleSignLanguageSupport = useCallback(() => {
    const nextRole = userRole === ROLES.SIGNER ? ROLES.NON_SIGNER : ROLES.SIGNER;
    setUserRole(nextRole);
    changeRole(nextRole);
    if (nextRole === ROLES.NON_SIGNER) {
      disableLocalHandTracking();
    }
  }, [userRole, changeRole, disableLocalHandTracking]);

  // Dedicated callback for switching subtitle mode (SLT / STT) from CaptionDock dropdown
  // Completely decoupled from role and hand tracking
  const handleSwitchSubtitleMode = useCallback(
    (newMode) => {
      setCaptionMode(newMode);
    },
    []
  );

  // Auto connect & join room socket channel
  const userRoleRef = useRef(userRole);
  useEffect(() => {
    userRoleRef.current = userRole;
  }, [userRole]);

  const userMetaRef = useRef({
    name: userName || 'Participant',
    userId: currentUser?.id || null,
    isGuest: !currentUser,
    role: userRole,
    avatarColor: localAvatarColor,
    avatarUrl: localAvatarUrl,
  });

  useEffect(() => {
    userMetaRef.current = {
      name: userName || 'Participant',
      userId: currentUser?.id || null,
      isGuest: !currentUser,
      role: userRole,
      avatarColor: localAvatarColor,
      avatarUrl: localAvatarUrl,
    };
  }, [userName, currentUser?.id, userRole, localAvatarColor, localAvatarUrl]);

  useEffect(() => {
    joinRoom(roomId, userMetaRef.current);
    return () => {
      leaveRoom();
    };
  }, [roomId]);

  // Broadcast local camera, mic, and AI Vision status changes to all room peers
  useEffect(() => {
    if (sendMediaStatusChange && isConnected) {
      sendMediaStatusChange(isMuted, isCameraOff, isHandTrackingEnabled, isSpeaking && !isMuted);
    }
  }, [isMuted, isCameraOff, isHandTrackingEnabled, isSpeaking, isConnected, sendMediaStatusChange]);

  // Sync latest remote gesture into ASL Sentence Aggregator
  useEffect(() => {
    if (remoteGestures && remoteGestures.length > 0) {
      const latest = remoteGestures[0];
      if (latest && latest.gesture) {
        const sender = roomUsers.find((u) => u.userId === latest.senderId);
        const senderName = latest.senderName || sender?.userMeta?.name || `Participant ${latest.senderId?.slice(0, 4)}`;
        const senderAvatarColor =
          latest.avatarColor ||
          sender?.avatarColor ||
          sender?.userMeta?.avatarColor ||
          colorForSender((senderName || latest.senderId || 'user').toLowerCase());
        const senderAvatarUrl = latest.avatarUrl || sender?.avatarUrl || sender?.userMeta?.avatarUrl || null;
        pushGesture(senderName, latest.gesture, latest.confidence ?? 0.9, {
          mode: latest.mode,
          senderId: latest.senderId,
          avatarColor: senderAvatarColor,
          avatarUrl: senderAvatarUrl,
        });
        if (latest.senderId) {
          setActiveSignerId(latest.senderId);
        }
      }
    }
  }, [remoteGestures, roomUsers, pushGesture]);

  // Broadcast screen sharing status & auto layout switch ONCE when local user starts presenting
  useEffect(() => {
    sendPresentingStatus(isScreenSharing, screenStream ? screenStream.id : null);
    if (isScreenSharing && !prevLocalPresentingRef.current) {
      if (layoutModeRef.current !== 'sidebar') {
        savedLayoutModeRef.current = layoutModeRef.current;
      }
      setLayoutMode('sidebar');
      setPinnedId('local-screen');
    } else if (!isScreenSharing && prevLocalPresentingRef.current) {
      setPinnedId((prevPinned) => (prevPinned === 'local-screen' ? null : prevPinned));
      setLayoutMode((prevMode) => (prevMode === 'sidebar' ? (savedLayoutModeRef.current || 'tiled') : prevMode));
    }
    prevLocalPresentingRef.current = isScreenSharing;
  }, [isScreenSharing, screenStream, sendPresentingStatus]);

  // Auto switch layout ONCE when a new remote peer starts presenting
  useEffect(() => {
    const activePeerPresenter = Object.keys(presentingUsers).find((id) => presentingUsers[id]?.isPresenting);
    if (activePeerPresenter && activePeerPresenter !== prevRemotePresenterRef.current) {
      if (layoutModeRef.current !== 'sidebar') {
        savedLayoutModeRef.current = layoutModeRef.current;
      }
      setLayoutMode('sidebar');
      setPinnedId(`${activePeerPresenter}-screen`);
      prevRemotePresenterRef.current = activePeerPresenter;
    } else if (!activePeerPresenter && prevRemotePresenterRef.current) {
      const prevScreenId = `${prevRemotePresenterRef.current}-screen`;
      setPinnedId((prevPinned) => (prevPinned === prevScreenId ? null : prevPinned));
      setLayoutMode((prevMode) => (prevMode === 'sidebar' ? (savedLayoutModeRef.current || 'tiled') : prevMode));
      prevRemotePresenterRef.current = null;
    }
  }, [presentingUsers]);

  useEffect(() => {
    if (chatMessages.length > lastMessageCountRef.current) {
      const newMessages = chatMessages.slice(lastMessageCountRef.current);
      const incomingRemoteMsgs = newMessages.filter(
        (m) => m.senderId !== socketId && m.senderId !== 'local'
      );
      if (!isChatOpen && incomingRemoteMsgs.length > 0) {
        setUnreadCount((prev) => prev + incomingRemoteMsgs.length);
      }
    }
    lastMessageCountRef.current = chatMessages.length;
  }, [chatMessages, isChatOpen, socketId]);

  const handleToggleChat = () => {
    setIsChatOpen((prev) => {
      const next = !prev;
      if (next) {
        setUnreadCount(0);
        setIsPeopleOpen(false);
      }
      return next;
    });
  };

  const handleTogglePeople = () => {
    setIsPeopleOpen((prev) => {
      const next = !prev;
      if (next) {
        setIsChatOpen(false);
      }
      return next;
    });
  };

  // Dynamic Participants Roster constructed from local state, socket roomUsers, and WebRTC peerStreams
  const localDisplayName = userName ? `${userName} (You)` : 'You';
  const localCameraParticipant = {
    id: 'local',
    userId: socketId,
    name: localDisplayName,
    role: userRole,
    avatarColor: localAvatarColor,
    avatarUrl: localAvatarUrl,
    isLocal: true,
    isScreenSharing: false,
    isCameraOff,
    isMuted,
    isSpeaking,
    isActiveSpeaker: isSpeaking && !isMuted,
    isAiVisionActive: isHandTrackingEnabled,
    stream: localStream,
  };

  const localPresentationParticipant = isScreenSharing
    ? {
        id: 'local-screen',
        userId: `${socketId}-screen`,
        name: userName ? `${userName} (Presentation)` : 'You (Presentation)',
        role: userRole,
        avatarColor: localAvatarColor,
        avatarUrl: localAvatarUrl,
        isLocal: true,
        isScreenSharing: true,
        isCameraOff: false,
        isMuted: true,
        isSpeaking: false,
        isActiveSpeaker: true,
        isAiVisionActive: false,
        stream: screenStream,
      }
    : null;

  const remoteParticipants = [];
  roomUsers
    .filter((u) => u && u.userId && u.userId !== socketId)
    .forEach((u) => {
      const peerStream = peerStreams[u.userId];
      const peerScreenStream = peerScreenStreams[u.userId];
      const isPeerPresenting = presentingUsers[u.userId]?.isPresenting === true;
      const baseName = u.userMeta?.name || `Participant ${u.userId.slice(0, 4)}`;
      const peerAvatarColor =
        u.avatarColor ||
        u.userMeta?.avatarColor ||
        colorForSender((baseName || u.userId || 'user').toLowerCase());
      const peerAvatarUrl = u.avatarUrl || u.userMeta?.avatarUrl || null;

      // Compute peer mic & camera status from real-time peerMediaStatus or stream track inspection
      const peerMedia = (peerMediaStatus && peerMediaStatus[u.userId]) || u.userMeta || {};
      const peerAudioTrack = peerStream?.getAudioTracks()[0];
      const peerVideoTrack = peerStream?.getVideoTracks()[0];

      const isPeerMuted =
        peerMedia.isMuted !== undefined
          ? peerMedia.isMuted
          : peerAudioTrack
          ? !peerAudioTrack.enabled
          : false;

      const isPeerCameraOff =
        peerMedia.isCameraOff !== undefined
          ? peerMedia.isCameraOff
          : peerVideoTrack
          ? !peerVideoTrack.enabled
          : false;

      const isPeerAiVisionActive = peerMedia.isAiVisionActive || false;
      const peerRole = u.role || u.userMeta?.role || ROLES.NON_SIGNER;

      // 1. Peer Camera Tile
      remoteParticipants.push({
        id: u.userId,
        name: baseName,
        role: peerRole,
        avatarColor: peerAvatarColor,
        avatarUrl: peerAvatarUrl,
        isLocal: false,
        isScreenSharing: false,
        isCameraOff: isPeerCameraOff,
        isMuted: isPeerMuted,
        isSpeaking: false,
        isActiveSpeaker: false,
        isAiVisionActive: isPeerAiVisionActive,
        hasStream: !!peerStream,
        stream: peerStream || null,
      });

      // 2. Peer Screen Presentation Tile (if presenting)
      if (isPeerPresenting && peerScreenStream) {
        remoteParticipants.push({
          id: `${u.userId}-screen`,
          name: `${baseName} (Presentation)`,
          role: peerRole,
          avatarColor: peerAvatarColor,
          avatarUrl: peerAvatarUrl,
          isLocal: false,
          isScreenSharing: true,
          isCameraOff: false,
          isMuted: true,
          isSpeaking: false,
          isActiveSpeaker: true,
          hasStream: !!peerScreenStream,
          stream: peerScreenStream || null,
        });
      }
    });

  const updatedParticipants = [
    ...(localPresentationParticipant ? [localPresentationParticipant] : []),
    localCameraParticipant,
    ...remoteParticipants,
  ];

  const handleTogglePin = (id) => {
    setPinnedId((prev) => {
      const isUnpinning = prev === id;
      const nextPinnedId = isUnpinning ? null : id;

      // Google Meet behavior: Pinning switches to spotlight focus; unpinning returns to tiled grid
      if (nextPinnedId && layoutMode === 'tiled') {
        setLayoutMode('spotlight');
      } else if (!nextPinnedId && layoutMode === 'spotlight') {
        setLayoutMode('tiled');
      }
      return nextPinnedId;
    });
  };

  const handleResetPin = () => {
    setPinnedId(null);
    if (layoutMode === 'spotlight') {
      setLayoutMode('tiled');
    }
  };

  const handleToggleAi = () => {
    setIsAiEnabled((prev) => !prev);
  };

  const handleToggleCaptions = () => {
    setIsCaptionsEnabled((prev) => !prev);
  };

  const handleToggleHandTracking = () => {
    if (userRole !== ROLES.SIGNER) return;
    if (isHandTrackingEnabled) {
      disableLocalHandTracking();
    } else {
      setIsHandTrackingEnabled(true);
    }
  };

  const handleLeave = useCallback(() => {
    disableLocalHandTracking();
    if (isPipMode) {
      handleExitPiP();
    }
    stopScreenShare();
    stopMedia();
    leaveRoom();
    onLeaveRoom();
  }, [disableLocalHandTracking, isPipMode, handleExitPiP, stopScreenShare, stopMedia, leaveRoom, onLeaveRoom]);

  const {
    confirmModalConfig,
    closeConfirmModal,
    handleRequestLeave,
    handleEndRoomForEveryone,
    handleRequestHandTracking,
  } = useRoomModeration({
    roomId,
    isHost,
    socketId,
    hostId,
    endRoom,
    handleLeave,
    muteMic,
    userRole,
    isHandTrackingEnabled,
    setIsHandTrackingEnabled,
    activeSignerId,
    setActiveSignerId,
  });

  const handleGestureDetected = useCallback(
    (data) => {
      if (userRole !== ROLES.SIGNER) return;
      if (data && data.gesture) {
        setActiveSignerId('local');
        pushGesture(userName || 'You', data.gesture, data.confidence, {
          mode: data.mode,
          senderId: 'local',
          avatarColor: localAvatarColor,
          avatarUrl: localAvatarUrl,
        });
        sendGesture({
          gesture: data.gesture,
          confidence: data.confidence || 0.95,
          mode: data.mode,
        });
      } else {
        notifyHandReset?.();
      }
    },
    [userRole, sendGesture, pushGesture, userName, notifyHandReset, localAvatarColor, localAvatarUrl]
  );

  // Persistent Room-Level MediaPipe Hand Tracking Worker (Decoupled from UI video tiles)
  const { latestResultsRef } = useHandTrackingWorker({
    localStream,
    isEnabled: isHandTrackingEnabled && userRole === ROLES.SIGNER,
    isCameraOff,
    onGestureDetected: handleGestureDetected,
  });

  const handleExportTranscript = useCallback(() => {
    const allLogs = [...transcriptLogs, ...speechLogs].sort(
      (a, b) => (a.timestamp || 0) - (b.timestamp || 0)
    );
    downloadMeetingTranscript(roomId, allLogs, chatMessages);
  }, [transcriptLogs, speechLogs, roomId, chatMessages]);

  const handleSendChatMessage = useCallback(
    (text) => {
      sendChatMessage(text, userName || 'You');
    },
    [sendChatMessage, userName]
  );

  // Compute candidate signer: prioritize recent gesture sender, fallback to whoever has AI Vision ON
  const activeAiVisionPeerId = Object.keys(peerMediaStatus).find(
    (peerId) => peerMediaStatus[peerId]?.isAiVisionActive
  );
  const effectiveSignerId =
    activeSignerId ||
    (isHandTrackingEnabled ? 'local' : activeAiVisionPeerId || null);

  const activeSignerParticipant = useMemo(() => {
    return updatedParticipants.find((p) => p.id === effectiveSignerId);
  }, [updatedParticipants, effectiveSignerId]);
  const activeSignerName =
    activeSignerParticipant?.name || (userRole === ROLES.SIGNER ? userName : '');
  const activeSignerAvatarColor =
    activeSignerParticipant?.avatarColor ||
    (userRole === ROLES.SIGNER || effectiveSignerId === 'local'
      ? localAvatarColor
      : (effectiveSignerId ? colorForSender(effectiveSignerId) : localAvatarColor));
  const activeSignerAvatarUrl =
    activeSignerParticipant?.avatarUrl ||
    (userRole === ROLES.SIGNER || effectiveSignerId === 'local'
      ? localAvatarUrl
      : null);

  // Active speaker names for live speaking telemetry indicators in caption dock
  const activeSpeakingNames = useMemo(() => {
    const names = [];
    if (isSpeaking && !isMuted) {
      names.push(userName || 'You');
    }
    roomUsers.forEach((u) => {
      if (u.userId !== socketId && peerMediaStatus[u.userId]?.isSpeaking) {
        names.push(u.userMeta?.name || `Participant ${u.userId.slice(0, 4)}`);
      }
    });
    return names;
  }, [isSpeaking, isMuted, userName, roomUsers, socketId, peerMediaStatus]);

  // Primary participant for PiP Mini Player
  const pipMainParticipant = useMemo(() => {
    if (pinnedId) {
      const pinned = updatedParticipants.find((p) => p.id === pinnedId);
      if (pinned) return pinned;
    }
    const screenShare = updatedParticipants.find((p) => p.isScreenSharing);
    if (screenShare) return screenShare;

    const signer = updatedParticipants.find((p) => p.id === effectiveSignerId);
    if (signer) return signer;

    const activeSpeaker = updatedParticipants.find((p) => p.isSpeaking && !p.isMuted && !p.isLocal);
    if (activeSpeaker) return activeSpeaker;

    const firstRemoteWithVideo = updatedParticipants.find((p) => !p.isLocal && !p.isCameraOff && p.hasStream);
    if (firstRemoteWithVideo) return firstRemoteWithVideo;

    const firstRemote = updatedParticipants.find((p) => !p.isLocal);
    if (firstRemote) return firstRemote;

    return updatedParticipants.find((p) => p.isLocal) || localCameraParticipant;
  }, [pinnedId, updatedParticipants, effectiveSignerId, localCameraParticipant]);

  const handleCloseHandMotion = useCallback(() => {
    setIsHandTrackingEnabled(false);
    if (activeSignerId === 'local') {
      setActiveSignerId(null);
    }
  }, [activeSignerId]);

  return (
    <>
      {isPipMode ? (
        <MeetingPipView
          mainParticipant={pipMainParticipant}
          localStream={localStream}
          localAvatarColor={localAvatarColor}
          localAvatarUrl={localAvatarUrl}
          userRole={userRole}
          isMuted={isMuted}
          isCameraOff={isCameraOff}
          isScreenSharing={isScreenSharing}
          speechCaptions={combinedSpeechCaptions}
          currentSentence={currentSentence}
          liveTokens={liveTokens}
          signerName={activeSignerName}
          signerId={effectiveSignerId}
          signerAvatarColor={activeSignerAvatarColor}
          signerAvatarUrl={activeSignerAvatarUrl}
          isCaptionsEnabled={isCaptionsEnabled}
          captionMode={captionMode}
          isAiEnabled={isCaptionsEnabled && captionMode === 'SLT'}
          isSttEnabled={isCaptionsEnabled && captionMode === 'STT'}
          onExitPiP={handleExitPiP}
          onLeaveRoom={handleRequestLeave}
          onToggleMic={toggleMic}
          onToggleCamera={toggleCamera}
          onToggleCaptions={handleToggleCaptions}
          onToggleScreenShare={toggleScreenShare}
          selectedSpeakerDeviceId={selectedSpeakerDeviceId}
        />
      ) : (
        <div className="w-screen h-screen max-h-screen bg-[#202124] text-white flex flex-col justify-between font-sans select-none overflow-hidden">
      {/* Top Header Room Info with Custom Window Dragging & IPC WindowControls */}
      <header
        onDoubleClick={() => window.electronAPI?.toggleMaximize?.()}
        style={{ WebkitAppRegion: 'drag' }}
        data-tauri-drag-region="true"
        className="w-full h-11 px-4 md:px-6 flex items-center justify-between z-30 shrink-0 select-none bg-transparent"
      >
        {/* Left: Google Meet Style Time & Room ID (Draggable title bar area) */}
        <div className="flex items-center space-x-2.5 text-xs md:text-sm font-semibold text-white select-none">
          <span>{meetingTime}</span>
          <span className="text-white/30 font-light select-none">|</span>
          <span
            className="tracking-normal select-all cursor-text font-semibold font-sans"
            style={{ WebkitAppRegion: 'no-drag' }}
            title="Room ID"
          >
            {roomId}
          </span>
        </div>

        {/* Right Header Area: Zoom-Style View Switcher & Windows Native WindowControls (IPC) */}
        <div style={{ WebkitAppRegion: 'no-drag' }} className="flex items-center space-x-1.5 ml-auto">
          {/* Zoom-Style View Mode Dropdown (Icon-only, filled, no background) */}
          <div className="relative" ref={viewDropdownRef}>
            <button
              onClick={() => setIsViewDropdownOpen((prev) => !prev)}
              style={{ WebkitAppRegion: 'no-drag' }}
              className="w-8 h-7 rounded-md flex items-center justify-center text-white/90 hover:bg-white/15 hover:text-white active:bg-white/25 transition-colors cursor-pointer outline-none focus:outline-none bg-transparent"
              title="Change view"
            >
              {layoutMode === 'spotlight' || layoutMode === 'speaker' ? (
                <ZoomSpeakerFillIcon className="w-4 h-4 text-white" />
              ) : layoutMode === 'sidebar' ? (
                <ZoomSideBySideFillIcon className="w-4 h-4 text-white" />
              ) : (
                <ZoomGalleryFillIcon className="w-4 h-4 text-white" />
              )}
            </button>

            {isViewDropdownOpen && (
              <div
                className="absolute top-8.5 right-0 w-48 bg-[#1E1F22] rounded-2xl p-1.5 shadow-2xl z-50 text-slate-100 text-[13px] border border-white/10 space-y-0.5"
                style={{ WebkitAppRegion: 'no-drag' }}
              >
                <button
                  onClick={() => {
                    setLayoutMode('spotlight');
                    setIsViewDropdownOpen(false);
                  }}
                  className={`w-full px-2.5 py-2 rounded-xl flex items-center justify-between transition-colors cursor-pointer outline-none ${
                    layoutMode === 'spotlight' || layoutMode === 'speaker'
                      ? 'bg-white/15 text-white font-medium'
                      : 'hover:bg-white/10 text-slate-200 hover:text-white'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <span className="w-4 flex items-center justify-center text-white shrink-0">
                      {(layoutMode === 'spotlight' || layoutMode === 'speaker') && (
                        <CheckmarkIcon className="w-3.5 h-3.5 text-white stroke-[2.5]" />
                      )}
                    </span>
                    <span>Speaker</span>
                  </div>
                  <ZoomSpeakerFillIcon className="w-4 h-4 text-slate-300 shrink-0" />
                </button>
                <button
                  onClick={() => {
                    setLayoutMode('tiled');
                    setIsViewDropdownOpen(false);
                  }}
                  className={`w-full px-2.5 py-2 rounded-xl flex items-center justify-between transition-colors cursor-pointer outline-none ${
                    layoutMode === 'tiled' || layoutMode === 'gallery'
                      ? 'bg-white/15 text-white font-medium'
                      : 'hover:bg-white/10 text-slate-200 hover:text-white'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <span className="w-4 flex items-center justify-center text-white shrink-0">
                      {(layoutMode === 'tiled' || layoutMode === 'gallery') && (
                        <CheckmarkIcon className="w-3.5 h-3.5 text-white stroke-[2.5]" />
                      )}
                    </span>
                    <span>Gallery</span>
                  </div>
                  <ZoomGalleryFillIcon className="w-4 h-4 text-slate-300 shrink-0" />
                </button>
                <button
                  onClick={() => {
                    setLayoutMode('sidebar');
                    setIsViewDropdownOpen(false);
                  }}
                  className={`w-full px-2.5 py-2 rounded-xl flex items-center justify-between transition-colors cursor-pointer outline-none ${
                    layoutMode === 'sidebar'
                      ? 'bg-white/15 text-white font-medium'
                      : 'hover:bg-white/10 text-slate-200 hover:text-white'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <span className="w-4 flex items-center justify-center text-white shrink-0">
                      {layoutMode === 'sidebar' && (
                        <CheckmarkIcon className="w-3.5 h-3.5 text-white stroke-[2.5]" />
                      )}
                    </span>
                    <span>Side-by-side</span>
                  </div>
                  <ZoomSideBySideFillIcon className="w-4 h-4 text-slate-300 shrink-0" />
                </button>
              </div>
            )}
          </div>

          {/* Windows Native Controls (Dark Mode IPC) */}
          <TitleBar dark={true} onMinimize={handleEnterPiP} />
        </div>
      </header>

      {/* Main Workspace: Meeting Layout Engine + Slide-over Chat & People Drawers */}
      <main className="flex-1 w-full flex items-stretch justify-between gap-2 sm:gap-4 overflow-hidden px-2 sm:px-4 md:px-6 my-1 relative min-h-0">
        {/* Left Column: Video Stage + Subtitles CC Stage (Adapts width dynamically when drawers open - Image 2) */}
        <div className="flex-1 h-full min-w-0 flex flex-col justify-between overflow-hidden">
          <div className="flex-1 w-full min-h-0">
            <MeetingLayoutEngine
              participants={updatedParticipants}
              videoRef={videoRef}
              localStream={activeLocalStream}
              layoutMode={layoutMode}
              pinnedId={pinnedId}
              onTogglePin={handleTogglePin}
              isAiEnabled={isCaptionsEnabled && captionMode === 'SLT'}
              isHandTrackingEnabled={isHandTrackingEnabled && userRole === ROLES.SIGNER}
              activeSignerId={effectiveSignerId}
              speechCaptions={combinedSpeechCaptions}
              userRole={userRole}
              isSttActive={isSttActive}
              selectedSpeakerDeviceId={selectedSpeakerDeviceId}
            />
          </div>

          {/* Dedicated Accessible Caption & Subtitle Dock (Stacked beneath video) */}
          <CaptionDock
            role={userRole}
            captionMode={captionMode}
            isCaptionsEnabled={isCaptionsEnabled}
            prefs={captionPrefs}
            onPrefsChange={updateCaptionPref}
            onResetPrefs={resetCaptionPrefs}
            isSttEnabled={isCaptionsEnabled && captionMode === 'STT'}
            isAiEnabled={isCaptionsEnabled && captionMode === 'SLT'}
            isHandTrackingEnabled={isHandTrackingEnabled && userRole === ROLES.SIGNER}
            sttStatus={sttStatus}
            sttProgress={sttProgress}
            speechCaptions={combinedSpeechCaptions}
            currentSentence={currentSentence}
            liveTokens={liveTokens}
            transcriptLogs={transcriptLogs}
            speechLogs={speechLogs}
            speakingNames={activeSpeakingNames}
            signerName={activeSignerName}
            signerId={effectiveSignerId}
            signerAvatarColor={activeSignerAvatarColor}
            signerAvatarUrl={activeSignerAvatarUrl}
            onSwitchMode={handleSwitchSubtitleMode}
          />
        </div>

        {/* Unified Slide-in / Slide-out Side Panel Drawer */}
        <aside
          aria-hidden={!isChatOpen && !isPeopleOpen}
          className={`h-full bg-[#202124] flex flex-col justify-between z-20 shadow-2xl rounded-xl overflow-hidden transition-all duration-300 ease-in-out shrink-0 select-none ${
            isChatOpen || isPeopleOpen
              ? 'w-72 sm:w-80 md:w-96 opacity-100 translate-x-0 border-l border-slate-700/60'
              : 'w-0 opacity-0 translate-x-12 border-l-0 pointer-events-none'
          }`}
        >
          <div className="w-72 sm:w-80 md:w-96 h-full flex flex-col justify-between shrink-0">
            {isChatOpen && (
              <MeetingChatDrawer
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                messages={chatMessages}
                onSendMessage={handleSendChatMessage}
                currentSocketId={socketId}
              />
            )}
            {isPeopleOpen && (
              <MeetingParticipantsDrawer
                isOpen={isPeopleOpen}
                onClose={() => setIsPeopleOpen(false)}
                participants={updatedParticipants}
                pinnedId={pinnedId}
                hostId={hostId}
                onTogglePin={handleTogglePin}
                onMutePeer={sendMutePeer}
                onKickPeer={sendKickPeer}
                currentSocketId={socketId}
              />
            )}
          </div>
        </aside>
      </main>

      {/* Bottom Meeting Controls Bar */}
      <div className="w-full px-2 sm:px-4 md:px-6 pb-2 sm:pb-3 shrink-0 flex flex-col">
        <MeetingControlBar
          isMuted={isMuted}
          isCameraOff={isCameraOff}
          isScreenSharing={isScreenSharing}
          isAiEnabled={isCaptionsEnabled && captionMode === 'SLT'}
          isHandTrackingEnabled={isHandTrackingEnabled && userRole === ROLES.SIGNER}
          isChatOpen={isChatOpen}
          isPeopleOpen={isPeopleOpen}
          unreadCount={unreadCount}
          participantCount={updatedParticipants.length}
          pinnedId={pinnedId}
          userRole={userRole}
          isCaptionsEnabled={isCaptionsEnabled}
          captionMode={captionMode}
          isSttEnabled={isCaptionsEnabled && captionMode === 'STT'}
          sttStatus={sttStatus}
          isSignLanguageEnabled={userRole === ROLES.SIGNER}
          onToggleMic={toggleMic}
          onToggleCamera={toggleCamera}
          onToggleScreenShare={toggleScreenShare}
          onToggleAi={handleToggleCaptions}
          onToggleHandTracking={handleRequestHandTracking}
          onToggleStt={handleToggleCaptions}
          onToggleCaptions={handleToggleCaptions}
          onToggleSignLanguageSupport={handleToggleSignLanguageSupport}
          onToggleChat={handleToggleChat}
          onTogglePeople={handleTogglePeople}
          onResetPin={handleResetPin}
          onLeaveRoom={handleRequestLeave}
          speakerDevices={speakerDevices}
          selectedSpeakerDeviceId={selectedSpeakerDeviceId}
          onChangeSpeakerDevice={changeSpeakerDevice}
          audioDevices={audioDevices}
          selectedAudioDeviceId={selectedAudioDeviceId}
          onChangeAudioDevice={changeAudioDevice}
          videoDevices={videoDevices}
          selectedVideoDeviceId={selectedVideoDeviceId}
          onChangeVideoDevice={changeVideoDevice}
        />
      </div>
        </div>
      )}

      {/* 1.5s "Joining room..." Transition Curtain */}
      {isJoiningRoom && (
        <div className="fixed inset-0 z-50 bg-[#202124] flex flex-col items-center justify-center select-none animate-in fade-in duration-200">
          <div className="flex flex-col items-center space-y-4">
            <LoadingSpinnerIcon className="w-10 h-10 text-[#8AB4F8] animate-spin" />
            <div className="text-white text-base sm:text-lg font-medium tracking-wide">
              Joining room...
            </div>
          </div>
        </div>
      )}

      {/* Detached OS Companion Window for 2-Hand Camera Motion Tracking */}
      <HandMotionWindow
        isOpen={isHandTrackingEnabled && userRole === ROLES.SIGNER}
        localStream={localStream}
        isCameraOff={isCameraOff}
        latestResultsRef={latestResultsRef}
        onClose={handleCloseHandMotion}
      />

      {/* User Action Confirmation Modal (Leave Call, AI Vision) */}
      <MeetingConfirmModal
        isOpen={confirmModalConfig.isOpen}
        title={confirmModalConfig.title}
        description={confirmModalConfig.description}
        infoPill={confirmModalConfig.infoPill}
        actions={confirmModalConfig.actions}
        onClose={closeConfirmModal}
      />
    </>
  );
}



