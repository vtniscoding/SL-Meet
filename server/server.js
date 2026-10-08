import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 4000;
const CLIENT_URL = process.env.CLIENT_URL || '*';

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// Render Health Check Endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'SL-Meet Render Socket & Signaling Service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});

// Store active room tracking: Map<roomId, Map<socketId, userMeta>>
const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`[Socket Connected] Client ID: ${socket.id}`);

  // Room management
  socket.on('join_room', ({ roomId, userMeta }) => {
    socket.join(roomId);
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Map());
    }

    const roomMembers = rooms.get(roomId);
    const existingParticipants = Array.from(roomMembers.entries()).map(([id, meta]) => ({
      userId: id,
      userMeta: meta || { name: `Participant ${id.slice(0, 4)}` },
      isPresenting: meta?.isPresenting || false,
      screenStreamId: meta?.screenStreamId || null,
    }));

    const clientMeta = userMeta || { name: `Participant ${socket.id.slice(0, 4)}` };
    clientMeta.isPresenting = false;
    clientMeta.screenStreamId = null;
    roomMembers.set(socket.id, clientMeta);

    console.log(`[Join Room] Client ${socket.id} joined room ${roomId}`);

    // Send list of existing room members to the newly joined client
    socket.emit('room_users', {
      roomId,
      participants: existingParticipants,
    });

    // Broadcast to existing room members about the new participant
    socket.to(roomId).emit('user_joined', {
      userId: socket.id,
      roomId,
      userMeta: clientMeta,
    });
  });

  socket.on('leave_room', ({ roomId }) => {
    socket.leave(roomId);
    if (rooms.has(roomId)) {
      const roomMembers = rooms.get(roomId);
      roomMembers.delete(socket.id);
      if (roomMembers.size === 0) {
        rooms.delete(roomId);
      }
    }
    console.log(`[Leave Room] Client ${socket.id} left room ${roomId}`);
    socket.to(roomId).emit('user_left', { userId: socket.id, roomId });
  });

  // Real-Time Sign Language Gesture Stream
  socket.on('send_gesture', ({ roomId, gesture, confidence, timestamp }) => {
    if (roomId) {
      socket.to(roomId).emit('gesture_stream', {
        senderId: socket.id,
        gesture,
        confidence,
        timestamp: timestamp || Date.now(),
      });
    }
  });

  // Screen Sharing Presenting Status Broadcast
  socket.on('presenting_status', ({ roomId, isPresenting, screenStreamId }) => {
    if (roomId && rooms.has(roomId)) {
      const roomMembers = rooms.get(roomId);
      if (roomMembers.has(socket.id)) {
        const meta = roomMembers.get(socket.id);
        meta.isPresenting = isPresenting;
        meta.screenStreamId = screenStreamId;
        roomMembers.set(socket.id, meta);
      }
      
      socket.to(roomId).emit('peer_presenting', {
        senderId: socket.id,
        isPresenting,
        screenStreamId,
      });
    }
  });

  // WebRTC Peer-to-Peer Signaling
  socket.on('webrtc_offer', ({ targetId, offer }) => {
    io.to(targetId).emit('webrtc_offer', { senderId: socket.id, offer });
  });

  socket.on('webrtc_answer', ({ targetId, answer }) => {
    io.to(targetId).emit('webrtc_answer', { senderId: socket.id, answer });
  });

  socket.on('webrtc_candidate', ({ targetId, candidate }) => {
    io.to(targetId).emit('webrtc_candidate', { senderId: socket.id, candidate });
  });

  socket.on('disconnecting', () => {
    for (const room of socket.rooms) {
      if (room !== socket.id) {
        if (rooms.has(room)) {
          const roomMembers = rooms.get(room);
          roomMembers.delete(socket.id);
          if (roomMembers.size === 0) {
            rooms.delete(room);
          }
        }
        socket.to(room).emit('user_left', { userId: socket.id, roomId: room });
      }
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`[Socket Disconnected] Client ID: ${socket.id}, Reason: ${reason}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 SL-Meet Socket Service running on port ${PORT}`);
  console.log(`📡 Ready for Render Deployment & Client Connections`);
  console.log(`====================================================`);
});
