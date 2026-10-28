import React, { useState, useEffect } from 'react';

/**
 * Windows 11 Native-Style Window Control Buttons
 * Minimizes, Maximizes/Restores, and Closes the frameless Electron application window.
 */
export default function WindowControls({ className = '', dark = false, onMinimize = null }) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    // Check initial maximized state if running in Electron
    if (window.electronAPI?.isMaximized) {
      window.electronAPI.isMaximized().then((max) => setIsMaximized(!!max)).catch(() => {});
    }

    // Subscribe to maximize/unmaximize state updates
    if (window.electronAPI?.onMaximizedState) {
      const cleanup = window.electronAPI.onMaximizedState((max) => {
        setIsMaximized(max);
      });
      return () => {
        if (typeof cleanup === 'function') cleanup();
      };
    }
  }, []);

  const handleMinimize = () => {
    if (onMinimize) {
      onMinimize();
    } else if (window.electronAPI?.minimize) {
      window.electronAPI.minimize();
    }
  };

  const handleToggleMaximize = () => {
    if (window.electronAPI?.toggleMaximize) {
      window.electronAPI.toggleMaximize();
    } else {
      // Browser fallback (toggle fullscreen)
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
        setIsMaximized(true);
      } else {
        document.exitFullscreen?.().catch(() => {});
        setIsMaximized(false);
      }
    }
  };

  const handleClose = () => {
    if (window.electronAPI?.close) {
      window.electronAPI.close();
    } else {
      window.close();
    }
  };

  const normalBtnClass = dark
    ? 'w-8 h-7 rounded-md flex items-center justify-center text-slate-300 hover:bg-white/15 hover:text-white active:bg-white/25 transition-colors cursor-pointer outline-none focus:outline-none'
    : 'w-8 h-7 rounded-md flex items-center justify-center text-slate-600 hover:bg-slate-300/70 hover:text-slate-900 active:bg-slate-300/90 transition-colors cursor-pointer outline-none focus:outline-none';

  const closeBtnClass = dark
    ? 'w-8 h-7 rounded-md flex items-center justify-center text-slate-300 hover:bg-[#E81123] hover:text-white active:bg-[#BF0F1D] active:text-white transition-colors cursor-pointer outline-none focus:outline-none'
    : 'w-8 h-7 rounded-md flex items-center justify-center text-slate-600 hover:bg-[#E81123] hover:text-white active:bg-[#BF0F1D] active:text-white transition-colors cursor-pointer outline-none focus:outline-none';

  return (
    <div
      className={`flex items-center space-x-1 select-none ${className}`}
      style={{ WebkitAppRegion: 'no-drag' }}
      data-tauri-drag-region="false"
    >
      {/* Minimize Button */}
      <button
        type="button"
        onClick={handleMinimize}
        className={normalBtnClass}
        title="Minimize"
        aria-label="Minimize Window"
      >
        <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
          <rect width="10" height="1" />
        </svg>
      </button>

      {/* Maximize / Restore Button */}
      <button
        type="button"
        onClick={handleToggleMaximize}
        className={normalBtnClass}
        title={isMaximized ? 'Restore Down' : 'Maximize'}
        aria-label={isMaximized ? 'Restore Down Window' : 'Maximize Window'}
      >
        {isMaximized ? (
          /* Windows 11 Restore Icon (two overlapping squares) */
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2.5 2.5V0.5H9.5V7.5H7.5" stroke="currentColor" strokeWidth="1" />
            <rect x="0.5" y="2.5" width="7" height="7" stroke="currentColor" strokeWidth="1" fill="transparent" />
          </svg>
        ) : (
          /* Windows 11 Maximize Icon (single square) */
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" strokeWidth="1" />
          </svg>
        )}
      </button>

      {/* Close Button (Hover turns red #E81123) */}
      <button
        type="button"
        onClick={handleClose}
        className={closeBtnClass}
        title="Close"
        aria-label="Close Window"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2">
          <line x1="1" y1="1" x2="9" y2="9" />
          <line x1="9" y1="1" x2="1" y2="9" />
        </svg>
      </button>
    </div>
  );
}
