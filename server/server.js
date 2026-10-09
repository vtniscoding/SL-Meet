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

// Store active room tracking: Map<roomId, { hostId: string, members: Map<socketId, userMeta> }>
const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`[Socket Connected] Client ID: ${socket.id}`);

  // Room management
  socket.on('join_room', ({ roomId, userMeta }) => {
    socket.join(roomId);
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        hostId: socket.id,
        members: new Map(),
      });
    }

    const roomData = rooms.get(roomId);
    if (!roomData.hostId || !roomData.members.has(roomData.hostId)) {
      roomData.hostId = socket.id;
    }

    const roomMembers = roomData.members;
    const existingParticipants = Array.from(roomMembers.entries()).map(([id, meta]) => ({
      userId: id,
      userMeta: meta || { name: `Participant ${id.slice(0, 4)}` },
      isPresenting: meta?.isPresenting || false,
      screenStreamId: meta?.screenStreamId || null,
      isMuted: meta?.isMuted || false,
      isCameraOff: meta?.isCameraOff || false,
      isHost: id === roomData.hostId,
    }));

    const clientMeta = userMeta || { name: `Participant ${socket.id.slice(0, 4)}` };
    clientMeta.isPresenting = false;
    clientMeta.screenStreamId = null;
    clientMeta.isMuted = userMeta?.isMuted || false;
    clientMeta.isCameraOff = userMeta?.isCameraOff || false;
    roomMembers.set(socket.id, clientMeta);

    console.log(`[Join Room] Client ${socket.id} joined room ${roomId} (Host: ${roomData.hostId})`);

    // Send list of existing room members & hostId to the newly joined client
    socket.emit('room_users', {
      roomId,
      hostId: roomData.hostId,
      participants: existingParticipants,
    });

    // Broadcast to existing room members about the new participant & current hostId
    socket.to(roomId).emit('user_joined', {
      userId: socket.id,
      roomId,
      hostId: roomData.hostId,
      userMeta: clientMeta,
    });
  });


  socket.on('leave_room', ({ roomId }) => {
    socket.leave(roomId);
    if (rooms.has(roomId)) {
      const roomData = rooms.get(roomId);
      const roomMembers = roomData.members;
      roomMembers.delete(socket.id);

      if (roomMembers.size === 0) {
        rooms.delete(roomId);
      } else {
        // If host left, transfer host role to next active member
        if (roomData.hostId === socket.id) {
          const nextHost = Array.from(roomMembers.keys())[0];
          roomData.hostId = nextHost;
          console.log(`[Host Transfer] Room ${roomId} host transferred to ${nextHost}`);
        }
        socket.to(roomId).emit('user_left', { userId: socket.id, roomId, hostId: roomData.hostId });
      }
    }
    console.log(`[Leave Room] Client ${socket.id} left room ${roomId}`);
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

  // Real-Time Room Text Chat Broadcast
  socket.on('send_chat_message', ({ roomId, text, senderName }) => {
    if (roomId && text && typeof text === 'string' && text.trim().length > 0) {
      const roomData = rooms.get(roomId);
      const clientMeta = roomData?.members?.get(socket.id);
      const name = senderName || clientMeta?.name || `Participant ${socket.id.slice(0, 4)}`;

      const messageData = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        senderId: socket.id,
        senderName: name,
        text: text.trim(),
        timestamp: Date.now(),
        type: 'user',
      };

      io.in(roomId).emit('chat_message', messageData);
    }
  });

  // Screen Sharing Presenting Status Broadcast
  socket.on('presenting_status', ({ roomId, isPresenting, screenStreamId }) => {
    if (roomId && rooms.has(roomId)) {
      const roomData = rooms.get(roomId);
      const roomMembers = roomData.members;
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

  // Real-Time Camera & Microphone Status Broadcast
  socket.on('media_status_change', ({ roomId, isMuted, isCameraOff }) => {
    if (roomId && rooms.has(roomId)) {
      const roomData = rooms.get(roomId);
      const roomMembers = roomData.members;
      if (roomMembers.has(socket.id)) {
        const meta = roomMembers.get(socket.id);
        meta.isMuted = !!isMuted;
        meta.isCameraOff = !!isCameraOff;
        roomMembers.set(socket.id, meta);
      }
      
      socket.to(roomId).emit('peer_media_status', {
        senderId: socket.id,
        isMuted: !!isMuted,
        isCameraOff: !!isCameraOff,
      });
    }
  });


  // Host Actions: Remote Peer Moderation (Mute / Kick) - Server Validated
  socket.on('mute_peer', ({ roomId, targetId }) => {
    if (roomId && targetId && rooms.has(roomId)) {
      const roomData = rooms.get(roomId);
      if (roomData.hostId === socket.id) {
        console.log(`[Host Action] Host ${socket.id} muted target ${targetId}`);
        io.to(targetId).emit('mute_peer_request', { senderId: socket.id });
      } else {
        console.warn(`[Unauthorized] Non-host ${socket.id} attempted to mute ${targetId}`);
      }
    }
  });

  socket.on('kick_peer', ({ roomId, targetId }) => {
    if (roomId && targetId && rooms.has(roomId)) {
      const roomData = rooms.get(roomId);
      if (roomData.hostId === socket.id) {
        console.log(`[Host Action] Host ${socket.id} kicked target ${targetId} from room ${roomId}`);
        io.to(targetId).emit('kick_peer_request', { senderId: socket.id });
        roomData.members.delete(targetId);

        if (roomData.members.size === 0) {
          rooms.delete(roomId);
        } else {
          socket.to(roomId).emit('user_left', { userId: targetId, roomId, hostId: roomData.hostId });
        }
      } else {
        console.warn(`[Unauthorized] Non-host ${socket.id} attempted to kick ${targetId}`);
      }
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
      if (room !== socket.id && rooms.has(room)) {
        const roomData = rooms.get(room);
        const roomMembers = roomData.members;
        roomMembers.delete(socket.id);

        if (roomMembers.size === 0) {
          rooms.delete(room);
        } else {
          if (roomData.hostId === socket.id) {
            const nextHost = Array.from(roomMembers.keys())[0];
            roomData.hostId = nextHost;
            console.log(`[Host Transfer] Room ${room} host transferred to ${nextHost}`);
          }
          socket.to(room).emit('user_left', { userId: socket.id, roomId: room, hostId: roomData.hostId });
        }
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
