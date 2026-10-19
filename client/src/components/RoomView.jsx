import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSocket } from '../hooks/useSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import { useScreenShare } from '../hooks/useScreenShare';
import { useAslAggregator } from '../hooks/useAslAggregator';
import { useHandTrackingWorker } from '../hooks/useHandTrackingWorker';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { downloadMeetingTranscript } from '../utils/exportTranscript';
import MeetingLayoutEngine from './room/MeetingLayoutEngine';
import MeetingControlBar from './room/MeetingControlBar';
import MeetingChatDrawer from './room/MeetingChatDrawer';
import MeetingParticipantsDrawer from './room/MeetingParticipantsDrawer';
import RolePromptModal from './room/RolePromptModal';
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

  // Real-Time ASL Sentence Aggregator Hook (Buffers raw gestures into fluent sentences with auto-clearing)
  const { currentSentence, transcriptLogs, pushGesture, notifyHandReset } = useAslAggregator(
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
  const sttAudioStream = useMemo(() => {
    if (userRole !== ROLES.SIGNER || !isSttEnabled) return null;
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
      return new MediaStream(audioTracks);
    }
    // Fallback to local mic only if completely alone in room (single user testing)
    const hasRemotePeers = Object.keys(peerStreams).length > 0;
    if (!hasRemotePeers && localStream && !isMuted) {
      return localStream;
    }
    return null;
  }, [peerStreams, userRole, isSttEnabled, localStream, isMuted]);

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
  const [layoutMode, setLayoutMode] = useState('tiled');
  const [pinnedId, setPinnedId] = useState(null);
  const [isAiEnabled, setIsAiEnabled] = useState(true);
  const [isHandTrackingEnabled, setIsHandTrackingEnabled] = useState(userRole === ROLES.SIGNER);
  const [subtitleText, setSubtitleText] = useState('AI Subtitle Standby');
  const [activeSignerId, setActiveSignerId] = useState(null);

  // Sync role with initialRole if it changes or becomes available
  useEffect(() => {
    if (initialRole && initialRole !== userRole) {
      setUserRole(initialRole);
      if (initialRole === ROLES.SIGNER) {
        setIsHandTrackingEnabled(true);
      }
    }
  }, [initialRole]);

  // In-Call Real-Time Chat & People Drawers state (Mutually Exclusive)
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
      } else if (newRole === ROLES.SIGNER) {
        setIsSttEnabled(false);
        setIsHandTrackingEnabled(true);
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

  return (
    <div className="w-screen h-screen max-h-screen bg-[#121212] text-white flex flex-col justify-between p-3.5 sm:p-5 md:p-6 font-sans select-none overflow-hidden">
      {/* Top Header Room Info */}
      <header className="w-full text-xs md:text-sm font-semibold text-slate-400 flex items-center justify-between z-10 shrink-0 select-none">
        <div className="flex items-center space-x-1.5">
          <span>Room ID:</span>
          <span className="font-mono font-bold text-white tracking-wide select-all cursor-text">
            {roomId}
          </span>
        </div>
      </header>

      {/* Main Workspace: Meeting Layout Engine + Slide-over Chat & People Drawers */}
      <main className="flex-1 w-full flex items-center justify-between gap-4 overflow-hidden my-1.5 relative min-h-0">
        <div className="flex-1 h-full min-w-0">
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
            subtitleText={currentSentence}
            speechCaptions={combinedSpeechCaptions}
            userRole={userRole}
            isSttActive={isSttActive}
            onRegisterCanvas={registerCanvas}
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
        layoutMode={layoutMode}
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
        onChangeLayout={(mode) => setLayoutMode(mode)}
        onExportTranscript={handleExportTranscript}
        onResetPin={handleResetPin}
        onLeaveRoom={handleLeave}
      />

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



