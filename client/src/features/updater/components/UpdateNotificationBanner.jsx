import React from 'react';
import {
  CloseIcon,
  DownloadTranscriptIcon,
  RefreshIcon,
  UpdateSparklesIcon,
} from '@sl-meet/shared/icons';
import { useUpdater } from '../context/UpdaterContext';

/**
 * Call-Safe Floating Update Notification Banner
 * Automatically hidden during active meetings (`suppressed === true`).
 * Dismissing with "Later" hides this floating toast while keeping the update accessible in NotificationBellMenu.
 */
export default function UpdateNotificationBanner({ suppressed = false }) {
  const {
    availableVersion,
    currentVersion,
    status,
    updateReason,
    downloadProgress,
    hasUpdate,
    isBannerDismissed,
    startDownload,
    applyUpdate,
    dismissBanner,
  } = useUpdater();

  if (suppressed || !hasUpdate || isBannerDismissed) {
    return null;
  }

  let title = `Update v${availableVersion || currentVersion} available`;
  let subtitle =
    'A newer desktop release is ready to download in the background.';

  if (status === 'downloading') {
    title = `Downloading SLMeet v${availableVersion || ''}...`.trim();
    subtitle = `${downloadProgress}% downloaded — your workspace stays uninterrupted.`;
  } else if (status === 'downloaded') {
    title = `SLMeet v${availableVersion || ''} is ready`.trim();
    subtitle = 'Restart the app whenever you are ready to finish updating.';
  } else if (status === 'web-reload-needed') {
    title =
      updateReason === 'version' && availableVersion
        ? `SLMeet v${availableVersion} is available`
        : 'New version deployed';
    subtitle = 'Reload the page to apply the latest updates and improvements.';
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ WebkitAppRegion: 'no-drag' }}
      className="fixed bottom-4 right-4 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200/90 p-4 text-slate-900 font-sans select-none animate-in fade-in duration-200"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#5CA0F2]/15 text-[#5CA0F2] flex items-center justify-center shrink-0">
          <UpdateSparklesIcon className="w-4 h-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs sm:text-sm font-bold text-slate-900 leading-snug">
              {title}
            </p>
            <button
              type="button"
              onClick={dismissBanner}
              className="p-1 -mr-1 -mt-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer outline-none"
              title="Dismiss"
              aria-label="Dismiss update notification"
            >
              <CloseIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            {subtitle}
          </p>

          {status === 'downloading' && (
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-3">
              <div
                className="h-full bg-[#5CA0F2] transition-all duration-200 rounded-full"
                style={{
                  width: `${Math.min(100, Math.max(0, downloadProgress))}%`,
                }}
              />
            </div>
          )}

          <div className="flex items-center gap-2 mt-3">
            {status === 'available' && (
              <button
                type="button"
                onClick={startDownload}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#5CA0F2] hover:bg-[#4A8FE0] text-white text-xs font-semibold transition-colors cursor-pointer outline-none shadow-2xs"
              >
                <DownloadTranscriptIcon className="w-3.5 h-3.5" />
                <span>Update</span>
              </button>
            )}

            {status === 'downloading' && (
              <button
                type="button"
                disabled
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold cursor-not-allowed outline-none"
              >
                <RefreshIcon className="w-3.5 h-3.5 animate-spin" />
                <span>Downloading {downloadProgress}%</span>
              </button>
            )}

            {status === 'downloaded' && (
              <button
                type="button"
                onClick={applyUpdate}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#5CA0F2] hover:bg-[#4A8FE0] text-white text-xs font-semibold transition-colors cursor-pointer outline-none shadow-2xs"
              >
                <RefreshIcon className="w-3.5 h-3.5" />
                <span>Restart &amp; Update</span>
              </button>
            )}

            {status === 'web-reload-needed' && (
              <button
                type="button"
                onClick={applyUpdate}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#5CA0F2] hover:bg-[#4A8FE0] text-white text-xs font-semibold transition-colors cursor-pointer outline-none shadow-2xs"
              >
                <RefreshIcon className="w-3.5 h-3.5" />
                <span>Reload Page</span>
              </button>
            )}

            <button
              type="button"
              onClick={dismissBanner}
              className="py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200/80 text-slate-600 text-xs font-semibold transition-colors cursor-pointer outline-none"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

