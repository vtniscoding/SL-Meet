import { useEffect, useState, useCallback } from 'react';
import { getSocket, connectSocket, disconnectSocket, SOCKET_URL } from '../services/socket';

export function useSocket(initialServerUrl = SOCKET_URL) {
  const [serverUrl, setServerUrl] = useState(initialServerUrl);
  const [isConnected, setIsConnected] = useState(false);
  const [socketId, setSocketId] = useState(null);
  const [currentRoom, setCurrentRoom] = useState('');
  const [logs, setLogs] = useState([]);
  const [remoteGestures, setRemoteGestures] = useState([]);
  const [roomUsers, setRoomUsers] = useState([]);

  const [presentingUsers, setPresentingUsers] = useState({});
  const [chatMessages, setChatMessages] = useState([]);
  const [hostId, setHostId] = useState(null);
  const [peerMediaStatus, setPeerMediaStatus] = useState({});

  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [{ id: Math.random().toString(36).substr(2, 9), timestamp, message, type }, ...prev.slice(0, 49)]);
  }, []);

  useEffect(() => {
    const socket = getSocket(serverUrl);

    const onConnect = () => {
      setIsConnected(true);
      setSocketId(socket.id);
      addLog(`Connected to Render socket service (${socket.id})`, 'success');
    };

    const onDisconnect = (reason) => {
      setIsConnected(false);
      setSocketId(null);
      setRoomUsers([]);
      setPresentingUsers({});
      setChatMessages([]);
      setPeerMediaStatus({});
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

    const onRoomUsers = (data) => {
      addLog(`Room members loaded: ${data.participants ? data.participants.length : 0}`, 'info');
      setRoomUsers(data.participants || []);
      if (data.hostId) {
        setHostId(data.hostId);
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
          },
        }));
      }
      const userName = data.userMeta?.name || `Participant ${data.userId.slice(0, 4)}`;
      setRoomUsers((prev) => {
        if (prev.some((u) => u.userId === data.userId)) return prev;
        return [...prev, { userId: data.userId, userMeta: data.userMeta }];
      });
      setChatMessages((prev) => [
        ...prev,
        {
          id: `sys-join-${data.userId}-${Date.now()}`,
          senderId: 'system',
          senderName: 'System',
          text: `${userName} joined the room`,
          timestamp: Date.now(),
          type: 'system',
        },
      ]);
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
      setChatMessages((prev) => [
        ...prev,
        {
          id: `sys-left-${data.userId}-${Date.now()}`,
          senderId: 'system',
          senderName: 'System',
          text: `Participant ${shortId} left the room`,
          timestamp: Date.now(),
          type: 'system',
        },
      ]);
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
        },
      }));
    };

    const onChatMessage = (messageData) => {
      setChatMessages((prev) => [...prev, messageData]);
    };

    const onMutePeerRequest = (data) => {
      addLog(`Mute request received from host (${data.senderId.slice(0, 5)})`, 'warning');
      window.dispatchEvent(new CustomEvent('sl_meet_mute_local_mic'));
    };

    const onKickPeerRequest = (data) => {
      addLog(`Kick request received from host (${data.senderId.slice(0, 5)})`, 'error');
      window.dispatchEvent(new CustomEvent('sl_meet_kicked_from_room'));
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('gesture_stream', onGestureStream);
    socket.on('room_users', onRoomUsers);
    socket.on('user_joined', onUserJoined);
    socket.on('user_left', onUserLeft);
    socket.on('peer_presenting', onPeerPresenting);
    socket.on('peer_media_status', onPeerMediaStatus);
    socket.on('chat_message', onChatMessage);
    socket.on('mute_peer_request', onMutePeerRequest);
    socket.on('kick_peer_request', onKickPeerRequest);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('gesture_stream', onGestureStream);
      socket.off('room_users', onRoomUsers);
      socket.off('user_joined', onUserJoined);
      socket.off('user_left', onUserLeft);
      socket.off('peer_presenting', onPeerPresenting);
      socket.off('peer_media_status', onPeerMediaStatus);
      socket.off('chat_message', onChatMessage);
      socket.off('mute_peer_request', onMutePeerRequest);
      socket.off('kick_peer_request', onKickPeerRequest);
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
    const socket = getSocket(serverUrl);
    if (!socket.connected) {
      connectSocket(serverUrl);
    }
    socket.emit('join_room', { roomId, userMeta });
    setCurrentRoom(roomId);
    addLog(`Joined room: ${roomId}`, 'success');
  };

  const leaveRoom = () => {
    const socket = getSocket(serverUrl);
    if (socket.connected && currentRoom) {
      socket.emit('leave_room', { roomId: currentRoom });
      addLog(`Left room: ${currentRoom}`, 'warning');
      setCurrentRoom('');
      setRoomUsers([]);
      setPresentingUsers({});
      setPeerMediaStatus({});
      setChatMessages([]);
      setHostId(null);
    }
  };

  const sendGesture = (gestureData) => {
    const socket = getSocket(serverUrl);
    if (socket.connected && currentRoom) {
      socket.emit('send_gesture', {
        roomId: currentRoom,
        gesture: gestureData.gesture,
        confidence: gestureData.confidence,
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

  const sendMediaStatusChange = (isMuted, isCameraOff) => {
    const socket = getSocket(serverUrl);
    if (socket.connected && currentRoom) {
      socket.emit('media_status_change', {
        roomId: currentRoom,
        isMuted: !!isMuted,
        isCameraOff: !!isCameraOff,
      });
    }
  };

  const sendChatMessage = (text, senderName = 'You') => {
    const socket = getSocket(serverUrl);
    if (socket.connected && currentRoom && text && text.trim().length > 0) {
      socket.emit('send_chat_message', {
        roomId: currentRoom,
        text: text.trim(),
        senderName,
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
    toggleConnection,
    joinRoom,
    leaveRoom,
    sendGesture,
    sendPresentingStatus,
    sendMediaStatusChange,
    sendChatMessage,
    sendMutePeer,
    sendKickPeer,
  };
}




