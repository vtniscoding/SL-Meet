import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

const TEST_SECRET = 'sl_meet_admin_secret_test_2026';

// Reusable middleware logic from server.js
function requireAdminAuth(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  if (typeof adminKey !== 'string') {
    return res.status(403).json({ success: false, message: 'Unauthorized Admin Access. Missing x-admin-key header.' });
  }

  const keyBuf = Buffer.from(adminKey);
  const secretBuf = Buffer.from(TEST_SECRET);

  if (keyBuf.length === secretBuf.length && crypto.timingSafeEqual(keyBuf, secretBuf)) {
    return next();
  }
  return res.status(403).json({ success: false, message: 'Unauthorized Admin Access. Invalid secret key.' });
}

function mockResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
}

// Helpers from server.js
function arePeersInSameRoom(rooms, socketAId, socketBId) {
  for (const [, roomData] of rooms.entries()) {
    if (roomData.members.has(socketAId) && roomData.members.has(socketBId)) {
      return true;
    }
  }
  return false;
}

function transferHostToNextNonGuest(roomData) {
  const nextHostEntry = Array.from(roomData.members.entries()).find(([, meta]) => !meta.isGuest);
  return nextHostEntry ? nextHostEntry[0] : null;
}

test('requireAdminAuth: rejects requests with missing or query param key', () => {
  // Case 1: Missing header
  const req1 = { headers: {} };
  const res1 = mockResponse();
  let nextCalled1 = false;
  requireAdminAuth(req1, res1, () => { nextCalled1 = true; });
  assert.equal(nextCalled1, false);
  assert.equal(res1.statusCode, 403);
  assert.match(res1.body.message, /Missing x-admin-key/);

  // Case 2: Attempting query parameter bypass (disallowed for security)
  const req2 = { headers: {}, query: { adminKey: TEST_SECRET } };
  const res2 = mockResponse();
  let nextCalled2 = false;
  requireAdminAuth(req2, res2, () => { nextCalled2 = true; });
  assert.equal(nextCalled2, false);
  assert.equal(res2.statusCode, 403);

  // Case 3: Invalid header value
  const req3 = { headers: { 'x-admin-key': 'incorrect_secret' } };
  const res3 = mockResponse();
  let nextCalled3 = false;
  requireAdminAuth(req3, res3, () => { nextCalled3 = true; });
  assert.equal(nextCalled3, false);
  assert.equal(res3.statusCode, 403);
  assert.match(res3.body.message, /Invalid secret key/);

  // Case 4: Valid secret key via x-admin-key header
  const req4 = { headers: { 'x-admin-key': TEST_SECRET } };
  const res4 = mockResponse();
  let nextCalled4 = false;
  requireAdminAuth(req4, res4, () => { nextCalled4 = true; });
  assert.equal(nextCalled4, true);
  assert.equal(res4.statusCode, 200);
});

test('transferHostToNextNonGuest: transfers host only to non-guest members', () => {
  // Scenario A: Host leaves, remaining are 1 guest and 1 non-guest
  const roomData = {
    hostId: 'socket_host',
    members: new Map([
      ['socket_guest_1', { name: 'Guest Alice', isGuest: true }],
      ['socket_member_2', { name: 'Member Bob', isGuest: false }],
    ]),
  };

  const nextHost = transferHostToNextNonGuest(roomData);
  assert.equal(nextHost, 'socket_member_2', 'Should promote Member Bob to host');

  // Scenario B: Host leaves, remaining are ONLY guests
  const roomOnlyGuests = {
    hostId: 'socket_host',
    members: new Map([
      ['socket_guest_1', { name: 'Guest Alice', isGuest: true }],
      ['socket_guest_2', { name: 'Guest Charlie', isGuest: true }],
    ]),
  };

  const nextHostB = transferHostToNextNonGuest(roomOnlyGuests);
  assert.equal(nextHostB, null, 'Must return null so guests are never granted host privileges');
});

test('arePeersInSameRoom: blocks cross-room WebRTC communication', () => {
  const rooms = new Map([
    [
      'room-101',
      {
        members: new Map([
          ['peer-A', { name: 'Alice' }],
          ['peer-B', { name: 'Bob' }],
        ]),
      },
    ],
    [
      'room-202',
      {
        members: new Map([
          ['peer-C', { name: 'Charlie' }],
        ]),
      },
    ],
  ]);

  // Peer-A and Peer-B are in room-101 -> allowed
  assert.equal(arePeersInSameRoom(rooms, 'peer-A', 'peer-B'), true);

  // Peer-A (room-101) and Peer-C (room-202) -> denied
  assert.equal(arePeersInSameRoom(rooms, 'peer-A', 'peer-C'), false);

  // Unknown peer -> denied
  assert.equal(arePeersInSameRoom(rooms, 'peer-A', 'peer-stranger'), false);
});

test('end_room authorization: validates host identity and room membership', () => {
  const rooms = new Map([
    [
      'room-secure',
      {
        hostId: 'host-socket-1',
        members: new Map([
          ['host-socket-1', { name: 'Host User', isGuest: false }],
          ['guest-socket-2', { name: 'Guest User', isGuest: true }],
        ]),
      },
    ],
  ]);

  function handleEndRoom(socketId, roomId) {
    const roomData = rooms.get(roomId);
    if (!roomData || !roomData.members.has(socketId)) {
      return { success: false, error: 'Unauthorized: You are not a member of this room.' };
    }
    if (!roomData.hostId || roomData.hostId !== socketId) {
      return { success: false, error: 'Unauthorized: Only host can end room for everyone.' };
    }
    rooms.delete(roomId);
    return { success: true };
  }

  // Stranger tries to end room -> rejected
  const resStranger = handleEndRoom('stranger-socket-x', 'room-secure');
  assert.equal(resStranger.success, false);
  assert.match(resStranger.error, /not a member/);
  assert.ok(rooms.has('room-secure'));

  // Guest tries to end room -> rejected
  const resGuest = handleEndRoom('guest-socket-2', 'room-secure');
  assert.equal(resGuest.success, false);
  assert.match(resGuest.error, /Only host can end room/);
  assert.ok(rooms.has('room-secure'));

  // Legitimate host ends room -> success and room deleted
  const resHost = handleEndRoom('host-socket-1', 'room-secure');
  assert.equal(resHost.success, true);
  assert.equal(rooms.has('room-secure'), false);
});
