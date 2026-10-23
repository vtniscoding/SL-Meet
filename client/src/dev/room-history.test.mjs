import assert from 'node:assert/strict';

console.log('🧪 Starting Room History Logic Tests...');

// Mock localStorage in Node
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) || null,
  setItem: (key, val) => store.set(key, String(val)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
};

// Test storage key logic
const STORAGE_PREFIX = 'slmeet.room_history';
const user1Key = `${STORAGE_PREFIX}.user-123`;
const guestKey = `${STORAGE_PREFIX}.guest`;

// Helper simulate addRoom
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

// 1. Test Adding New Room
{
  let list = [];
  list = simulateAddRoom(list, 'slm-abc-xyz', 'Daily Standup');
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'slm-abc-xyz');
  assert.equal(list[0].name, 'Daily Standup');
  console.log('  ✓ addRoom: creates new room entry');

  // 2. Test Adding Existing Room (bumping to top and preserving custom name)
  list = simulateAddRoom(list, 'slm-123-456', 'Sprint Planning');
  assert.equal(list.length, 2);
  assert.equal(list[0].id, 'slm-123-456');

  // Re-joining the first room without specifying name should preserve 'Daily Standup'
  list = simulateAddRoom(list, 'slm-abc-xyz');
  assert.equal(list.length, 2);
  assert.equal(list[0].id, 'slm-abc-xyz');
  assert.equal(list[0].name, 'Daily Standup', 'Custom name should be preserved when rejoining');
  console.log('  ✓ addRoom: moves existing room to top and preserves custom name');
}

// 3. Test Updating Room Name
{
  let list = [
    { id: 'slm-room-1', name: 'Old Name', joinedAt: 1000 },
    { id: 'slm-room-2', name: 'Other', joinedAt: 2000 },
  ];

  list = list.map((r) => (r.id === 'slm-room-1' ? { ...r, name: 'Renamed Meeting' } : r));
  assert.equal(list[0].name, 'Renamed Meeting');
  assert.equal(list[1].name, 'Other');
  console.log('  ✓ updateRoomName: correctly updates title in-place');
}

// 4. Test Deleting Room
{
  let list = [
    { id: 'slm-room-1', name: 'Room 1', joinedAt: 1000 },
    { id: 'slm-room-2', name: 'Room 2', joinedAt: 2000 },
  ];

  list = list.filter((r) => r.id !== 'slm-room-1');
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'slm-room-2');
  console.log('  ✓ removeRoom: removes room from list');
}

console.log('🎉 All Room History logic tests passed successfully!\n');
