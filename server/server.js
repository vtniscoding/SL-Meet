import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATASET_PATH = path.join(__dirname, 'data', 'dataset.json');
const SERVER_PKG_PATH = path.join(__dirname, 'package.json');

let SERVER_VERSION = '2.0.0';
try {
  const pkgRaw = fs.readFileSync(SERVER_PKG_PATH, 'utf8');
  SERVER_VERSION = JSON.parse(pkgRaw).version || '2.0.0';
} catch (err) {
  console.warn('[Server] Could not read package.json version, using default 2.0.0');
}

const ADMIN_SECRET = process.env.ADMIN_SECRET;
if (!ADMIN_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[FATAL] Missing ADMIN_SECRET in production environment! Server halting for security.');
    process.exit(1);
  } else {
    console.warn('[WARN] ADMIN_SECRET not set in .env. Falling back to default local dev secret.');
  }
}
const EFFECTIVE_ADMIN_SECRET = ADMIN_SECRET || 'sl_meet_admin_secret_2026';

const PORT = process.env.PORT || 4000;
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
  : '*';

if (process.env.NODE_ENV === 'production' && allowedOrigins === '*') {
  console.warn('[SECURITY WARNING] ALLOWED_ORIGINS is set to wildcard "*" in production!');
}

const app = express();
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '10mb' }));

// In-Memory Cached Async Dataset I/O
let cachedDataset = null;

async function readDataset() {
  if (cachedDataset) return cachedDataset;
  try {
    if (fs.existsSync(DATASET_PATH)) {
      const raw = await fs.promises.readFile(DATASET_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.gestures)) {
        parsed.gestures.forEach((g, idx) => {
          if (!g.id) {
            g.id = `sample_${idx + 1}`;
          }
        });
      }
      cachedDataset = parsed;
      return cachedDataset;
    }
  } catch (err) {
    console.error('[Server Dataset] Failed to read dataset:', err);
  }
  cachedDataset = { gestures: [] };
  return cachedDataset;
}

async function writeDataset(data) {
  try {
    const dir = path.dirname(DATASET_PATH);
    if (!fs.existsSync(dir)) await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(DATASET_PATH, JSON.stringify(data, null, 2), 'utf8');
    cachedDataset = data;
    return true;
  } catch (err) {
    console.error('[Server Dataset] Failed to write dataset:', err);
    return false;
  }
}

// Admin Protection Middleware (Header-Only, Timing-Safe Comparison)
function requireAdminAuth(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  if (typeof adminKey !== 'string') {
    return res.status(403).json({ success: false, message: 'Unauthorized Admin Access. Missing x-admin-key header.' });
  }

  const keyBuf = Buffer.from(adminKey);
  const secretBuf = Buffer.from(EFFECTIVE_ADMIN_SECRET);

  if (keyBuf.length === secretBuf.length && crypto.timingSafeEqual(keyBuf, secretBuf)) {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Unauthorized Admin Access. Invalid secret key.' });
}

// Render Health Check Endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'SL-Meet Render Socket & Signaling Service',
    version: SERVER_VERSION,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/version', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json({
    success: true,
    version: SERVER_VERSION,
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// PUBLIC API: Client fetches active ASL Dataset
app.get('/api/gestures/dataset', async (req, res) => {
  const dataset = await readDataset();
  res.json({ success: true, dataset });
});

// ADMIN API: Verify Admin Secret Key
app.post('/api/admin/verify', requireAdminAuth, (req, res) => {
  res.json({ success: true, message: 'Admin authenticated successfully.' });
});

// ADMIN API: Import / Replace entire dataset JSON from Kaggle/Colab
app.post('/api/gestures/dataset', requireAdminAuth, async (req, res) => {
  const { dataset } = req.body;
  if (dataset && Array.isArray(dataset.gestures)) {
    dataset.gestures.forEach((g, idx) => {
      if (!g.id) g.id = `sample_${idx + 1}`;
    });
    await writeDataset(dataset);
    if (io) io.emit('dataset_updated', { count: dataset.gestures.length });
    return res.json({ success: true, count: dataset.gestures.length });
  }
  res.status(400).json({ success: false, message: 'Invalid dataset format.' });
});

// ADMIN API: Force Deploy Dataset (Broadcasts to all clients to refetch dataset)
app.post('/api/admin/deploy', requireAdminAuth, async (req, res) => {
  const dataset = await readDataset();
  const count = dataset?.gestures?.length || 0;
  if (io) io.emit('dataset_updated', { count });
  res.json({ success: true, message: 'Dataset deployed to all connected clients.', count });
});

// ADMIN API: Save / Append new sample variation recorded via camera
app.post('/api/gestures/sample', requireAdminAuth, async (req, res) => {
  const { name, vector, type, description, id } = req.body;
  if (!name || !vector || !Array.isArray(vector)) {
    return res.status(400).json({ success: false, message: 'Missing gesture name or feature vector.' });
  }

  const dataset = await readDataset();
  if (!dataset.gestures) dataset.gestures = [];

  const sampleId = id || `sample_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const existingIdx = dataset.gestures.findIndex((g) => g.id === sampleId);

  const newSample = {
    id: sampleId,
    name: name.trim(),
    type: type || (vector.length === 126 ? 'two_hands' : 'single_hand'),
    description: description || `Sample variation for ${name.trim()}`,
    vector,
    createdAt: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    dataset.gestures[existingIdx] = newSample;
  } else {
    dataset.gestures.push(newSample);
  }

  await writeDataset(dataset);
  if (io) io.emit('dataset_updated', { count: dataset.gestures.length, updatedGesture: name.trim() });
  res.json({ success: true, count: dataset.gestures.length, gesture: newSample });
});

// ADMIN API: Edit sample details (name label, description)
app.put('/api/gestures/sample/:id', requireAdminAuth, async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  const dataset = await readDataset();

  if (!dataset.gestures) return res.status(404).json({ success: false, message: 'Dataset empty.' });

  const idx = dataset.gestures.findIndex((g) => g.id === id);
  if (idx < 0) return res.status(404).json({ success: false, message: 'Sample variation not found.' });

  if (name) dataset.gestures[idx].name = name.trim();
  if (description) dataset.gestures[idx].description = description.trim();

  await writeDataset(dataset);
  if (io) io.emit('dataset_updated', { count: dataset.gestures.length });
  res.json({ success: true, gesture: dataset.gestures[idx] });
});

// ADMIN API: Delete single sample variation by ID
app.delete('/api/gestures/sample/:id', requireAdminAuth, async (req, res) => {
  const { id } = req.params;
  const dataset = await readDataset();
  if (dataset.gestures) {
    const initialCount = dataset.gestures.length;
    dataset.gestures = dataset.gestures.filter((g) => g.id !== id && g.name.toLowerCase() !== id.toLowerCase());
    if (dataset.gestures.length < initialCount) {
      await writeDataset(dataset);
      if (io) io.emit('dataset_updated', { count: dataset.gestures.length });
      return res.json({ success: true, count: dataset.gestures.length });
    }
  }
  res.status(404).json({ success: false, message: 'Sample variation not found.' });
});

// ADMIN API: Delete all sample variations for a specific gesture label name
app.delete('/api/gestures/label/:name', requireAdminAuth, async (req, res) => {
  const { name } = req.params;
  const dataset = await readDataset();
  if (dataset.gestures) {
    const initialCount = dataset.gestures.length;
    const labelLower = decodeURIComponent(name).toLowerCase();
    dataset.gestures = dataset.gestures.filter((g) => g.name.toLowerCase() !== labelLower);
    if (dataset.gestures.length < initialCount) {
      await writeDataset(dataset);
      if (io) io.emit('dataset_updated', { count: dataset.gestures.length });
      return res.json({ success: true, count: dataset.gestures.length });
    }
  }
  res.status(404).json({ success: false, message: 'No samples found for this label.' });
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});

function sanitizeRole(role) {
  if (role === 'signer' || role === 'non_signer') return role;
  return 'non_signer';
}

// Store active room tracking: Map<roomId, { hostId: string | null, members: Map<socketId, userMeta>, messages: Array }>
const rooms = new Map();

// Helper: Verify if two socket IDs share at least one active room
function arePeersInSameRoom(socketAId, socketBId) {
  for (const [, roomData] of rooms.entries()) {
    if (roomData.members.has(socketAId) && roomData.members.has(socketBId)) {
      return true;
    }
  }
  return false;
}

// Helper: Safely transfer host to the next authenticated (non-guest) member
function transferHostToNextNonGuest(roomData) {
  const nextHostEntry = Array.from(roomData.members.entries()).find(([, meta]) => !meta.isGuest);
  return nextHostEntry ? nextHostEntry[0] : null;
}

io.on('connection', (socket) => {
  console.log(`[Socket Connected] Client ID: ${socket.id}`);
  socket.emit('server_info', { version: SERVER_VERSION });

  // Room management
  socket.on('join_room', ({ roomId, userMeta }) => {
    socket.join(roomId);
    const isGuest = !!userMeta?.isGuest;

    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        hostId: isGuest ? null : socket.id,
        members: new Map(),
        messages: [],
      });
    }

    const roomData = rooms.get(roomId);
    if ((!roomData.hostId || !roomData.members.has(roomData.hostId)) && !isGuest) {
      roomData.hostId = socket.id;
    }

    const roomMembers = roomData.members;
    const existingParticipants = Array.from(roomMembers.entries()).map(([id, meta]) => ({
      userId: id,
      userMeta: meta || { name: `Participant ${id.slice(0, 4)}`, role: 'non_signer' },
      role: meta?.role || 'non_signer',
      avatarColor: meta?.avatarColor || null,
      avatarUrl: meta?.avatarUrl || null,
      isPresenting: meta?.isPresenting || false,
      screenStreamId: meta?.screenStreamId || null,
      isMuted: meta?.isMuted || false,
      isCameraOff: meta?.isCameraOff || false,
      isAiVisionActive: meta?.isAiVisionActive || false,
      isHost: !meta?.isGuest && id === roomData.hostId,
    }));

    const clientMeta = userMeta || { name: `Participant ${socket.id.slice(0, 4)}` };
    clientMeta.role = sanitizeRole(userMeta?.role);
    clientMeta.avatarColor = userMeta?.avatarColor || null;
    clientMeta.avatarUrl = userMeta?.avatarUrl || null;
    clientMeta.isPresenting = false;
    clientMeta.screenStreamId = null;
    clientMeta.isMuted = userMeta?.isMuted || false;
    clientMeta.isCameraOff = userMeta?.isCameraOff || false;
    clientMeta.isAiVisionActive = userMeta?.isAiVisionActive || false;
    clientMeta.isGuest = isGuest;
    roomMembers.set(socket.id, clientMeta);

    console.log(`[Join Room] Client ${socket.id} joined room ${roomId} (Role: ${clientMeta.role}, Host: ${roomData.hostId || 'None'}) - Guest: ${isGuest}`);

    // Send list of existing room members, hostId, and room chat history to the newly joined client
    socket.emit('room_users', {
      roomId,
      hostId: roomData.hostId,
      participants: existingParticipants,
      messages: roomData.messages || [],
    });

    // Broadcast to existing room members about the new participant & current hostId
    socket.to(roomId).emit('user_joined', {
      userId: socket.id,
      roomId,
      hostId: roomData.hostId,
      role: clientMeta.role,
      userMeta: clientMeta,
    });
  });

  // Dynamic In-Room Role Switching
  socket.on('change_role', ({ roomId, role }) => {
    if (roomId && rooms.has(roomId)) {
      const roomData = rooms.get(roomId);
      const roomMembers = roomData.members;
      if (roomMembers.has(socket.id)) {
        const validRole = sanitizeRole(role);
        const meta = roomMembers.get(socket.id);
        meta.role = validRole;
        roomMembers.set(socket.id, meta);

        console.log(`[Role Change] User ${socket.id} in room ${roomId} changed role to ${validRole}`);
        io.in(roomId).emit('peer_role_changed', {
          userId: socket.id,
          role: validRole,
        });
      }
    }
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
        // If host left, transfer host role only to the next authenticated (non-guest) member
        if (roomData.hostId === socket.id) {
          roomData.hostId = transferHostToNextNonGuest(roomData);
          console.log(`[Host Transfer] Room ${roomId} host transferred to ${roomData.hostId || 'None (guests only)'}`);
        }
        socket.to(roomId).emit('user_left', { userId: socket.id, roomId, hostId: roomData.hostId });
      }
    }
    console.log(`[Leave Room] Client ${socket.id} left room ${roomId}`);
  });

  socket.on('end_room', ({ roomId }) => {
    if (!roomId) return;
    const roomData = rooms.get(roomId);
    if (!roomData || !roomData.members.has(socket.id)) {
      console.warn(`[Unauthorized] Non-member ${socket.id} attempted to end room ${roomId}`);
      socket.emit('error', { message: 'Unauthorized: You are not a member of this room.' });
      return;
    }
    if (!roomData.hostId || roomData.hostId !== socket.id) {
      console.warn(`[Unauthorized] Non-host ${socket.id} attempted to end room ${roomId}`);
      socket.emit('error', { message: 'Unauthorized: Only host can end room for everyone.' });
      return;
    }

    console.log(`[End Room] Host ${socket.id} ended room ${roomId} for everyone`);
    io.in(roomId).emit('room_ended', { roomId, senderId: socket.id, reason: 'Meeting ended' });
    io.in(roomId).emit('kick_peer_request', { senderId: socket.id, reason: 'Meeting ended' });
    rooms.delete(roomId);
  });

  // Real-Time Sign Language Gesture Stream
  socket.on('send_gesture', ({ roomId, gesture, confidence, timestamp }) => {
    if (roomId && rooms.has(roomId)) {
      const roomData = rooms.get(roomId);
      if (!roomData.members.has(socket.id)) return;
      const meta = roomData.members.get(socket.id);
      socket.to(roomId).emit('gesture_stream', {
        senderId: socket.id,
        senderName: meta?.name || `Participant ${socket.id.slice(0, 4)}`,
        avatarColor: meta?.avatarColor || null,
        avatarUrl: meta?.avatarUrl || null,
        gesture,
        confidence,
        timestamp: timestamp || Date.now(),
      });
    }
  });

  // Real-Time Speech-to-Text Caption Stream (Author attribution enforced by Server)
  socket.on('speech_caption', ({ roomId, text, isFinal }) => {
    if (roomId && rooms.has(roomId) && typeof text === 'string' && text.trim().length > 0) {
      const roomData = rooms.get(roomId);
      if (!roomData.members.has(socket.id)) return;
      const senderMeta = roomData.members.get(socket.id);
      const cleanText = text.trim().slice(0, 500);

      io.in(roomId).emit('speech_caption_stream', {
        senderId: socket.id,
        senderName: senderMeta?.name || `Speaker ${socket.id.slice(0, 4)}`,
        avatarColor: senderMeta?.avatarColor || null,
        avatarUrl: senderMeta?.avatarUrl || null,
        text: cleanText,
        isFinal: !!isFinal,
        timestamp: Date.now(),
      });
    }
  });

  // Real-Time Room Text Chat Broadcast
  socket.on('send_chat_message', ({ id, roomId, text, senderName }) => {
    if (roomId && text && typeof text === 'string' && text.trim().length > 0) {
      const roomData = rooms.get(roomId);
      if (!roomData || !roomData.members.has(socket.id)) return;
      const clientMeta = roomData.members.get(socket.id);
      const name = clientMeta?.name || (senderName && senderName !== 'You' ? senderName : null) || 'Participant';

      const messageData = {
        id: id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        senderId: socket.id,
        senderName: name,
        text: text.trim(),
        timestamp: Date.now(),
        type: 'user',
      };

      if (text.trim() === '__SL_MEET_ROOM_ENDED_SIGNAL__') {
        if (!roomData.hostId || roomData.hostId !== socket.id) {
          console.warn(`[Unauthorized] Non-host ${socket.id} attempted to broadcast room ended signal in ${roomId}`);
          return;
        }
        io.in(roomId).emit('room_ended', { roomId, senderId: socket.id, reason: 'Meeting ended' });
        io.in(roomId).emit('kick_peer_request', { senderId: socket.id, reason: 'Meeting ended' });
        io.in(roomId).emit('chat_message', messageData);
        rooms.delete(roomId);
        return;
      }

      if (!roomData.messages) roomData.messages = [];
      roomData.messages.push(messageData);
      if (roomData.messages.length > 200) {
        roomData.messages.shift();
      }

      io.in(roomId).emit('chat_message', messageData);
    }
  });

  // Presenting status
  socket.on('presenting_status', ({ roomId, isPresenting, screenStreamId }) => {
    if (roomId && rooms.has(roomId)) {
      const roomData = rooms.get(roomId);
      const meta = roomData.members.get(socket.id);
      if (meta) {
        meta.isPresenting = !!isPresenting;
        meta.screenStreamId = isPresenting ? screenStreamId : null;
        roomData.members.set(socket.id, meta);

        console.log(`[Presentation] User ${socket.id} presenting: ${isPresenting} (Stream: ${screenStreamId})`);
        io.in(roomId).emit('peer_presenting_changed', {
          userId: socket.id,
          isPresenting: !!isPresenting,
          screenStreamId: isPresenting ? screenStreamId : null,
        });
      }
    }
  });

  // Media Status Broadcast (Mic mute, Camera off, AI Vision active, Audio speaking)
  socket.on('media_status_change', ({ roomId, isMuted, isCameraOff, isAiVisionActive, isSpeaking }) => {
    if (roomId && rooms.has(roomId)) {
      const roomData = rooms.get(roomId);
      const meta = roomData.members.get(socket.id);
      if (meta) {
        if (isMuted !== undefined) meta.isMuted = !!isMuted;
        if (isCameraOff !== undefined) meta.isCameraOff = !!isCameraOff;
        if (isAiVisionActive !== undefined) meta.isAiVisionActive = !!isAiVisionActive;
        roomData.members.set(socket.id, meta);
      }

      socket.to(roomId).emit('peer_media_status', {
        senderId: socket.id,
        isMuted: !!isMuted,
        isCameraOff: !!isCameraOff,
        isAiVisionActive: !!isAiVisionActive,
        isSpeaking: !!isSpeaking,
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

  // WebRTC Peer-to-Peer Signaling (Protected against Cross-Room Signal Injection)
  socket.on('webrtc_offer', ({ targetId, offer }) => {
    if (arePeersInSameRoom(socket.id, targetId)) {
      io.to(targetId).emit('webrtc_offer', { senderId: socket.id, offer });
    } else {
      console.warn(`[WebRTC Security] Blocked cross-room offer from ${socket.id} to ${targetId}`);
    }
  });

  socket.on('webrtc_answer', ({ targetId, answer }) => {
    if (arePeersInSameRoom(socket.id, targetId)) {
      io.to(targetId).emit('webrtc_answer', { senderId: socket.id, answer });
    } else {
      console.warn(`[WebRTC Security] Blocked cross-room answer from ${socket.id} to ${targetId}`);
    }
  });

  socket.on('webrtc_candidate', ({ targetId, candidate }) => {
    if (arePeersInSameRoom(socket.id, targetId)) {
      io.to(targetId).emit('webrtc_candidate', { senderId: socket.id, candidate });
    } else {
      console.warn(`[WebRTC Security] Blocked cross-room candidate from ${socket.id} to ${targetId}`);
    }
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
            roomData.hostId = transferHostToNextNonGuest(roomData);
            console.log(`[Host Transfer] Room ${room} host transferred to ${roomData.hostId || 'None (guests only)'}`);
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
