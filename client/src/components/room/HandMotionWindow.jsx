import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  FocusTargetIcon,
  PinIcon,
  UnpinIcon,
  CameraOffIcon,
  HandTrackingOnIcon,
} from '../../icons';
import { HandMotionCameraTracker } from '../../services/handMotionTracker';

/**
 * Detached OS Companion Window for 2-Hand Camera Auto-Follow Motion Tracking.
 *
 * - Spawns a frameless Electron BrowserWindow ('sl-meet-hand-motion') via native window.open
 *   so localStream & MediaPipe landmarks are shared directly in memory with zero IPC frame lag.
 * - Falls back gracefully to a floating in-room viewport if popups are blocked in a web browser.
 */
export default function HandMotionWindow({
  isOpen,
  localStream,
  isCameraOff,
  latestResultsRef,
  onClose,
}) {
  const [portalContainer, setPortalContainer] = useState(null);
  const [useInlineFallback, setUseInlineFallback] = useState(false);
  const [isAutoFollow, setIsAutoFollow] = useState(true);
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(true);
  const [hudStats, setHudStats] = useState({
    handCount: 0,
    zoomFactor: 1.0,
    gesture: '',
    confidence: 0,
  });

  const childWinRef = useRef(null);
  const canvasRef = useRef(null);
  const mirrorVideoRef = useRef(null);
  const trackerRef = useRef(null);
  const isProgrammaticCloseRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const lastHudSyncRef = useRef(0);

  if (!trackerRef.current) {
    trackerRef.current = new HandMotionCameraTracker();
  }

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    trackerRef.current?.setAutoFollow(isAutoFollow);
  }, [isAutoFollow]);

  // 1. Open / Close Detached Electron OS Companion Window
  useEffect(() => {
    if (!isOpen) {
      isProgrammaticCloseRef.current = true;
      if (childWinRef.current && !childWinRef.current.closed) {
        if (window.electronAPI?.closeHandMotion) {
          window.electronAPI.closeHandMotion();
        } else {
          childWinRef.current.close();
        }
      }
      childWinRef.current = null;
      setPortalContainer(null);
      setUseInlineFallback(false);
      trackerRef.current?.reset();
      return;
    }

    isProgrammaticCloseRef.current = false;
    setIsAlwaysOnTop(true);

    const childWin = window.open(
      '',
      'sl-meet-hand-motion',
      'width=440,height=340,resizable=yes'
    );

    if (!childWin || childWin.closed || !childWin.document) {
      setUseInlineFallback(true);
      return;
    }

    childWinRef.current = childWin;
    setUseInlineFallback(false);

    const doc = childWin.document;
    doc.title = 'AI Hand Motion';
    doc.documentElement.style.backgroundColor = '#202124';
    doc.documentElement.style.height = '100%';
    doc.body.style.margin = '0';
    doc.body.style.padding = '0';
    doc.body.style.height = '100%';
    doc.body.style.overflow = 'hidden';
    doc.body.style.backgroundColor = '#202124';
    doc.body.style.userSelect = 'none';

    // Sync stylesheets from main window into detached child window (supports Vite dev HMR & prod CSS)
    const syncStyles = () => {
      if (childWin.closed) return;
      doc.head.innerHTML = '';
      const titleEl = doc.createElement('title');
      titleEl.textContent = 'AI Hand Motion';
      doc.head.appendChild(titleEl);

      const styleNodes = window.document.head.querySelectorAll(
        'style, link[rel="stylesheet"]'
      );
      styleNodes.forEach((node) => {
        doc.head.appendChild(node.cloneNode(true));
      });
    };

    syncStyles();

    const headObserver = new MutationObserver(() => {
      syncStyles();
    });
    headObserver.observe(window.document.head, {
      childList: true,
      subtree: true,
    });

    let rootEl = doc.getElementById('sl-meet-motion-root');
    if (!rootEl) {
      rootEl = doc.createElement('div');
      rootEl.id = 'sl-meet-motion-root';
      rootEl.style.width = '100vw';
      rootEl.style.height = '100vh';
      rootEl.style.overflow = 'hidden';
      doc.body.innerHTML = '';
      doc.body.appendChild(rootEl);
    }
    setPortalContainer(rootEl);

    const handleExternalClose = () => {
      if (!isProgrammaticCloseRef.current) {
        childWinRef.current = null;
        setPortalContainer(null);
        onCloseRef.current?.();
      }
    };

    childWin.addEventListener('pagehide', handleExternalClose);
    let removeIpcListener = null;
    if (window.electronAPI?.onHandMotionClosed) {
      removeIpcListener = window.electronAPI.onHandMotionClosed(handleExternalClose);
    }

    return () => {
      isProgrammaticCloseRef.current = true;
      headObserver.disconnect();
      childWin.removeEventListener('pagehide', handleExternalClose);
      if (typeof removeIpcListener === 'function') {
        removeIpcListener();
      }
      if (!childWin.closed) {
        if (window.electronAPI?.closeHandMotion) {
          window.electronAPI.closeHandMotion();
        } else {
          childWin.close();
        }
      }
      childWinRef.current = null;
      setPortalContainer(null);
    };
  }, [isOpen]);

  // 2. Attach shared in-memory MediaStream to hidden video element (zero duplicate hardware lock)
  useEffect(() => {
    const videoEl = mirrorVideoRef.current;
    if (!videoEl) return;

    if (isOpen && localStream && !isCameraOff) {
      if (videoEl.srcObject !== localStream) {
        videoEl.srcObject = localStream;
      }
      videoEl.play().catch(() => {});
    } else {
      videoEl.srcObject = null;
    }
  }, [isOpen, localStream, isCameraOff, portalContainer, useInlineFallback]);

  // 3. 60 FPS VSync Canvas Render Loop inside target window
  useEffect(() => {
    if (!isOpen || (!portalContainer && !useInlineFallback)) return;

    const targetWin = childWinRef.current && !childWinRef.current.closed
      ? childWinRef.current
      : window;

    let rafId = null;
    let isCancelled = false;

    const renderLoop = () => {
      if (isCancelled) return;

      const canvas = canvasRef.current;
      const videoEl = mirrorVideoRef.current;

      if (canvas && !isCameraOff) {
        const dpr = Math.min(targetWin.devicePixelRatio || 1, 2);
        const displayW = Math.max(1, Math.floor(canvas.clientWidth * dpr));
        const displayH = Math.max(1, Math.floor(canvas.clientHeight * dpr));

        if (canvas.width !== displayW || canvas.height !== displayH) {
          canvas.width = displayW;
          canvas.height = displayH;
        }

        const ctx = canvas.getContext('2d');
        if (ctx) {
          const payload = latestResultsRef?.current || null;
          const metrics = trackerRef.current.renderFrame(ctx, videoEl, payload);

          const now = Date.now();
          if (now - lastHudSyncRef.current >= 140) {
            lastHudSyncRef.current = now;
            const liveGesture =
              payload && now - (payload.updatedAt || 0) < 500
                ? payload.gesture || ''
                : '';
            const liveConf =
              payload && now - (payload.updatedAt || 0) < 500
                ? payload.confidence || 0
                : 0;

            setHudStats((prev) => {
              if (
                prev.handCount === metrics.handCount &&
                prev.zoomFactor === metrics.zoomFactor &&
                prev.gesture === liveGesture &&
                prev.confidence === liveConf
              ) {
                return prev;
              }
              return {
                handCount: metrics.handCount,
                zoomFactor: metrics.zoomFactor,
                gesture: liveGesture,
                confidence: liveConf,
              };
            });
          }
        }
      }

      rafId = targetWin.requestAnimationFrame(renderLoop);
    };

    rafId = targetWin.requestAnimationFrame(renderLoop);

    return () => {
      isCancelled = true;
      if (rafId !== null) {
        targetWin.cancelAnimationFrame(rafId);
      }
    };
  }, [isOpen, isCameraOff, latestResultsRef, portalContainer, useInlineFallback]);

  const handleMinimize = useCallback(() => {
    if (window.electronAPI?.minimizeHandMotion) {
      window.electronAPI.minimizeHandMotion();
    }
  }, []);

  const handleTogglePin = useCallback(async () => {
    if (window.electronAPI?.toggleHandMotionPin) {
      const pinned = await window.electronAPI.toggleHandMotionPin();
      setIsAlwaysOnTop(Boolean(pinned));
    }
  }, []);

  const handleRequestClose = useCallback(() => {
    isProgrammaticCloseRef.current = true;
    if (window.electronAPI?.closeHandMotion) {
      window.electronAPI.closeHandMotion();
    } else if (childWinRef.current && !childWinRef.current.closed) {
      childWinRef.current.close();
    }
    onCloseRef.current?.();
  }, []);

  if (!isOpen) return null;

  const isElectronEnv = Boolean(window.electronAPI?.isElectron);
  const validGesture =
    hudStats.gesture && hudStats.gesture !== 'Signing...' ? hudStats.gesture : '';

  const content = (
    <div className="w-full h-full bg-[#202124] text-white flex flex-col overflow-hidden font-sans select-none border border-white/10">
      {/* Frameless Draggable Header Bar */}
      <header
        style={{ WebkitAppRegion: 'drag' }}
        className="h-9 px-3 bg-[#202124] border-b border-white/10 flex items-center justify-between shrink-0"
      >
        <div className="flex items-center space-x-2 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
              !isCameraOff && hudStats.handCount > 0
                ? 'bg-[#10B981] shadow-[0_0_8px_rgba(16,185,129,0.75)]'
                : 'bg-[#8AB4F8]/70'
            }`}
          />
          <HandTrackingOnIcon className="w-3.5 h-3.5 text-[#8AB4F8] shrink-0" />
          <span className="text-xs font-semibold text-slate-100 truncate">
            AI Hand Motion
          </span>
          {!isCameraOff && (
            <span className="px-1.5 py-0.5 rounded-full bg-[#3C4043] text-[10px] font-medium text-slate-200 shrink-0">
              {hudStats.zoomFactor.toFixed(1)}x •{' '}
              {hudStats.handCount === 0
                ? 'Scanning'
                : hudStats.handCount === 1
                ? '1 Hand'
                : '2 Hands'}
            </span>
          )}
        </div>

        {/* Window Controls (no-drag) */}
        <div
          style={{ WebkitAppRegion: 'no-drag' }}
          className="flex items-center space-x-1 shrink-0"
        >
          {/* Auto-Follow Camera Toggle */}
          <button
            type="button"
            onClick={() => setIsAutoFollow((prev) => !prev)}
            className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors cursor-pointer outline-none ${
              isAutoFollow
                ? 'bg-[#8AB4F8] text-[#202124]'
                : 'bg-[#3C4043] hover:bg-[#474B4F] text-slate-300'
            }`}
            title={
              isAutoFollow
                ? 'Auto-Follow Zoom: ON (Click to lock 1.0x frame)'
                : 'Auto-Follow Zoom: OFF (Click to track hands)'
            }
          >
            <FocusTargetIcon className="w-3.5 h-3.5" />
          </button>

          {/* Always-on-Top Pin Toggle (Electron only) */}
          {isElectronEnv && !useInlineFallback && (
            <button
              type="button"
              onClick={handleTogglePin}
              className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors cursor-pointer outline-none ${
                isAlwaysOnTop
                  ? 'bg-[#8AB4F8]/20 text-[#8AB4F8] hover:bg-[#8AB4F8]/30'
                  : 'text-slate-300 hover:bg-white/15 hover:text-white'
              }`}
              title={isAlwaysOnTop ? 'Unpin Always-on-Top' : 'Pin Always-on-Top'}
            >
              {isAlwaysOnTop ? (
                <PinIcon className="w-3.5 h-3.5" />
              ) : (
                <UnpinIcon className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {/* Minimize to Taskbar (Keeps AI-Vision running in background) */}
          {isElectronEnv && !useInlineFallback && (
            <button
              type="button"
              onClick={handleMinimize}
              className="w-6 h-6 rounded-md flex items-center justify-center text-slate-300 hover:bg-white/15 hover:text-white transition-colors cursor-pointer outline-none"
              title="Minimize window (keeps AI-Vision active)"
            >
              <svg width="9" height="1" viewBox="0 0 9 1" fill="currentColor">
                <rect width="9" height="1" />
              </svg>
            </button>
          )}

          {/* Close Window (Turns OFF AI-Vision) */}
          <button
            type="button"
            onClick={handleRequestClose}
            className="w-6 h-6 rounded-md flex items-center justify-center text-slate-300 hover:bg-[#EA4335] hover:text-white transition-colors cursor-pointer outline-none"
            title="Close & Turn OFF AI-Vision"
          >
            <svg
              width="9"
              height="9"
              viewBox="0 0 10 10"
              stroke="currentColor"
              strokeWidth="1.4"
            >
              <line x1="1" y1="1" x2="9" y2="9" />
              <line x1="9" y1="1" x2="1" y2="9" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main Motion Viewport */}
      <div className="relative flex-1 w-full min-h-0 bg-black flex items-center justify-center overflow-hidden">
        {/* Hidden shared-stream video source inside target window context */}
        <video
          ref={mirrorVideoRef}
          muted
          playsInline
          autoPlay
          className="hidden"
        />

        {isCameraOff ? (
          <div className="flex flex-col items-center justify-center text-slate-400 space-y-2 p-4 text-center">
            <div className="w-11 h-11 rounded-full bg-[#3C4043] flex items-center justify-center text-slate-300">
              <CameraOffIcon className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium text-slate-300">
              Camera is turned off
            </span>
          </div>
        ) : (
          <>
            <canvas ref={canvasRef} className="w-full h-full block" />

            {/* Subtle Bottom Gesture & Hand Legend Overlay */}
            <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
              <div className="flex items-center space-x-2 bg-[#202124]/80 backdrop-blur-md border border-white/10 rounded-full px-2.5 py-1 text-[11px] text-slate-200">
                <span className="flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                  <span>L</span>
                </span>
                <span className="text-white/25">•</span>
                <span className="flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-[#5CA0F2]" />
                  <span>R</span>
                </span>
              </div>

              {validGesture && (
                <div className="bg-[#202124]/90 backdrop-blur-md border border-[#8AB4F8]/40 rounded-full px-3 py-1 flex items-center space-x-1.5 shadow-lg">
                  <span className="text-xs font-bold text-[#8AB4F8] tracking-wide">
                    {validGesture}
                  </span>
                  {hudStats.confidence > 0 && (
                    <span className="text-[10px] text-slate-300 font-medium">
                      {Math.round(hudStats.confidence * 100)}%
                    </span>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );

  if (useInlineFallback) {
    return (
      <div className="fixed top-14 right-6 w-[380px] h-[280px] rounded-xl overflow-hidden shadow-2xl z-50">
        {content}
      </div>
    );
  }

  if (!portalContainer) return null;
  return createPortal(content, portalContainer);
}

