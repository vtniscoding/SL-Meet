import React, { useEffect, useRef, useState } from 'react';
import {
  AlertErrorIcon,
  DownloadTranscriptIcon,
  NotificationBellIcon,
  RefreshIcon,
  SuccessCheckIcon,
  UpdateSparklesIcon,
} from '@sl-meet/shared/icons';
import { useUpdater } from '../context/UpdaterContext';

/**
 * Header Notification Bell Menu
 * Positioned alongside ProfileAvatarMenu in Home, Dashboard, and Waiting Lobby headers.
 * Surfaces pending desktop/web updates, current version badge, and manual update check.
 */
export default function NotificationBellMenu() {
  const {
    isElectron,
    currentVersion,
    availableVersion,
    status,
    updateReason,
    downloadProgress,
    errorMessage,
    hasUpdate,
    hasUnread,
    checkForUpdates,
    startDownload,
    applyUpdate,
    markAsRead,
  } = useUpdater();

  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleToggle = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next && hasUnread) {
        markAsRead();
      }
      return next;
    });
  };

  const isChecking = status === 'checking';

  const renderUpdateCard = () => {
    let title = `SLMeet v${availableVersion || currentVersion} available`;
    let description =
      'Download the latest update in the background while you work.';

    if (status === 'downloading') {
      title = `Downloading v${availableVersion || ''}...`.trim();
      description = `${downloadProgress}% complete — keep using SLMeet normally.`;
    } else if (status === 'downloaded') {
      title = `Update v${availableVersion || ''} ready`.trim();
      description =
        'Restart SLMeet to install the new version seamlessly.';
    } else if (status === 'web-reload-needed') {
      title =
        updateReason === 'version' && availableVersion
          ? `SLMeet v${availableVersion} is live`
          : 'New SLMeet build deployed';
      description =
        'Reload this page to switch to the latest release.';
    }

    return (
      <div className="rounded-xl bg-slate-50 border border-[#5CA0F2]/35 p-3 space-y-2.5">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#5CA0F2]/15 text-[#5CA0F2] flex items-center justify-center shrink-0 mt-0.5">
            <UpdateSparklesIcon className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-900 leading-snug">
              {title}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        {status === 'downloading' && (
          <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#5CA0F2] transition-all duration-200 rounded-full"
              style={{ width: `${Math.min(100, Math.max(0, downloadProgress))}%` }}
            />
          </div>
        )}

        {status === 'available' && (
          <button
            type="button"
            onClick={startDownload}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#5CA0F2] hover:bg-[#4A8FE0] text-white text-xs font-semibold transition-colors cursor-pointer outline-none shadow-2xs"
          >
            <DownloadTranscriptIcon className="w-3.5 h-3.5" />
            <span>Update Now</span>
          </button>
        )}

        {status === 'downloading' && (
          <button
            type="button"
            disabled
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-200 text-slate-600 text-xs font-semibold cursor-not-allowed outline-none"
          >
            <RefreshIcon className="w-3.5 h-3.5 animate-spin" />
            <span>Downloading ({downloadProgress}%)</span>
          </button>
        )}

        {status === 'downloaded' && (
          <button
            type="button"
            onClick={applyUpdate}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#5CA0F2] hover:bg-[#4A8FE0] text-white text-xs font-semibold transition-colors cursor-pointer outline-none shadow-2xs"
          >
            <RefreshIcon className="w-3.5 h-3.5" />
            <span>Restart &amp; Update</span>
          </button>
        )}

        {status === 'web-reload-needed' && (
          <button
            type="button"
            onClick={applyUpdate}
            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#5CA0F2] hover:bg-[#4A8FE0] text-white text-xs font-semibold transition-colors cursor-pointer outline-none shadow-2xs"
          >
            <RefreshIcon className="w-3.5 h-3.5" />
            <span>Reload Page</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <div
      className="relative"
      ref={menuRef}
      style={{ WebkitAppRegion: 'no-drag' }}
    >
      <button
        type="button"
        onClick={handleToggle}
        className={`relative w-7 h-7 rounded-full flex items-center justify-center border transition-all cursor-pointer outline-none shadow-2xs ${
          isOpen || hasUpdate
            ? 'bg-white border-[#5CA0F2]/50 text-[#5CA0F2] ring-1 ring-[#5CA0F2]/25'
            : 'bg-white/85 hover:bg-white border-slate-200/90 text-slate-600 hover:text-slate-900'
        }`}
        title="Notifications"
        aria-label="Notifications"
      >
        <NotificationBellIcon className="w-3.5 h-3.5" />
        {(hasUnread || hasUpdate) && (
          <span
            className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-[#EAECEE] ${
              hasUnread ? 'bg-[#EA4335]' : 'bg-[#5CA0F2]'
            }`}
          />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 p-3.5 z-50 animate-in fade-in duration-150 text-slate-900">
          {/* Popover Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900">
                Notifications
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E9EEF6] text-[#0B57D0]">
                v{currentVersion}
              </span>
            </div>

            <button
              type="button"
              onClick={checkForUpdates}
              disabled={isChecking || status === 'downloading'}
              className="p-1.5 rounded-lg text-slate-500 hover:text-[#5CA0F2] hover:bg-slate-100 disabled:opacity-50 transition-colors cursor-pointer outline-none"
              title="Check for updates"
              aria-label="Check for updates"
            >
              <RefreshIcon
                className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin text-[#5CA0F2]' : ''}`}
              />
            </button>
          </div>

          {/* Popover Content */}
          <div className="pt-3">
            {hasUpdate ? (
              renderUpdateCard()
            ) : status === 'error' ? (
              <div className="flex items-start gap-2.5 rounded-xl bg-red-50/70 border border-red-100 p-3">
                <AlertErrorIcon className="w-4 h-4 text-[#EA4335] shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800">
                    Update check unavailable
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5 break-words">
                    {errorMessage || 'Please try checking again shortly.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 py-2 px-1">
                <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <SuccessCheckIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800">
                    {isChecking
                      ? 'Checking for updates...'
                      : "You're up to date"}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {status === 'dev-mode'
                      ? `Development build (v${currentVersion})`
                      : `SLMeet v${currentVersion} is the latest version.`}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Popover Footer */}
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>{isElectron ? 'Desktop Client' : 'Web Client'}</span>
            <button
              type="button"
              onClick={checkForUpdates}
              disabled={isChecking || status === 'downloading'}
              className="font-semibold text-[#5CA0F2] hover:text-[#4A8FE0] disabled:opacity-50 transition-colors cursor-pointer outline-none"
            >
              {isChecking ? 'Checking...' : 'Check for updates'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

