/**
 * Persistent Whisper Worker Singleton Manager.
 * Retains model in memory across view transitions so RoomView has 0ms model loading lag.
 */

let sharedWorker = null;
let isReady = false;
let currentStatus = 'idle'; // 'idle' | 'loading' | 'ready' | 'error'
let currentProgress = null; // number (0 - 100)
let currentError = null;
const listeners = new Set();

export function getWhisperWorker() {
  if (!sharedWorker) {
    try {
      currentStatus = 'loading';
      sharedWorker = new Worker(
        new URL('../workers/whisperWorker.js', import.meta.url),
        { type: 'module' }
      );

      sharedWorker.onmessage = (e) => {
        const data = e.data || {};
        if (data.type === 'status') {
          currentStatus = data.status;
          if (data.status === 'ready') {
            isReady = true;
            currentProgress = 100;
            currentError = null;
          }
        }
        if (data.type === 'progress') {
          if (data.info && typeof data.info.progress === 'number') {
            currentProgress = Math.round(data.info.progress);
          }
        }
        if (data.type === 'error') {
          currentStatus = 'error';
          currentError = data.error || 'Failed to load Whisper model';
        }
        listeners.forEach((listener) => {
          try {
            listener(data);
          } catch (err) {
            console.error('[WhisperWorkerManager] Listener error:', err);
          }
        });
      };

      sharedWorker.onerror = (err) => {
        console.error('[WhisperWorkerManager] Worker error:', err);
        currentStatus = 'error';
        currentError = err.message || 'Worker runtime error';
        listeners.forEach((listener) => {
          listener({ type: 'error', error: currentError });
        });
      };

      // Trigger background model load
      sharedWorker.postMessage({ type: 'load' });
    } catch (err) {
      console.error('[WhisperWorkerManager] Failed to create shared worker:', err);
      currentStatus = 'error';
      currentError = err.message || 'Failed to initialize worker';
    }
  }
  return sharedWorker;
}

export function getWhisperStatus() {
  return {
    isReady,
    status: isReady ? 'ready' : currentStatus,
    progress: currentProgress,
    error: currentError,
  };
}

export function subscribeWhisperWorker(listener) {
  listeners.add(listener);
  try {
    listener({ type: 'status', ...getWhisperStatus() });
  } catch (e) {}
  return () => {
    listeners.delete(listener);
  };
}

export function preloadWhisperModel() {
  const worker = getWhisperWorker();
  if (isReady) return Promise.resolve();

  return new Promise((resolve) => {
    let timeoutId = null;
    const unsub = subscribeWhisperWorker((data) => {
      if (data.type === 'status' && (data.status === 'ready' || data.status === 'error')) {
        if (timeoutId) clearTimeout(timeoutId);
        unsub();
        resolve();
      }
    });
    // Extended timeout (60s) for initial download of whisper-base (~140MB)
    // Once cached in IndexedDB, subsequent launches take < 1.5s
    timeoutId = setTimeout(() => {
      unsub();
      resolve();
    }, 60000);
  });
}
