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

// Store active room tracking
const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`[Socket Connected] Client ID: ${socket.id}`);

  // Room management
  socket.on('join_room', ({ roomId, userMeta }) => {
    socket.join(roomId);
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId).add(socket.id);

    console.log(`[Join Room] Client ${socket.id} joined room ${roomId}`);
    
    // Broadcast to room members
    socket.to(roomId).emit('user_joined', {
      userId: socket.id,
      roomId,
      userMeta: userMeta || {},
    });
  });

  socket.on('leave_room', ({ roomId }) => {
    socket.leave(roomId);
    if (rooms.has(roomId)) {
      rooms.get(roomId).delete(socket.id);
      if (rooms.get(roomId).size === 0) {
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
