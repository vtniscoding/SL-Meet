import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSocket } from '../hooks/useSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import { useScreenShare } from '../hooks/useScreenShare';
import { useAslAggregator } from '../hooks/useAslAggregator';
import { useHandTrackingWorker } from '../hooks/useHandTrackingWorker';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { downloadMeetingTranscript } from '../utils/exportTranscript';
import { useCaptionPrefs } from '../hooks/useCaptionPrefs';
import MeetingLayoutEngine from './room/MeetingLayoutEngine';
import MeetingControlBar from './room/MeetingControlBar';
import MeetingChatDrawer from './room/MeetingChatDrawer';
import MeetingParticipantsDrawer from './room/MeetingParticipantsDrawer';
import CaptionDock from './room/captions/CaptionDock';
import RolePromptModal from './room/RolePromptModal';
import MeetingPipView from './room/MeetingPipView';
import WindowControls from './common/WindowControls';
import {
  ZoomSpeakerFillIcon,
  ZoomGalleryFillIcon,
  ZoomSideBySideFillIcon,
  CheckmarkIcon,
} from '../icons';
import { ROLES } from '../constants/roles';

/**
 * Top-Level Room Layout Container Component
 */
export default function RoomView({
  roomId,
  onLeaveRoom,
  mediaState,
  userName = 'You',
  currentUser = null,
  initialRole = ROLES.NON_SIGNER,
}) {
  // Participant Communication Role State ('signer' | 'non_signer')
  const [userRole, setUserRole] = useState(() => initialRole || ROLES.NON_SIGNER);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [isSttEnabled, setIsSttEnabled] = useState(false);
  const [speechLogs, setSpeechLogs] = useState([]);
  const [localSpeechCaptions, setLocalSpeechCaptions] = useState({});

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
  } = mediaState || {};

  // Screen Sharing Hook
  const { isScreenSharing, screenStream, toggleScreenShare, stopScreenShare } = useScreenShare();

  // Active Stream passed to WebRTC & Canvas (screenStream if sharing, else localStream)
  const activeLocalStream = isScreenSharing ? screenStream : localStream;

  // Socket.io Real-Time Connection & Signaling Hook
  const {
    isConnected,
    socketId,
    hostId,
    remoteGestures,
    roomUsers,
    presentingUsers,
    peerMediaStatus,
    chatMessages,
    speechCaptions,
    toggleConnection,
    joinRoom,
    leaveRoom,
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

  // Signer's Speech-to-Text Pipeline: captures incoming audio from remote speakers
  // Or fallbacks to local microphone if alone in room (single user testing)
  const sttTracks = useMemo(() => {
    if (userRole !== ROLES.SIGNER || !isSttEnabled) return [];
    const audioTracks = [];
    Object.entries(peerStreams).forEach(([peerId, stream]) => {
      if (stream) {
        stream.getAudioTracks().forEach((track) => {
          if (track.readyState === 'live') {
            audioTracks.push(track);
          }
        });
      }
    });
    if (audioTracks.length > 0) {
      return audioTracks;
    }
    // Fallback to local mic only if completely alone in room (single user testing)
    const hasRemotePeers = Object.keys(peerStreams).length > 0;
    if (!hasRemotePeers && localStream && !isMuted) {
      return localStream.getAudioTracks().filter((t) => t.readyState === 'live');
    }
    return [];
  }, [peerStreams, userRole, isSttEnabled, localStream, isMuted]);

  const sttTracksKey = sttTracks.map((t) => t.id).sort().join('|');
  const sttAudioStream = useMemo(
    () => (sttTracks.length ? new MediaStream(sttTracks) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sttTracksKey]
  );

  const isSttActive = userRole === ROLES.SIGNER && isSttEnabled && !!sttAudioStream;
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
        // Check if transcribing remote peer or local user testing alone
        const hasRemotePeers = Object.values(peerStreams).some((s) => s && s.getAudioTracks().length > 0);

        const activeSpeakerPeer =
          roomUsers.find((u) => u.userId !== socketId && peerMediaStatus[u.userId]?.isSpeaking) ||
          roomUsers.find((u) => u.userId !== socketId && u.role === ROLES.NON_SIGNER) ||
          roomUsers.find((u) => u.userId !== socketId);

        const speakerId = hasRemotePeers && activeSpeakerPeer ? activeSpeakerPeer.userId : 'local';
        const speakerName = hasRemotePeers && activeSpeakerPeer ? (activeSpeakerPeer.userMeta?.name || 'Speaker') : (userName || 'You');

        setLocalSpeechCaptions((prev) => ({
          ...prev,
          [speakerId]: {
            senderId: speakerId,
            text,
            isFinal,
            senderName: speakerName,
            timestamp: Date.now(),
          },
        }));

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
              type: 'SPEECH',
              text,
            },
          ]);
        }
      },
      [roomUsers, socketId, peerMediaStatus, peerStreams, userName]
    ),
  });

  // Unified speech captions: merges socket captions and local transcription captions
  const combinedSpeechCaptions = useMemo(() => {
    return {
      ...(speechCaptions || {}),
      ...localSpeechCaptions,
    };
  }, [speechCaptions, localSpeechCaptions]);

  // Track finalized remote speech captions from socket for Signer role
  const loggedSpeechCaptionsRef = useRef(new Set());
  useEffect(() => {
    if (speechCaptions && userRole === ROLES.SIGNER) {
      Object.entries(speechCaptions).forEach(([senderId, cap]) => {
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
                type: 'SPEECH',
                text: cap.text,
              },
            ]);
          }
        }
      });
    }
  }, [speechCaptions, userRole]);

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

  // Role switching callback
  const handleChangeRole = useCallback(
    (newRole) => {
      setUserRole(newRole);
      changeRole(newRole);
      if (newRole === ROLES.NON_SIGNER) {
        setIsHandTrackingEnabled(false);
        setIsSttEnabled(false);
        setIsAiEnabled(false);
      } else if (newRole === ROLES.SIGNER) {
        setIsSttEnabled(false);
        setIsAiEnabled(false);
        setIsHandTrackingEnabled(false);
      }
      setIsRoleModalOpen(false);
    },
    [changeRole]
  );

  // Dedicated callback for switching subtitle mode (SLT / STT) from CaptionDock dropdown
  const handleSwitchSubtitleMode = useCallback(
    (newRole) => {
      setUserRole(newRole);
      changeRole(newRole);
      if (newRole === ROLES.NON_SIGNER) {
        setIsHandTrackingEnabled(false);
        setIsSttEnabled(false);
        setIsAiEnabled(true);
      } else if (newRole === ROLES.SIGNER) {
        setIsSttEnabled(true);
        setIsAiEnabled(false);
        setIsHandTrackingEnabled(false);
      }
      setIsRoleModalOpen(false);
    },
    [changeRole]
  );

  // Auto connect & join room socket channel
  const userRoleRef = useRef(userRole);
  useEffect(() => {
    userRoleRef.current = userRole;
  }, [userRole]);

  useEffect(() => {
    if (!isConnected) {
      toggleConnection();
    }
    joinRoom(roomId, {
      name: userName || 'Participant',
      userId: currentUser?.id || null,
      isGuest: !currentUser,
      role: userRoleRef.current,
    });
    return () => {
      leaveRoom();
    };
  }, [roomId, userName, currentUser]);

  // Broadcast local camera, mic, and AI Vision status changes to all room peers
  useEffect(() => {
    if (sendMediaStatusChange && isConnected) {
      sendMediaStatusChange(isMuted, isCameraOff, isHandTrackingEnabled);
    }
  }, [isMuted, isCameraOff, isHandTrackingEnabled, isConnected, sendMediaStatusChange]);

  // Listen for host remote moderation events (remote mute request / kicked)
  useEffect(() => {
    const handleRemoteMute = () => {
      if (muteMic) {
        muteMic();
      }
    };
    const handleRemoteKick = () => {
      handleLeave();
    };

    window.addEventListener('sl_meet_mute_local_mic', handleRemoteMute);
    window.addEventListener('sl_meet_kicked_from_room', handleRemoteKick);

    return () => {
      window.removeEventListener('sl_meet_mute_local_mic', handleRemoteMute);
      window.removeEventListener('sl_meet_kicked_from_room', handleRemoteKick);
    };
  }, [muteMic]);

  // Sync latest remote gesture into ASL Sentence Aggregator
  useEffect(() => {
    if (remoteGestures && remoteGestures.length > 0) {
      const latest = remoteGestures[0];
      if (latest && latest.gesture) {
        const sender = roomUsers.find((u) => u.userId === latest.senderId);
        const senderName = sender?.userMeta?.name || `Participant ${latest.senderId?.slice(0, 4)}`;
        pushGesture(senderName, latest.gesture);
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
      setLayoutMode('sidebar');
      setPinnedId('local-screen');
    }
    prevLocalPresentingRef.current = isScreenSharing;
  }, [isScreenSharing, screenStream, sendPresentingStatus]);

  // Auto switch layout ONCE when a new remote peer starts presenting
  useEffect(() => {
    const activePeerPresenter = Object.keys(presentingUsers).find((id) => presentingUsers[id]?.isPresenting);
    if (activePeerPresenter && activePeerPresenter !== prevRemotePresenterRef.current) {
      setLayoutMode('sidebar');
      setPinnedId(`${activePeerPresenter}-screen`);
      prevRemotePresenterRef.current = activePeerPresenter;
    } else if (!activePeerPresenter && prevRemotePresenterRef.current) {
      const prevScreenId = `${prevRemotePresenterRef.current}-screen`;
      setPinnedId((prevPinned) => (prevPinned === prevScreenId ? null : prevPinned));
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
    name: localDisplayName,
    role: userRole,
    isLocal: true,
    isScreenSharing: false,
    isCameraOff,
    isMuted,
    isSpeaking,
    isActiveSpeaker: true,
    isAiVisionActive: isHandTrackingEnabled,
    stream: localStream,
  };

  const localPresentationParticipant = isScreenSharing
    ? {
        id: 'local-screen',
        name: userName ? `${userName} (Presentation)` : 'You (Presentation)',
        role: userRole,
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

  const handleToggleHandTracking = () => {
    if (userRole !== ROLES.SIGNER) return;
    setIsHandTrackingEnabled((prev) => {
      const next = !prev;
      if (!next && activeSignerId === 'local') {
        setActiveSignerId(null);
      }
      return next;
    });
  };

  const handleLeave = () => {
    if (isPipMode) {
      handleExitPiP();
    }
    stopScreenShare();
    stopMedia();
    leaveRoom();
    onLeaveRoom();
  };

  const handleGestureDetected = useCallback(
    (data) => {
      if (userRole !== ROLES.SIGNER) return;
      if (data && data.gesture) {
        setActiveSignerId('local');
        pushGesture(userName || 'You', data.gesture, data.confidence);
        sendGesture({ gesture: data.gesture, confidence: data.confidence || 0.95 });
      } else {
        notifyHandReset?.();
      }
    },
    [userRole, sendGesture, pushGesture, userName, notifyHandReset]
  );

  // Persistent Room-Level MediaPipe Hand Tracking Worker (Decoupled from UI video tiles)
  const { registerCanvas } = useHandTrackingWorker({
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
    activeSignerParticipant?.name || (userRole === ROLES.SIGNER ? userName : 'Signer');

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

  if (isPipMode) {
    return (
      <MeetingPipView
        mainParticipant={pipMainParticipant}
        localStream={localStream}
        userRole={userRole}
        isMuted={isMuted}
        isCameraOff={isCameraOff}
        speechCaptions={combinedSpeechCaptions}
        currentSentence={currentSentence}
        liveTokens={liveTokens}
        signerName={activeSignerName}
        isAiEnabled={isAiEnabled}
        isSttEnabled={isSttEnabled}
        onExitPiP={handleExitPiP}
        onLeaveRoom={handleLeave}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
      />
    );
  }

  return (
    <div className="w-screen h-screen max-h-screen bg-[#121212] text-white flex flex-col justify-between font-sans select-none overflow-hidden">
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
        <div className="flex items-center space-x-1.5 ml-auto">
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
          <WindowControls dark={true} onMinimize={handleEnterPiP} />
        </div>
      </header>

      {/* Main Workspace: Meeting Layout Engine + Slide-over Chat & People Drawers */}
      <main className="flex-1 w-full flex items-stretch justify-between gap-4 overflow-hidden px-4 md:px-6 my-1 relative min-h-0">
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
              isAiEnabled={isAiEnabled}
              isHandTrackingEnabled={isHandTrackingEnabled && userRole === ROLES.SIGNER}
              activeSignerId={effectiveSignerId}
              speechCaptions={combinedSpeechCaptions}
              userRole={userRole}
              isSttActive={isSttActive}
              onRegisterCanvas={registerCanvas}
            />
          </div>

          {/* Dedicated Accessible Caption & Subtitle Dock (Stacked beneath video) */}
          <CaptionDock
            role={userRole}
            prefs={captionPrefs}
            onPrefsChange={updateCaptionPref}
            onResetPrefs={resetCaptionPrefs}
            isSttEnabled={isSttEnabled}
            isAiEnabled={isAiEnabled}
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
            onSwitchMode={handleSwitchSubtitleMode}
          />
        </div>

        {/* Real-Time In-Call Text Chat Drawer */}
        <MeetingChatDrawer
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          messages={chatMessages}
          onSendMessage={sendChatMessage}
          currentSocketId={socketId}
        />

        {/* Real-Time Participants & Moderation Drawer */}
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
      </main>

      {/* Bottom Meeting Controls Bar */}
      <div className="w-full px-4 md:px-6 pb-2.5 sm:pb-3 shrink-0 flex flex-col">
        <MeetingControlBar
          isMuted={isMuted}
          isCameraOff={isCameraOff}
          isScreenSharing={isScreenSharing}
          isAiEnabled={isAiEnabled}
          isHandTrackingEnabled={isHandTrackingEnabled && userRole === ROLES.SIGNER}
          isChatOpen={isChatOpen}
          isPeopleOpen={isPeopleOpen}
          unreadCount={unreadCount}
          participantCount={updatedParticipants.length}
          pinnedId={pinnedId}
          userRole={userRole}
          isSttEnabled={isSttEnabled}
          sttStatus={sttStatus}
          onToggleMic={toggleMic}
          onToggleCamera={toggleCamera}
          onToggleScreenShare={toggleScreenShare}
          onToggleAi={handleToggleAi}
          onToggleHandTracking={handleToggleHandTracking}
          onToggleStt={() => setIsSttEnabled((prev) => !prev)}
          onRequestSwitchRole={() => setIsRoleModalOpen(true)}
          onToggleChat={handleToggleChat}
          onTogglePeople={handleTogglePeople}
          onResetPin={handleResetPin}
          onLeaveRoom={handleLeave}
        />
      </div>

      {/* In-Room Role Switch Modal */}
      <RolePromptModal
        isOpen={isRoleModalOpen}
        currentRole={userRole}
        dismissible={true}
        onSelectRole={handleChangeRole}
        onClose={() => setIsRoleModalOpen(false)}
      />
    </div>
  );
}



