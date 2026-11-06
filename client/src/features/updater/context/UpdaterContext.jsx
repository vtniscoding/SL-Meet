import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getSocket, isNewerVersion } from '@sl-meet/shared';

/* global __APP_VERSION__, __BUILD_TIMESTAMP__ */
const FALLBACK_VERSION =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.0.0';
const CURRENT_BUILD_TIMESTAMP =
  typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : '';

const WEB_POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const VISIBILITY_THROTTLE_MS = 60 * 1000; // 60 seconds

const UpdaterContext = createContext(null);

export function UpdaterProvider({ children }) {
  const isElectron =
    typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);

  const [currentVersion, setCurrentVersion] = useState(FALLBACK_VERSION);
  const [availableVersion, setAvailableVersion] = useState(null);
  const [status, setStatus] = useState('idle');
  // status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'web-reload-needed' | 'up-to-date' | 'dev-mode' | 'error'
  const [updateReason, setUpdateReason] = useState(null); // 'version' | 'build' | null
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);
  const [lastCheckedAt, setLastCheckedAt] = useState(null);

  const currentVersionRef = useRef(currentVersion);
  const lastWebCheckMsRef = useRef(0);

  useEffect(() => {
    currentVersionRef.current = currentVersion;
  }, [currentVersion]);

  // Sync runtime version from Electron Main Process when running on Desktop
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.getAppVersion) return;
    let active = true;
    window.electronAPI
      .getAppVersion()
      .then((ver) => {
        if (active && ver) {
          setCurrentVersion(ver);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isElectron]);

  // Desktop Electron Auto-Updater Event Subscription
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onUpdateStatus) return undefined;

    const unsubscribe = window.electronAPI.onUpdateStatus((payload) => {
      if (!payload || !payload.status) return;

      switch (payload.status) {
        case 'checking':
          setStatus((prev) =>
            ['available', 'downloading', 'downloaded'].includes(prev)
              ? prev
              : 'checking'
          );
          setErrorMessage(null);
          break;

        case 'available':
          setStatus('available');
          setAvailableVersion(payload.version || null);
          setUpdateReason('version');
          setErrorMessage(null);
          setLastCheckedAt(new Date().toISOString());
          break;

        case 'not-available':
          setStatus((prev) =>
            ['available', 'downloading', 'downloaded'].includes(prev)
              ? prev
              : 'up-to-date'
          );
          setErrorMessage(null);
          setLastCheckedAt(new Date().toISOString());
          break;

        case 'dev-mode':
          setStatus('dev-mode');
          setErrorMessage(null);
          setLastCheckedAt(new Date().toISOString());
          break;

        case 'downloading':
          setStatus('downloading');
          setDownloadProgress(
            typeof payload.percent === 'number' ? payload.percent : 0
          );
          setErrorMessage(null);
          break;

        case 'downloaded':
          setStatus('downloaded');
          if (payload.version) {
            setAvailableVersion(payload.version);
          }
          setDownloadProgress(100);
          setErrorMessage(null);
          break;

        case 'error':
          setStatus((prev) =>
            ['available', 'downloading', 'downloaded'].includes(prev)
              ? prev
              : 'error'
          );
          setErrorMessage(payload.message || 'Unable to check for updates.');
          setLastCheckedAt(new Date().toISOString());
          break;

        default:
          break;
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [isElectron]);

  // Web Manifest Polling (/version.json) for Render / Static Hosting
  const checkWebManifest = useCallback(
    async (isManual = false) => {
      if (isElectron || typeof window === 'undefined') return;

      lastWebCheckMsRef.current = Date.now();
      if (isManual) {
        setStatus((prev) =>
          prev === 'web-reload-needed' ? prev : 'checking'
        );
        setErrorMessage(null);
      }

      try {
        const res = await fetch(`./version.json?t=${Date.now()}`, {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });

        if (!res.ok) {
          if (isManual) {
            setStatus((prev) =>
              prev === 'web-reload-needed' ? prev : 'up-to-date'
            );
          }
          return;
        }

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          if (isManual) {
            setStatus((prev) =>
              prev === 'web-reload-needed' ? prev : 'up-to-date'
            );
          }
          return;
        }

        const remote = await res.json();
        setLastCheckedAt(new Date().toISOString());

        const newerSemver = isNewerVersion(
          currentVersionRef.current,
          remote?.version
        );
        const newerBuild = Boolean(
          import.meta.env.PROD &&
            CURRENT_BUILD_TIMESTAMP &&
            remote?.buildTime &&
            remote.buildTime !== CURRENT_BUILD_TIMESTAMP
        );

        if (newerSemver || newerBuild) {
          setAvailableVersion(remote?.version || currentVersionRef.current);
          setUpdateReason(newerSemver ? 'version' : 'build');
          setStatus('web-reload-needed');
          setErrorMessage(null);
        } else {
          setStatus((prev) =>
            prev === 'web-reload-needed' ? prev : 'up-to-date'
          );
          setErrorMessage(null);
        }
      } catch {
        if (isManual) {
          setStatus((prev) =>
            prev === 'web-reload-needed' ? prev : 'error'
          );
          setErrorMessage('Could not reach update server.');
        }
      }
    },
    [isElectron]
  );

  useEffect(() => {
    if (isElectron || typeof window === 'undefined') return undefined;

    checkWebManifest(false);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastWebCheckMsRef.current;
        if (elapsed >= VISIBILITY_THROTTLE_MS) {
          checkWebManifest(false);
        }
      }
    };

    const intervalId = window.setInterval(() => {
      checkWebManifest(false);
    }, WEB_POLL_INTERVAL_MS);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isElectron, checkWebManifest]);

  // Passive Socket.io `server_info` version telemetry listener
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let socketInstance = null;
    const handleServerInfo = (info) => {
      const remoteVer = info?.version;
      if (!remoteVer || !isNewerVersion(currentVersionRef.current, remoteVer)) {
        return;
      }

      if (isElectron) {
        window.electronAPI?.checkForUpdates?.();
      } else {
        setAvailableVersion(remoteVer);
        setUpdateReason('version');
        setStatus('web-reload-needed');
      }
    };

    try {
      socketInstance = getSocket();
      socketInstance?.on('server_info', handleServerInfo);
    } catch {
      // Ignore socket initialization errors in isolated contexts
    }

    return () => {
      socketInstance?.off('server_info', handleServerInfo);
    };
  }, [isElectron]);

  const checkForUpdates = useCallback(async () => {
    if (isElectron) {
      if (!window.electronAPI?.checkForUpdates) return;
      setStatus((prev) =>
        ['available', 'downloading', 'downloaded'].includes(prev)
          ? prev
          : 'checking'
      );
      setErrorMessage(null);
      await window.electronAPI.checkForUpdates();
    } else {
      await checkWebManifest(true);
    }
  }, [isElectron, checkWebManifest]);

  const startDownload = useCallback(async () => {
    if (!isElectron || !window.electronAPI?.downloadUpdate) return;
    setStatus('downloading');
    setDownloadProgress(0);
    setErrorMessage(null);
    await window.electronAPI.downloadUpdate();
  }, [isElectron]);

  const applyUpdate = useCallback(async () => {
    if (isElectron) {
      await window.electronAPI?.installUpdate?.();
      return;
    }

    try {
      if ('caches' in window) {
        const keys = await window.caches.keys();
        await Promise.all(keys.map((key) => window.caches.delete(key)));
      }
    } catch {
      // Ignore CacheStorage cleanup errors before reload
    }
    window.location.reload();
  }, [isElectron]);

  const hasUpdate = useMemo(
    () =>
      ['available', 'downloading', 'downloaded', 'web-reload-needed'].includes(
        status
      ),
    [status]
  );

  const value = useMemo(
    () => ({
      isElectron,
      currentVersion,
      availableVersion,
      status,
      updateReason,
      downloadProgress,
      errorMessage,
      lastCheckedAt,
      hasUpdate,
      checkForUpdates,
      startDownload,
      applyUpdate,
    }),
    [
      isElectron,
      currentVersion,
      availableVersion,
      status,
      updateReason,
      downloadProgress,
      errorMessage,
      lastCheckedAt,
      hasUpdate,
      checkForUpdates,
      startDownload,
      applyUpdate,
    ]
  );

  return (
    <UpdaterContext.Provider value={value}>{children}</UpdaterContext.Provider>
  );
}

export function useUpdater() {
  const ctx = useContext(UpdaterContext);
  if (!ctx) {
    throw new Error('useUpdater must be used within an UpdaterProvider');
  }
  return ctx;
}
