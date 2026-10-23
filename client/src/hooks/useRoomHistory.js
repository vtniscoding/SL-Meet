import { useState, useEffect, useCallback } from 'react';

const MAX_HISTORY_ITEMS = 50;
const STORAGE_PREFIX = 'slmeet.room_history';
export const ROOM_HISTORY_EVENT = 'slmeet_room_history_updated';

/**
 * Pure synchronous helper to save a room to localStorage.
 * Can be called anywhere (even outside component lifecycle or right before navigation).
 */
export function saveRoomToHistory(roomId, userId = null, customName = null) {
  const cleanId = roomId?.trim();
  if (!cleanId) return null;

  const storageKey = `${STORAGE_PREFIX}.${userId || 'guest'}`;
  let list = [];

  try {
    const raw = localStorage.getItem(storageKey);
    list = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) list = [];
  } catch (err) {
    list = [];
  }

  const existingIndex = list.findIndex((r) => r.id === cleanId);
  let updatedList = [];

  if (existingIndex !== -1) {
    const existing = list[existingIndex];
    const updatedItem = {
      ...existing,
      name: customName?.trim() || existing.name || `Meeting ${cleanId}`,
      joinedAt: Date.now(),
    };
    updatedList = [
      updatedItem,
      ...list.slice(0, existingIndex),
      ...list.slice(existingIndex + 1),
    ];
  } else {
    const newItem = {
      id: cleanId,
      name: customName?.trim() || `Meeting ${cleanId}`,
      joinedAt: Date.now(),
    };
    updatedList = [newItem, ...list].slice(0, MAX_HISTORY_ITEMS);
  }

  try {
    localStorage.setItem(storageKey, JSON.stringify(updatedList));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(ROOM_HISTORY_EVENT, { detail: { roomId: cleanId } }));
    }
  } catch (err) {
    console.warn('Failed to save room to localStorage:', err);
  }

  return updatedList;
}

/**
 * Custom Hook: useRoomHistory
 * -------------------------------------------------------------
 * Manages persistent user meeting history in localStorage.
 * Scoped by userId so each account maintains its own list.
 */
export function useRoomHistory(userId = null) {
  const storageKey = `${STORAGE_PREFIX}.${userId || 'guest'}`;

  // Safe load initial state from localStorage
  const loadHistory = useCallback(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn('Failed to parse room history from localStorage:', err);
      return [];
    }
  }, [storageKey]);

  const [rooms, setRooms] = useState(loadHistory);

  // Reload history when userId changes or external updates occur
  useEffect(() => {
    setRooms(loadHistory());

    const handleUpdate = () => {
      setRooms(loadHistory());
    };

    window.addEventListener('storage', handleUpdate);
    window.addEventListener(ROOM_HISTORY_EVENT, handleUpdate);
    return () => {
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener(ROOM_HISTORY_EVENT, handleUpdate);
    };
  }, [loadHistory]);

  /**
   * Add or bump a room in history.
   */
  const addRoom = useCallback(
    (roomId, customName = null) => {
      const updated = saveRoomToHistory(roomId, userId, customName);
      if (updated) {
        setRooms(updated);
      }
    },
    [userId]
  );

  /**
   * Update the custom name of an existing room in history.
   */
  const updateRoomName = useCallback(
    (roomId, newName) => {
      const cleanId = roomId?.trim();
      const cleanName = newName?.trim();
      if (!cleanId) return;

      setRooms((prev) => {
        const updatedList = prev.map((r) => {
          if (r.id === cleanId) {
            return {
              ...r,
              name: cleanName || `Meeting ${cleanId}`,
            };
          }
          return r;
        });

        try {
          localStorage.setItem(storageKey, JSON.stringify(updatedList));
          window.dispatchEvent(new CustomEvent(ROOM_HISTORY_EVENT));
        } catch (err) {
          console.warn('Failed to update room name in localStorage:', err);
        }

        return updatedList;
      });
    },
    [storageKey]
  );

  /**
   * Delete a single room from history.
   */
  const removeRoom = useCallback(
    (roomId) => {
      const cleanId = roomId?.trim();
      if (!cleanId) return;

      setRooms((prev) => {
        const updatedList = prev.filter((r) => r.id !== cleanId);
        try {
          localStorage.setItem(storageKey, JSON.stringify(updatedList));
          window.dispatchEvent(new CustomEvent(ROOM_HISTORY_EVENT));
        } catch (err) {
          console.warn('Failed to delete room from localStorage:', err);
        }
        return updatedList;
      });
    },
    [storageKey]
  );

  /**
   * Clear all rooms from history.
   */
  const clearAllRooms = useCallback(() => {
    setRooms([]);
    try {
      localStorage.removeItem(storageKey);
      window.dispatchEvent(new CustomEvent(ROOM_HISTORY_EVENT));
    } catch (err) {
      console.warn('Failed to clear room history from localStorage:', err);
    }
  }, [storageKey]);

  return {
    rooms,
    addRoom,
    updateRoomName,
    removeRoom,
    clearAllRooms,
  };
}

export default useRoomHistory;
