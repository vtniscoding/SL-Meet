import { io } from 'socket.io-client';

// Default Render URL or local development server
const RENDER_SOCKET_DEFAULT = 'https://sl-meet-socket.onrender.com';
const LOCAL_SOCKET_DEFAULT = 'http://localhost:4000';

export const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? LOCAL_SOCKET_DEFAULT
    : RENDER_SOCKET_DEFAULT);

let socket = null;

export const getSocket = (url = SOCKET_URL) => {
  if (!socket || socket.io.uri !== url) {
    if (socket) socket.disconnect();
    socket = io(url, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }
  return socket;
};

export const connectSocket = (url = SOCKET_URL) => {
  const instance = getSocket(url);
  if (!instance.connected) {
    instance.connect();
  }
  return instance;
};

export const disconnectSocket = () => {
  if (socket && socket.connected) {
    socket.disconnect();
  }
};
