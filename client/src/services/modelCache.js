/**
 * IndexedDB-backed custom cache implementation for @huggingface/transformers.
 * Resolves Cache API restrictions when running under Electron file:// protocols.
 */

const DB_NAME = 'sl_meet_transformers_cache';
const DB_VERSION = 1;
const STORE_NAME = 'cache_entries';

let dbPromise = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'url' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }
  return dbPromise;
}

export const indexedDbCache = {
  async match(request) {
    try {
      const url = typeof request === 'string' ? request : request?.url;
      if (!url) return undefined;

      const db = await getDb();
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(url);
          req.onsuccess = () => {
            const record = req.result;
            if (record && record.data) {
              const response = new Response(record.data, {
                headers: new Headers(record.headers || {}),
              });
              resolve(response);
            } else {
              resolve(undefined);
            }
          };
          req.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      });
    } catch {
      return undefined;
    }
  },

  async put(request, response) {
    try {
      const url = typeof request === 'string' ? request : request?.url;
      if (!url || !response) return;

      const buffer = await response.clone().arrayBuffer();
      const headers = {};
      try {
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });
      } catch {
        // Headers enumeration fallback
      }

      const db = await getDb();
      return new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          store.put({
            url,
            data: buffer,
            headers,
            timestamp: Date.now(),
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    } catch {
      // Non-fatal cache write error
    }
  },
};
