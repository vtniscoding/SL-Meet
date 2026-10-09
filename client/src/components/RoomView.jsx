import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocalMedia } from '../hooks/useLocalMedia';
import { useSocket } from '../hooks/useSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import { useScreenShare } from '../hooks/useScreenShare';
import MeetingLayoutEngine from './room/MeetingLayoutEngine';
import MeetingControlBar from './room/MeetingControlBar';

/**
 * Top-Level Room Layout Container Component
 */
export default function RoomView({ roomId, onLeaveRoom, mediaState: externalMediaState }) {
  // Modular Local Media Stream & VAD Hook
  const internalMediaState = useLocalMedia();
  const {
    videoRef,
    localStream,
    isMuted,
    isCameraOff,
    isSpeaking,
    toggleMic,
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
    remoteGestures,
    roomUsers,
    presentingUsers,
    toggleConnection,
    joinRoom,
    leaveRoom,
    sendGesture,
    sendPresentingStatus,
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

  // Sync latest remote gesture into subtitle overlay
  useEffect(() => {
    if (remoteGestures && remoteGestures.length > 0) {
      const latest = remoteGestures[0];
      if (latest && latest.gesture) {
        setSubtitleText(`${latest.gesture}`);
      }
    }
  }, [remoteGestures]);

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

      // 1. Peer Camera Tile
      remoteParticipants.push({
        id: u.userId,
        name: baseName,
        isLocal: false,
        isScreenSharing: false,
        isCameraOff: false,
        isMuted: false,
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
        setSubtitleText(gesture);
        sendGesture({ gesture, confidence: 0.95 });
      }
    },
    [sendGesture]
  );

  return (
    <div className="w-screen h-screen max-h-screen bg-[#121212] text-white flex flex-col justify-between p-6 font-sans select-none overflow-hidden">
      {/* Top Header Room Info */}
      <header className="w-full text-sm font-medium text-slate-300 flex items-center justify-between z-10">
        <div>
          Room ID: <span className="font-mono font-bold text-white">{roomId}</span>
        </div>
        <div className="text-xs text-slate-400 font-mono flex items-center space-x-3">
          <span>Participants: {updatedParticipants.length}</span>
          <span className="uppercase bg-slate-800 px-2 py-0.5 rounded text-[10px] text-slate-300">
            Layout: {layoutMode}
          </span>
        </div>
      </header>

      {/* Google Meet Layout Engine (tiled, sidebar, spotlight) */}
      <MeetingLayoutEngine
        participants={updatedParticipants}
        videoRef={videoRef}
        localStream={activeLocalStream}
        layoutMode={layoutMode}
        pinnedId={pinnedId}
        onTogglePin={handleTogglePin}
        isAiEnabled={isAiEnabled}
        isHandTrackingEnabled={isHandTrackingEnabled}
        subtitleText={subtitleText}
        onGestureDetected={handleGestureDetected}
      />

      {/* Bottom Meeting Controls Bar */}
      <MeetingControlBar
        isMuted={isMuted}
        isCameraOff={isCameraOff}
        isScreenSharing={isScreenSharing}
        isAiEnabled={isAiEnabled}
        isHandTrackingEnabled={isHandTrackingEnabled}
        layoutMode={layoutMode}
        pinnedId={pinnedId}
        onToggleMic={toggleMic}
        onToggleCamera={toggleCamera}
        onToggleScreenShare={toggleScreenShare}
        onToggleAi={handleToggleAi}
        onToggleHandTracking={handleToggleHandTracking}
        onChangeLayout={(mode) => setLayoutMode(mode)}
        onResetPin={handleResetPin}
        onLeaveRoom={handleLeave}
      />
    </div>
  );
}

