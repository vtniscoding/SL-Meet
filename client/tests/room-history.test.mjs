import test from 'node:test';
import assert from 'node:assert/strict';

// Mock localStorage in Node
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) || null,
  setItem: (key, val) => store.set(key, String(val)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
};

function simulateAddRoom(prevList, roomId, customName = null) {
  const cleanId = roomId.trim();
  const existingIndex = prevList.findIndex((r) => r.id === cleanId);
  if (existingIndex !== -1) {
    const existing = prevList[existingIndex];
    return [
      {
        ...existing,
        name: customName?.trim() || existing.name || `Meeting ${cleanId}`,
        joinedAt: Date.now(),
      },
      ...prevList.slice(0, existingIndex),
      ...prevList.slice(existingIndex + 1),
    ];
  }
  return [
    {
      id: cleanId,
      name: customName?.trim() || `Meeting ${cleanId}`,
      joinedAt: Date.now(),
    },
    ...prevList,
  ];
}

test('Room History: addRoom creates a new room entry correctly', () => {
  let list = [];
  list = simulateAddRoom(list, 'slm-abc-xyz', 'Daily Standup');
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'slm-abc-xyz');
  assert.equal(list[0].name, 'Daily Standup');
});

test('Room History: addRoom bumps existing room to top and preserves custom name', () => {
  let list = [];
  list = simulateAddRoom(list, 'slm-abc-xyz', 'Daily Standup');
  list = simulateAddRoom(list, 'slm-123-456', 'Sprint Planning');
  assert.equal(list.length, 2);
  assert.equal(list[0].id, 'slm-123-456');

  // Re-joining the first room without specifying name preserves 'Daily Standup'
  list = simulateAddRoom(list, 'slm-abc-xyz');
  assert.equal(list.length, 2);
  assert.equal(list[0].id, 'slm-abc-xyz');
  assert.equal(list[0].name, 'Daily Standup');
});

test('Room History: updateRoomName correctly updates title in-place', () => {
  let list = [
    { id: 'slm-room-1', name: 'Old Name', joinedAt: 1000 },
    { id: 'slm-room-2', name: 'Other', joinedAt: 2000 },
  ];

  list = list.map((r) => (r.id === 'slm-room-1' ? { ...r, name: 'Renamed Meeting' } : r));
  assert.equal(list[0].name, 'Renamed Meeting');
  assert.equal(list[1].name, 'Other');
});

test('Room History: removeRoom removes room from list', () => {
  let list = [
    { id: 'slm-room-1', name: 'Room 1', joinedAt: 1000 },
    { id: 'slm-room-2', name: 'Room 2', joinedAt: 2000 },
  ];

  list = list.filter((r) => r.id !== 'slm-room-1');
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'slm-room-2');
});

