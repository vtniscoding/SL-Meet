import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocalMedia } from '../hooks/useLocalMedia';
import { useSocket } from '../hooks/useSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import { useScreenShare } from '../hooks/useScreenShare';
import { useAslAggregator } from '../hooks/useAslAggregator';
import { downloadMeetingTranscript } from '../utils/exportTranscript';
import MeetingLayoutEngine from './room/MeetingLayoutEngine';
import MeetingControlBar from './room/MeetingControlBar';
import MeetingChatDrawer from './room/MeetingChatDrawer';
import MeetingParticipantsDrawer from './room/MeetingParticipantsDrawer';

/**
 * Top-Level Room Layout Container Component
 */
export default function RoomView({ roomId, onLeaveRoom, mediaState: externalMediaState }) {
  // Real-Time ASL Sentence Aggregator Hook (Buffers raw gestures into fluent sentences with auto-clearing)
  const { currentSentence, transcriptLogs, pushGesture } = useAslAggregator(1500, 3, 400);

  // Modular Local Media Stream & VAD Hook
  const internalMediaState = useLocalMedia();
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
  } = externalMediaState || internalMediaState;

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
    toggleConnection,
    joinRoom,
    leaveRoom,
    sendGesture,
    sendPresentingStatus,
    sendMediaStatusChange,
    sendChatMessage,
    sendMutePeer,
    sendKickPeer,
  } = useSocket();

  // WebRTC Real-Time P2P Video/Audio Streaming Hook
  const { peerStreams, peerScreenStreams } = useWebRTC(roomId, localStream, screenStream, presentingUsers);

  // Auto connect & join room socket channel
  useEffect(() => {
    if (!isConnected) {
      toggleConnection();
    }
    joinRoom(roomId);
    return () => {
      leaveRoom();
    };
  }, [roomId]);

  // Broadcast local camera & mic status changes to all room peers
  useEffect(() => {
    if (sendMediaStatusChange && isConnected) {
      sendMediaStatusChange(isMuted, isCameraOff);
    }
  }, [isMuted, isCameraOff, isConnected, sendMediaStatusChange]);

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
      }
    }
  }, [remoteGestures, roomUsers, pushGesture]);


  const prevLocalPresentingRef = useRef(false);
  const prevRemotePresenterRef = useRef(null);

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

  // Meeting Room Layout Modes: 'tiled' (Auto Grid) | 'sidebar' (Thanh bên) | 'spotlight' (Tiêu điểm)
  const [layoutMode, setLayoutMode] = useState('tiled');
  const [pinnedId, setPinnedId] = useState(null);
  const [isAiEnabled, setIsAiEnabled] = useState(false);
  const [isHandTrackingEnabled, setIsHandTrackingEnabled] = useState(false);
  const [subtitleText, setSubtitleText] = useState('AI Subtitle Standby');

  // In-Call Real-Time Chat & People Drawers state (Mutually Exclusive)
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isPeopleOpen, setIsPeopleOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastMessageCountRef = useRef(0);

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
  const localCameraParticipant = {
    id: 'local',
    name: 'You',
    isLocal: true,
    isScreenSharing: false,
    isCameraOff,
    isMuted,
    isSpeaking,
    isActiveSpeaker: true,
    stream: localStream,
  };

  const localPresentationParticipant = isScreenSharing
    ? {
        id: 'local-screen',
        name: 'You (Presentation)',
        isLocal: true,
        isScreenSharing: true,
        isCameraOff: false,
        isMuted: true,
        isSpeaking: false,
        isActiveSpeaker: true,
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

      // 1. Peer Camera Tile
      remoteParticipants.push({
        id: u.userId,
        name: baseName,
        isLocal: false,
        isScreenSharing: false,
        isCameraOff: isPeerCameraOff,
        isMuted: isPeerMuted,
        isSpeaking: false,
        isActiveSpeaker: false,
        hasStream: !!peerStream,
        stream: peerStream || null,
      });

      // 2. Peer Screen Presentation Tile (if presenting)
      if (isPeerPresenting && peerScreenStream) {
        remoteParticipants.push({
          id: `${u.userId}-screen`,
          name: `${baseName} (Presentation)`,
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
    setPinnedId((prev) => (prev === id ? null : id));
  };

  const handleResetPin = () => {
    setPinnedId(null);
  };

  const handleToggleAi = () => {
    setIsAiEnabled((prev) => !prev);
  };

  const handleToggleHandTracking = () => {
    setIsHandTrackingEnabled((prev) => !prev);
  };

  const handleLeave = () => {
    stopScreenShare();
    stopMedia();
    leaveRoom();
    onLeaveRoom();
  };

  const handleGestureDetected = useCallback(
    (gesture) => {
      if (gesture) {
        pushGesture('You', gesture);
        sendGesture({ gesture, confidence: 0.95 });
      }
    },
    [sendGesture, pushGesture]
  );

  const handleExportTranscript = useCallback(() => {
    downloadMeetingTranscript(transcriptLogs, roomId);
  }, [transcriptLogs, roomId]);

  return (
    <div className="w-screen h-screen max-h-screen bg-[#121212] text-white flex flex-col justify-between p-6 font-sans select-none overflow-hidden">
      {/* Top Header Room Info */}
      <header className="w-full text-xs md:text-sm font-semibold text-slate-400 flex items-center justify-between z-10 shrink-0 select-none">
        <div className="flex items-center space-x-2">
          <span>Room ID:</span>
          <span className="font-mono font-bold text-white bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/60 shadow-sm tracking-wide">
            {roomId}
          </span>
        </div>
      </header>

      {/* Main Workspace: Meeting Layout Engine + Slide-over Chat & People Drawers */}
      <main className="flex-1 w-full flex items-center justify-between gap-4 overflow-hidden my-3 relative min-h-0">
        <div className="flex-1 h-full min-w-0">
          <MeetingLayoutEngine
            participants={updatedParticipants}
            videoRef={videoRef}
            localStream={activeLocalStream}
            layoutMode={layoutMode}
            pinnedId={pinnedId}
            onTogglePin={handleTogglePin}
            isAiEnabled={isAiEnabled}
            isHandTrackingEnabled={isHandTrackingEnabled}
            subtitleText={currentSentence}
            onGestureDetected={handleGestureDetected}
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
        isHandTrackingEnabled={isHandTrackingEnabled}
        isChatOpen={isChatOpen}
        isPeopleOpen={isPeopleOpen}
        unreadCount={unreadCount}
        participantCount={updatedParticipants.length}
        layoutMode={layoutMode}
        pinnedId={pinnedId}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
        onToggleScreenShare={toggleScreenShare}
        onToggleAi={handleToggleAi}
        onToggleHandTracking={handleToggleHandTracking}
        onToggleChat={handleToggleChat}
        onTogglePeople={handleTogglePeople}
        onChangeLayout={(mode) => setLayoutMode(mode)}
        onExportTranscript={handleExportTranscript}
        onResetPin={handleResetPin}
        onLeaveRoom={handleLeave}
      />
    </div>
  );
}



