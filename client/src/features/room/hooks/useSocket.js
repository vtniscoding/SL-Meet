import { useEffect, useState, useCallback, useRef } from 'react';
import {
  getSocket,
  connectSocket,
  disconnectSocket,
  SOCKET_URL,
  fetchDatasetFromServer,
} from '@sl-meet/shared';

export function useSocket(initialServerUrl = SOCKET_URL) {
  const [serverUrl, setServerUrl] = useState(initialServerUrl);
  const [isConnected, setIsConnected] = useState(() => {
    try {
      return getSocket(initialServerUrl).connected;
    } catch {
      return false;
    }
  });
  const [socketId, setSocketId] = useState(() => {
    try {
      return getSocket(initialServerUrl).id || null;
    } catch {
      return null;
    }
  });
  const [currentRoom, setCurrentRoom] = useState('');
  const [logs, setLogs] = useState([]);
  const [remoteGestures, setRemoteGestures] = useState([]);
  const [roomUsers, setRoomUsers] = useState([]);

  const [presentingUsers, setPresentingUsers] = useState({});
  const [chatMessages, setChatMessages] = useState([]);
  const [hostId, setHostId] = useState(null);
  const [peerMediaStatus, setPeerMediaStatus] = useState({});
  const [speechCaptions, setSpeechCaptions] = useState({});

  const currentRoomRef = useRef('');
  const currentUserMetaRef = useRef(null);
  const roomUsersRef = useRef([]);

  useEffect(() => {
    roomUsersRef.current = roomUsers;
  }, [roomUsers]);

  const cacheChatMessages = useCallback((roomId, messages) => {
    if (!roomId || !Array.isArray(messages)) return;
    try {
      localStorage.setItem(`sl_meet_chat_${roomId}`, JSON.stringify(messages.slice(-150)));
    } catch {}
  }, []);

  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [{ id: Math.random().toString(36).substr(2, 9), timestamp, message, type }, ...prev.slice(0, 49)]);
  }, []);

  useEffect(() => {
    const socket = getSocket(serverUrl);

    // Sync immediate connection state if socket is already connected
    if (socket.connected) {
      setIsConnected(true);
      setSocketId(socket.id);
    }

    const onConnect = () => {
      setIsConnected(true);
      setSocketId(socket.id);
      addLog(`Connected to socket service (${socket.id})`, 'success');

      // Auto-rejoin active room if connection was dropped and restored
      if (currentRoomRef.current && currentUserMetaRef.current) {
        socket.emit('join_room', {
          roomId: currentRoomRef.current,
          userMeta: currentUserMetaRef.current,
        });
        addLog(`Reconnected & restored room session: ${currentRoomRef.current}`, 'info');
      }
    };

    const onDisconnect = (reason) => {
      setIsConnected(false);
      setSocketId(null);
      // DO NOT clear chatMessages on disconnect! Chat messages belong to the room session.
      setRoomUsers([]);
      setPresentingUsers({});
      setPeerMediaStatus({});
      setSpeechCaptions({});
      setHostId(null);
      addLog(`Disconnected from socket service: ${reason}`, 'warning');
    };

    const onConnectError = (error) => {
      setIsConnected(false);
      addLog(`Socket connection error: ${error.message}`, 'error');
    };

    const onGestureStream = (data) => {
      addLog(`Received gesture from ${data.senderId.slice(0, 5)}: ${data.gesture}`, 'gesture');
      setRemoteGestures((prev) => [{ ...data, id: Date.now() }, ...prev.slice(0, 19)]);
    };

    const onSpeechCaptionStream = (data) => {
      if (data && data.senderId && data.senderId !== socket.id) {
        setSpeechCaptions((prev) => ({
          ...prev,
          [data.senderId]: {
            senderId: data.senderId,
            text: data.text,
            isFinal: !!data.isFinal,
            senderName: data.senderName,
            avatarColor: data.avatarColor,
            avatarUrl: data.avatarUrl,
            timestamp: data.timestamp || Date.now(),
          },
        }));
      }
    };

    const onPeerRoleChanged = (data) => {
      if (data && data.userId) {
        addLog(`Participant ${data.userId.slice(0, 5)} changed role to ${data.role}`, 'info');
        setRoomUsers((prev) =>
          prev.map((u) => {
            if (u.userId === data.userId) {
              return {
                ...u,
                role: data.role,
                userMeta: { ...(u.userMeta || {}), role: data.role },
              };
            }
            return u;
          })
        );
      }
    };

    const onRoomUsers = (data) => {
      addLog(`Room members loaded: ${data.participants ? data.participants.length : 0}`, 'info');
      setRoomUsers(data.participants || []);
      if (data.hostId) {
        setHostId(data.hostId);
      }
      if (data.messages && Array.isArray(data.messages)) {
        setChatMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newMsgs = data.messages.filter(
            (m) => m && m.text !== '__SL_MEET_ROOM_ENDED_SIGNAL__' && !existingIds.has(m.id)
          );
          if (newMsgs.length === 0) return prev;
          const merged = [...prev, ...newMsgs];
          merged.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
          cacheChatMessages(currentRoomRef.current, merged);
          return merged;
        });
      }
      
      const presentingMap = {};
      const mediaMap = {};
      (data.participants || []).forEach(p => {
        if (p && p.userId) {
          if (p.isPresenting) {
            presentingMap[p.userId] = {
              isPresenting: true,
              screenStreamId: p.screenStreamId,
            };
          }
          mediaMap[p.userId] = {
            isMuted: !!p.isMuted,
            isCameraOff: !!p.isCameraOff,
            isAiVisionActive: !!p.isAiVisionActive,
          };
        }
      });
      setPresentingUsers(prev => ({ ...prev, ...presentingMap }));
      setPeerMediaStatus(prev => ({ ...prev, ...mediaMap }));
    };

    const onUserJoined = (data) => {
      addLog(`User ${data.userId.slice(0, 5)} joined room ${data.roomId}`, 'info');
      if (data.hostId) {
        setHostId(data.hostId);
      }
      if (data.userId && data.userMeta) {
        setPeerMediaStatus(prev => ({
          ...prev,
          [data.userId]: {
            isMuted: !!data.userMeta.isMuted,
            isCameraOff: !!data.userMeta.isCameraOff,
            isAiVisionActive: !!data.userMeta.isAiVisionActive,
          },
        }));
      }
      const userName = data.userMeta?.name || `Participant ${data.userId.slice(0, 4)}`;
      setRoomUsers((prev) => {
        if (prev.some((u) => u.userId === data.userId)) return prev;
        return [
          ...prev,
          {
            userId: data.userId,
            role: data.role || data.userMeta?.role || 'non_signer',
            avatarColor: data.userMeta?.avatarColor || data.avatarColor || null,
            avatarUrl: data.userMeta?.avatarUrl || data.avatarUrl || null,
            userMeta: data.userMeta,
          },
        ];
      });
      setChatMessages((prev) => {
        const next = [
          ...prev,
          {
            id: `sys-join-${data.userId}-${Date.now()}`,
            senderId: 'system',
            senderName: 'System',
            text: `${userName} joined the room`,
            timestamp: Date.now(),
            type: 'system',
          },
        ];
        cacheChatMessages(currentRoomRef.current, next);
        return next;
      });
    };

    const onUserLeft = (data) => {
      addLog(`User ${data.userId.slice(0, 5)} left room`, 'warning');
      if (data.hostId) {
        setHostId(data.hostId);
      }
      const shortId = data.userId ? data.userId.slice(0, 4) : 'User';
      setRoomUsers((prev) => prev.filter((u) => u.userId !== data.userId));
      setPresentingUsers((prev) => {
        const next = { ...prev };
        delete next[data.userId];
        return next;
      });
      setPeerMediaStatus((prev) => {
        const next = { ...prev };
        delete next[data.userId];
        return next;
      });
      setSpeechCaptions((prev) => {
        const next = { ...prev };
        delete next[data.userId];
        return next;
      });
      setChatMessages((prev) => {
        const next = [
          ...prev,
          {
            id: `sys-left-${data.userId}-${Date.now()}`,
            senderId: 'system',
            senderName: 'System',
            text: `Participant ${shortId} left the room`,
            timestamp: Date.now(),
            type: 'system',
          },
        ];
        cacheChatMessages(currentRoomRef.current, next);
        return next;
      });
    };

    const onPeerPresenting = (data) => {
      addLog(`Peer ${data.senderId.slice(0, 5)} presenting: ${data.isPresenting}`, 'info');
      setPresentingUsers((prev) => ({
        ...prev,
        [data.senderId]: {
          isPresenting: data.isPresenting,
          screenStreamId: data.screenStreamId,
        },
      }));
    };

    const onPeerMediaStatus = (data) => {
      setPeerMediaStatus((prev) => ({
        ...prev,
        [data.senderId]: {
          isMuted: !!data.isMuted,
          isCameraOff: !!data.isCameraOff,
          isAiVisionActive: !!data.isAiVisionActive,
          isSpeaking: !!data.isSpeaking,
        },
      }));
    };

    const onChatMessage = (messageData) => {
      if (!messageData || !messageData.text) return;
      if (messageData.text === '__SL_MEET_ROOM_ENDED_SIGNAL__') {
        addLog('Meeting ended by host for everyone', 'error');
        window.dispatchEvent(new CustomEvent('sl_meet_room_ended', { detail: messageData }));
        window.dispatchEvent(new CustomEvent('sl_meet_kicked_from_room'));
        return;
      }
      setChatMessages((prev) => {
        // 1. Exact ID match deduplication
        if (prev.some((m) => m.id === messageData.id)) return prev;

        // 2. Authoritative echo match: If server echoes back our own message with a generated/different ID
        const matchIdx = prev.findIndex(
          (m) =>
            (m.senderId === 'local' || m.senderId === socket.id || m.senderName === 'You') &&
            m.text === messageData.text &&
            Math.abs((m.timestamp || 0) - (messageData.timestamp || Date.now())) < 15000
        );

        if (matchIdx !== -1) {
          // Replace local optimistic message with the authoritative server message
          const updated = [...prev];
          updated[matchIdx] = {
            ...messageData,
            senderId: messageData.senderId || prev[matchIdx].senderId,
          };
          cacheChatMessages(currentRoomRef.current, updated);
          return updated;
        }

        const next = [...prev, messageData];
        cacheChatMessages(currentRoomRef.current, next);
        return next;
      });
    };

    const onMutePeerRequest = (data) => {
      addLog(`Mute request received from host (${data.senderId.slice(0, 5)})`, 'warning');
      window.dispatchEvent(new CustomEvent('sl_meet_mute_local_mic'));
    };

    const onKickPeerRequest = (data) => {
      addLog(`Kick request received from host (${data.senderId.slice(0, 5)})`, 'error');
      window.dispatchEvent(new CustomEvent('sl_meet_kicked_from_room'));
    };

    const onRoomEnded = (data) => {
      addLog(`Meeting ended by host for everyone`, 'error');
      window.dispatchEvent(new CustomEvent('sl_meet_room_ended', { detail: data }));
      window.dispatchEvent(new CustomEvent('sl_meet_kicked_from_room'));
    };

    const onDatasetUpdated = (data) => {
      addLog(`Dataset updated on server (${data.count} gestures). Syncing live model...`, 'info');
      fetchDatasetFromServer(serverUrl);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('gesture_stream', onGestureStream);
    socket.on('speech_caption_stream', onSpeechCaptionStream);
    socket.on('peer_role_changed', onPeerRoleChanged);
    socket.on('room_users', onRoomUsers);
    socket.on('user_joined', onUserJoined);
    socket.on('user_left', onUserLeft);
    socket.on('peer_presenting', onPeerPresenting);
    socket.on('peer_media_status', onPeerMediaStatus);
    socket.on('chat_message', onChatMessage);
    socket.on('mute_peer_request', onMutePeerRequest);
    socket.on('kick_peer_request', onKickPeerRequest);
    socket.on('room_ended', onRoomEnded);
    socket.on('dataset_updated', onDatasetUpdated);

    const onStorageChange = (e) => {
      const activeRoom = currentRoomRef.current;
      if (activeRoom && e.key === `sl_meet_ended_room_${activeRoom}`) {
        window.dispatchEvent(new CustomEvent('sl_meet_room_ended'));
        window.dispatchEvent(new CustomEvent('sl_meet_kicked_from_room'));
        return;
      }
      if (activeRoom && e.key === `sl_meet_chat_${activeRoom}` && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setChatMessages((prev) => {
              const existingIds = new Set(prev.map((m) => m.id));
              const newMsgs = parsed.filter((m) => !existingIds.has(m.id));
              if (newMsgs.length === 0) return prev;
              const merged = [...prev, ...newMsgs];
              merged.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
              return merged;
            });
          }
        } catch {}
      }
    };
    window.addEventListener('storage', onStorageChange);

    return () => {
      window.removeEventListener('storage', onStorageChange);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('gesture_stream', onGestureStream);
      socket.off('speech_caption_stream', onSpeechCaptionStream);
      socket.off('peer_role_changed', onPeerRoleChanged);
      socket.off('room_users', onRoomUsers);
      socket.off('user_joined', onUserJoined);
      socket.off('user_left', onUserLeft);
      socket.off('peer_presenting', onPeerPresenting);
      socket.off('peer_media_status', onPeerMediaStatus);
      socket.off('chat_message', onChatMessage);
      socket.off('mute_peer_request', onMutePeerRequest);
      socket.off('kick_peer_request', onKickPeerRequest);
      socket.off('room_ended', onRoomEnded);
      socket.off('dataset_updated', onDatasetUpdated);
    };
  }, [serverUrl, addLog]);

  const toggleConnection = () => {
    const socket = getSocket(serverUrl);
    if (socket.connected) {
      disconnectSocket();
    } else {
      addLog(`Connecting to ${serverUrl}...`, 'info');
      connectSocket(serverUrl);
    }
  };

  const joinRoom = (roomId, userMeta) => {
    currentRoomRef.current = roomId;
    currentUserMetaRef.current = userMeta;
    setCurrentRoom(roomId);

    // Restore cached room messages if available in local storage
    try {
      const cached = localStorage.getItem(`sl_meet_chat_${roomId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setChatMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.id));
            const newMsgs = parsed.filter((m) => !existingIds.has(m.id));
            if (newMsgs.length === 0 && prev.length > 0) return prev;
            const merged = [...prev, ...newMsgs];
            merged.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            return merged;
          });
        }
      }
    } catch {}

    const socket = getSocket(serverUrl);
    if (!socket.connected) {
      connectSocket(serverUrl);
    }
    socket.emit('join_room', { roomId, userMeta });
    addLog(`Joined room: ${roomId}`, 'success');
  };

  const leaveRoom = () => {
    const socket = getSocket(serverUrl);
    const roomToLeave = currentRoomRef.current || currentRoom;
    if (socket.connected && roomToLeave) {
      socket.emit('leave_room', { roomId: roomToLeave });
      addLog(`Left room: ${roomToLeave}`, 'warning');
    }
    currentRoomRef.current = '';
    currentUserMetaRef.current = null;
    setCurrentRoom('');
    setRoomUsers([]);
    setPresentingUsers({});
    setPeerMediaStatus({});
    setChatMessages([]);
    setHostId(null);
  };

  const endRoom = (roomIdOverride) => {
    const socket = getSocket(serverUrl);
    const roomToEnd = roomIdOverride || currentRoomRef.current || currentRoom;
    if (socket.connected && roomToEnd) {
      // 1. Kick every connected participant via existing server `kick_peer` handler
      const activeUsers = roomUsersRef.current?.length ? roomUsersRef.current : roomUsers;
      (activeUsers || []).forEach((u) => {
        if (u && u.userId && u.userId !== socket.id) {
          socket.emit('kick_peer', { roomId: roomToEnd, targetId: u.userId });
        }
      });

      // 2. Broadcast room-ended control signal via room chat channel (guaranteed room-wide delivery on deployed Render server)
      socket.emit('send_chat_message', {
        roomId: roomToEnd,
        text: '__SL_MEET_ROOM_ENDED_SIGNAL__',
        senderName: 'System',
      });

      // 3. Emit dedicated `end_room` event for updated server versions
      socket.emit('end_room', { roomId: roomToEnd });
      addLog(`Ended room for everyone: ${roomToEnd}`, 'warning');
    }
    try {
      if (roomToEnd) {
        localStorage.setItem(`sl_meet_ended_room_${roomToEnd}`, Date.now().toString());
        localStorage.removeItem(`sl_meet_chat_${roomToEnd}`);
      }
    } catch {}
  };

  const sendGesture = (gestureData) => {
    const socket = getSocket(serverUrl);
    if (socket.connected && currentRoom) {
      socket.emit('send_gesture', {
        roomId: currentRoom,
        gesture: gestureData.gesture,
        confidence: gestureData.confidence,
        mode: gestureData.mode,
        timestamp: Date.now(),
      });
    }
  };

  const sendPresentingStatus = (isPresenting, screenStreamId) => {
    const socket = getSocket(serverUrl);
    if (socket.connected && currentRoom) {
      socket.emit('presenting_status', {
        roomId: currentRoom,
        isPresenting,
        screenStreamId,
      });
    }
  };

  const sendMediaStatusChange = (isMuted, isCameraOff, isAiVisionActive, isSpeaking = false) => {
    const socket = getSocket(serverUrl);
    if (socket.connected && currentRoom) {
      socket.emit('media_status_change', {
        roomId: currentRoom,
        isMuted: !!isMuted,
        isCameraOff: !!isCameraOff,
        isAiVisionActive: !!isAiVisionActive,
        isSpeaking: !!isSpeaking,
      });
    }
  };

  const sendChatMessage = (text, senderName = 'You') => {
    if (!text || text.trim().length === 0) return;
    const trimmedText = text.trim();
    const socket = getSocket(serverUrl);
    const targetRoom = currentRoomRef.current || currentRoom;
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const effectiveSenderName = senderName || currentUserMetaRef.current?.name || 'You';

    // 1. Optimistic Local Update
    const localMsg = {
      id: messageId,
      senderId: socket?.id || 'local',
      senderName: effectiveSenderName,
      text: trimmedText,
      timestamp: Date.now(),
      type: 'user',
    };

    setChatMessages((prev) => {
      // Prevent rapid-fire duplicate optimistic messages with identical text within 1s
      const isDuplicate = prev.some(
        (m) =>
          m.id === messageId ||
          ((m.senderId === 'local' || m.senderId === socket?.id || m.senderName === effectiveSenderName) &&
            m.text === trimmedText &&
            Date.now() - (m.timestamp || 0) < 1000)
      );
      if (isDuplicate) return prev;
      const next = [...prev, localMsg];
      if (targetRoom) cacheChatMessages(targetRoom, next);
      return next;
    });

    // 2. Ensure connection & transmit via socket
    if (!socket.connected) {
      connectSocket(serverUrl);
    }
    if (targetRoom) {
      socket.emit('send_chat_message', {
        id: messageId,
        roomId: targetRoom,
        text: trimmedText,
        senderName: effectiveSenderName,
      });
    }
  };

  const sendMutePeer = (targetId) => {
    const socket = getSocket(serverUrl);
    if (socket.connected && currentRoom && targetId) {
      socket.emit('mute_peer', { roomId: currentRoom, targetId });
      addLog(`Sent remote mute request to ${targetId.slice(0, 5)}`, 'info');
    }
  };

  const sendKickPeer = (targetId) => {
    const socket = getSocket(serverUrl);
    if (socket.connected && currentRoom && targetId) {
      socket.emit('kick_peer', { roomId: currentRoom, targetId });
      addLog(`Sent kick request to ${targetId.slice(0, 5)}`, 'warning');
    }
  };

  const changeRole = (role) => {
    const socket = getSocket(serverUrl);
    if (socket.connected && currentRoom && role) {
      socket.emit('change_role', { roomId: currentRoom, role });
      addLog(`Requested role change to ${role}`, 'info');
    }
  };

  const sendSpeechCaption = (text, isFinal = false, extraMeta = {}) => {
    const socket = getSocket(serverUrl);
    if (socket.connected && currentRoom && text && text.trim().length > 0) {
      socket.emit('speech_caption', {
        roomId: currentRoom,
        text: text.trim(),
        isFinal: !!isFinal,
        senderId: extraMeta?.senderId,
        senderName: extraMeta?.senderName,
        avatarColor: extraMeta?.avatarColor,
        avatarUrl: extraMeta?.avatarUrl,
      });
    }
  };

  const isHost = !!(socketId && hostId && socketId === hostId);

  return {
    serverUrl,
    setServerUrl,
    isConnected,
    socketId,
    currentRoom,
    hostId,
    isHost,
    logs,
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
  };
}




