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
      
      const presentingMap = {};
      (data.participants || []).forEach(p => {
        if (p.isPresenting) {
          presentingMap[p.userId] = {
            isPresenting: true,
            screenStreamId: p.screenStreamId,
          };
        }
      });
      setPresentingUsers(prev => ({ ...prev, ...presentingMap }));
    };

    const onUserJoined = (data) => {
      addLog(`User ${data.userId.slice(0, 5)} joined room ${data.roomId}`, 'info');
      setRoomUsers((prev) => {
        if (prev.some((u) => u.userId === data.userId)) return prev;
        return [...prev, { userId: data.userId, userMeta: data.userMeta }];
      });
    };

    const onUserLeft = (data) => {
      addLog(`User ${data.userId.slice(0, 5)} left room`, 'warning');
      setRoomUsers((prev) => prev.filter((u) => u.userId !== data.userId));
      setPresentingUsers((prev) => {
        const next = { ...prev };
        delete next[data.userId];
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

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('gesture_stream', onGestureStream);
    socket.on('room_users', onRoomUsers);
    socket.on('user_joined', onUserJoined);
    socket.on('user_left', onUserLeft);
    socket.on('peer_presenting', onPeerPresenting);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('gesture_stream', onGestureStream);
      socket.off('room_users', onRoomUsers);
      socket.off('user_joined', onUserJoined);
      socket.off('user_left', onUserLeft);
      socket.off('peer_presenting', onPeerPresenting);
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

  return {
    serverUrl,
    setServerUrl,
    isConnected,
    socketId,
    currentRoom,
    logs,
    remoteGestures,
    roomUsers,
    presentingUsers,
    toggleConnection,
    joinRoom,
    leaveRoom,
    sendGesture,
    sendPresentingStatus,
  };
}
