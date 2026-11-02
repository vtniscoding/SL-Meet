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
import MeetingConfirmModal from './room/MeetingConfirmModal';
import MeetingPipView from './room/MeetingPipView';
import HandMotionWindow from './room/HandMotionWindow';
import WindowControls from './common/WindowControls';
import {
  ZoomSpeakerFillIcon,
  ZoomGalleryFillIcon,
  ZoomSideBySideFillIcon,
  CheckmarkIcon,
} from '../icons';
import { ROLES } from '../constants/roles';
import { getRandomSpeakerColor, colorForSender } from './room/captions/captionUtils';
import { supabase } from '../utils/supabase';

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

  // Stable random avatar color & user avatar URL for local participant
  const localAvatarColor = useMemo(() => getRandomSpeakerColor(), []);
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

  // Speech-to-Text Pipeline: captures incoming audio from remote speakers or local microphone
  const shouldListenSpeech = (isCaptionsEnabled && captionMode === 'STT') || (!isMuted && localStream);
  const sttTracks = useMemo(() => {
    if (!shouldListenSpeech) return [];
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
    if (localStream && !isMuted) {
      localStream.getAudioTracks().forEach((track) => {
        if (track.readyState === 'live') {
          audioTracks.push(track);
        }
      });
    }
    return audioTracks;
  }, [peerStreams, shouldListenSpeech, localStream, isMuted]);

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
        const hasRemotePeers = Object.values(peerStreams).some((s) => s && s.getAudioTracks().length > 0);
        const now = Date.now();
        let speaker = null;

        const activePeer = roomUsers.find((u) => u.userId !== socketId && peerMediaStatus[u.userId]?.isSpeaking);
        if (activePeer) {
          speaker = {
            userId: activePeer.userId,
            name: activePeer.userMeta?.name || `Participant ${activePeer.userId.slice(0, 4)}`,
            avatarColor: activePeer.avatarColor || activePeer.userMeta?.avatarColor || colorForSender(activePeer.userId),
            avatarUrl: activePeer.avatarUrl || activePeer.userMeta?.avatarUrl || null,
          };
        } else if (hasRemotePeers && now - lastActiveSpeakerRef.current.timestamp < 4500 && lastActiveSpeakerRef.current.userId !== 'local') {
          speaker = lastActiveSpeakerRef.current;
        } else if (!hasRemotePeers || (isSpeaking && !isMuted)) {
          speaker = {
            userId: 'local',
            name: userName || 'You',
            avatarColor: localAvatarColor,
            avatarUrl: localAvatarUrl,
          };
        } else {
          speaker = lastActiveSpeakerRef.current;
        }

        const speakerId = speaker.userId;
        const speakerName = speaker.name;
        const speakerAvatarColor = speaker.avatarColor;
        const speakerAvatarUrl = speaker.avatarUrl;

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

        if (sendSpeechCaption && (!hasRemotePeers || speakerId === 'local')) {
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
      [roomUsers, socketId, peerMediaStatus, peerStreams, userName, localAvatarColor, localAvatarUrl, isSpeaking, isMuted, sendSpeechCaption]
    ),
  });

  // Unified speech captions: merges socket captions and local transcription captions
  const combinedSpeechCaptions = useMemo(() => {
    return {
      ...(speechCaptions || {}),
      ...localSpeechCaptions,
    };
  }, [speechCaptions, localSpeechCaptions]);

  // Track finalized remote speech captions from socket
  const loggedSpeechCaptionsRef = useRef(new Set());
  useEffect(() => {
    if (speechCaptions && isCaptionsEnabled && captionMode === 'STT') {
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
  }, [speechCaptions, isCaptionsEnabled, captionMode]);

  // Meeting Room Layout Modes: 'tiled' (Auto Grid) | 'sidebar' (Thanh bên) | 'spotlight' (Tiêu điểm)
  const [isPipMode, setIsPipMode] = useState(false);
  const [layoutMode, setLayoutMode] = useState('tiled');
  const [pinnedId, setPinnedId] = useState(null);
  const [isAiEnabled, setIsAiEnabled] = useState(false);
  const [isHandTrackingEnabled, setIsHandTrackingEnabled] = useState(false);
  const [activeSignerId, setActiveSignerId] = useState(null);

  // User action confirmation modal state (End call, AI vision)
  const [confirmModalConfig, setConfirmModalConfig] = useState({
    isOpen: false,
    title: '',
    description: '',
    infoPill: '',
    actions: [],
  });

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

  // Toggle Sign Language Support callback ('signer' <-> 'non_signer')
  const handleToggleSignLanguageSupport = useCallback(() => {
    const nextRole = userRole === ROLES.SIGNER ? ROLES.NON_SIGNER : ROLES.SIGNER;
    setUserRole(nextRole);
    changeRole(nextRole);
    if (nextRole === ROLES.NON_SIGNER) {
      setIsHandTrackingEnabled(false);
      if (activeSignerId === 'local') {
        setActiveSignerId(null);
      }
      if (window.electronAPI?.closeHandMotion) {
        window.electronAPI.closeHandMotion();
      }
    }
  }, [userRole, changeRole, activeSignerId]);

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
      sendMediaStatusChange(isMuted, isCameraOff, isHandTrackingEnabled);
    }
  }, [isMuted, isCameraOff, isHandTrackingEnabled, isConnected, sendMediaStatusChange]);

  // Listen for host remote moderation events (remote mute request / kicked / room ended)
  const handleLeaveRef = useRef(null);
  const roomControlChannelRef = useRef(null);

  useEffect(() => {
    const handleRemoteMute = () => {
      if (muteMic) {
        muteMic();
      }
    };
    const handleRemoteLeave = () => {
      if (handleLeaveRef.current) {
        handleLeaveRef.current();
      }
    };

    window.addEventListener('sl_meet_mute_local_mic', handleRemoteMute);
    window.addEventListener('sl_meet_kicked_from_room', handleRemoteLeave);
    window.addEventListener('sl_meet_room_ended', handleRemoteLeave);

    return () => {
      window.removeEventListener('sl_meet_mute_local_mic', handleRemoteMute);
      window.removeEventListener('sl_meet_kicked_from_room', handleRemoteLeave);
      window.removeEventListener('sl_meet_room_ended', handleRemoteLeave);
    };
  }, [muteMic]);

  // Subscribe to Supabase Realtime room control channel & room status changes for instant multi-device room termination
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`sl-meet-room-control-${roomId}`)
      .on('broadcast', { event: 'room_ended' }, () => {
        if (handleLeaveRef.current) {
          handleLeaveRef.current();
        }
      })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload?.new?.status === 'ended' && handleLeaveRef.current) {
            handleLeaveRef.current();
          }
        }
      )
      .subscribe();

    roomControlChannelRef.current = channel;

    return () => {
      roomControlChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  // Sync latest remote gesture into ASL Sentence Aggregator
  useEffect(() => {
    if (remoteGestures && remoteGestures.length > 0) {
      const latest = remoteGestures[0];
      if (latest && latest.gesture) {
        const sender = roomUsers.find((u) => u.userId === latest.senderId);
        const senderName = latest.senderName || sender?.userMeta?.name || `Participant ${latest.senderId?.slice(0, 4)}`;
        const senderAvatarColor = latest.avatarColor || sender?.avatarColor || sender?.userMeta?.avatarColor || colorForSender(latest.senderId);
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
      const peerAvatarColor = u.avatarColor || u.userMeta?.avatarColor || colorForSender(u.userId);
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
    setIsHandTrackingEnabled((prev) => {
      const next = !prev;
      if (!next && activeSignerId === 'local') {
        setActiveSignerId(null);
      }
      return next;
    });
  };

  const handleEndRoomForEveryone = async () => {
    if (endRoom) {
      endRoom(roomId);
    }
    try {
      if (roomControlChannelRef.current) {
        roomControlChannelRef.current.send({
          type: 'broadcast',
          event: 'room_ended',
          payload: { roomId },
        });
      }
    } catch {}
    try {
      if (roomId) {
        localStorage.setItem(`sl_meet_ended_room_${roomId}`, Date.now().toString());
        localStorage.removeItem(`sl_meet_chat_${roomId}`);
      }
    } catch {}
    try {
      if (roomId) {
        supabase
          .from('rooms')
          .update({ status: 'ended' })
          .eq('id', roomId)
          .then(() => {})
          .catch((err) => console.warn('Could not update room status in Supabase:', err));
      }
    } catch (err) {
      console.warn('Could not update room status in Supabase:', err);
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
    handleLeave();
  };

  const handleRequestLeave = () => {
    const isUserHost = Boolean(isHost || (socketId && hostId && socketId === hostId));
    if (isUserHost) {
      setConfirmModalConfig({
        isOpen: true,
        title: 'Leave meeting or end for all?',
        description:
          'As the meeting host, you can leave the call or end the meeting for everyone in the room.',
        infoPill:
          'Ending the call will disconnect everyone and archive this room session.',
        actions: [
          {
            label: 'Leave the call',
            variant: 'secondary',
            onClick: () => {
              setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
              handleLeave();
            },
          },
          {
            label: 'End call for everyone',
            variant: 'danger',
            onClick: () => {
              setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
              handleEndRoomForEveryone();
            },
          },
        ],
      });
    } else {
      setConfirmModalConfig({
        isOpen: true,
        title: 'Leave the call?',
        description:
          'Are you sure you want to leave this meeting? You can rejoin anytime using the meeting code.',
        infoPill: '',
        actions: [
          {
            label: 'Leave the call',
            variant: 'danger',
            onClick: () => {
              setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
              handleLeave();
            },
          },
        ],
      });
    }
  };

  const handleRequestHandTracking = () => {
    if (userRole !== ROLES.SIGNER) return;
    if (isHandTrackingEnabled) {
      setIsHandTrackingEnabled(false);
      if (activeSignerId === 'local') {
        setActiveSignerId(null);
      }
      return;
    }
    setConfirmModalConfig({
      isOpen: true,
      title: 'Turn on AI Vision?',
      description:
        'Camera will track your hand gestures to interpret American Sign Language (ASL) in real time.',
      infoPill:
        'Video frames are processed locally on your device for complete privacy and 60 FPS responsiveness.',
      actions: [
        {
          label: 'Cancel',
          variant: 'secondary',
          onClick: () => {
            setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
          },
        },
        {
          label: 'Turn on',
          variant: 'brand',
          onClick: () => {
            setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
            setIsHandTrackingEnabled(true);
          },
        },
      ],
    });
  };

  const handleLeave = () => {
    setIsHandTrackingEnabled(false);
    if (window.electronAPI?.closeHandMotion) {
      window.electronAPI.closeHandMotion();
    }
    if (isPipMode) {
      handleExitPiP();
    }
    stopScreenShare();
    stopMedia();
    leaveRoom();
    onLeaveRoom();
  };
  handleLeaveRef.current = handleLeave;

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
        />
      ) : (
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
        />
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
        onClose={() => setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }))}
      />
    </>
  );
}



