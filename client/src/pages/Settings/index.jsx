import React from 'react';
import {
  AlertErrorIcon,
  DownloadTranscriptIcon,
  HomeNavIcon,
  ChatNavIcon,
  MeetingsNavIcon,
  MoreHorizontalNavIcon,
  SettingsNavIcon,
  NotificationBellIcon,
  RefreshIcon,
  SuccessCheckIcon,
  UpdateSparklesIcon,
} from '@sl-meet/shared/icons';
import { TitleBar } from '@sl-meet/shared';
import { ProfileAvatarMenu, useUpdater } from '../../features';
import { brandLogo } from '../../assets';

/**
 * SettingsPage Component
 * Displays application version, manual update check, and one-click update actions
 * inside the main window shell. Highlights outdated versions in red with an Update CTA.
 */
export default function SettingsPage({
  user,
  profile,
  onSignOut,
  onOpenAuthModal,
  onNavigateHome,
}) {
  const {
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
  } = useUpdater();

  const isChecking = status === 'checking';
  const isDownloading = status === 'downloading';

  const formattedLastChecked = lastCheckedAt
    ? new Date(lastCheckedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : 'Not checked yet';

  return (
    <div className="w-screen h-screen overflow-hidden bg-[#EAECEE] text-slate-900 flex flex-col font-sans select-none">
      {/* 1. Custom Frameless Window TitleBar */}
      <header
        onDoubleClick={() => window.electronAPI?.toggleMaximize?.()}
        style={{ WebkitAppRegion: 'drag' }}
        data-tauri-drag-region="true"
        className="w-full h-12 pl-4 md:pl-5 pr-3 flex items-center justify-between z-30 shrink-0 select-none bg-transparent"
      >
        {/* Top-Left: SLMeet Brand Logo */}
        <div
          style={{ WebkitAppRegion: 'no-drag' }}
          className="flex items-center"
        >
          <img
            src={brandLogo}
            alt="SLMeet Logo"
            className="h-7 md:h-8 w-auto object-contain pointer-events-auto transition-all cursor-pointer"
            onClick={onNavigateHome}
          />
        </div>

        {/* Top-Right: [Notification Bell] [Avatar / Sign In] [Window Controls] */}
        <div
          style={{ WebkitAppRegion: 'no-drag' }}
          className="flex items-center h-full space-x-2.5"
        >
          <button
            type="button"
            className="p-1.5 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer outline-none"
            title="Notifications"
            aria-label="Notifications"
          >
            <NotificationBellIcon className="w-4 h-4" />
          </button>

          {user ? (
            <ProfileAvatarMenu
              user={user}
              profile={profile}
              onSignOut={onSignOut}
            />
          ) : (
            <button
              type="button"
              onClick={() => onOpenAuthModal?.('login')}
              style={{ WebkitAppRegion: 'no-drag' }}
              className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white hover:bg-slate-100 text-[#0B57D0] border border-slate-200/80 shadow-xs transition-colors cursor-pointer"
            >
              Sign In
            </button>
          )}

          <TitleBar />
        </div>
      </header>

      {/* 2. Main Body Area: [Sidebar | Settings Card] */}
      <div className="flex-1 flex overflow-hidden px-3 pb-3 pt-1 gap-2.5 min-h-0">
        {/* Left Sidebar Rail */}
        <aside className="w-16 md:w-[70px] flex flex-col items-center justify-between py-2 shrink-0 select-none">
          {/* Top Group: Home, Chat, Meetings, More */}
          <div className="flex flex-col items-center space-y-2 w-full px-1">
            <button
              type="button"
              onClick={onNavigateHome}
              className="w-full py-2.5 rounded-xl flex flex-col items-center text-slate-500 hover:text-slate-800 hover:bg-white/60 transition-all cursor-pointer"
              title="Home"
            >
              <HomeNavIcon className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-medium">Home</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!user) onOpenAuthModal?.('login');
              }}
              className="w-full py-2.5 rounded-xl flex flex-col items-center text-slate-500 hover:text-slate-800 hover:bg-white/60 transition-all cursor-pointer"
              title="Chat"
            >
              <ChatNavIcon className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-medium">Chat</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!user) onOpenAuthModal?.('login');
              }}
              className="w-full py-2.5 rounded-xl flex flex-col items-center text-slate-500 hover:text-slate-800 hover:bg-white/60 transition-all cursor-pointer"
              title="Meetings"
            >
              <MeetingsNavIcon className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-medium">Meetings</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!user) onOpenAuthModal?.('login');
              }}
              className="w-full py-2.5 rounded-xl flex flex-col items-center text-slate-500 hover:text-slate-800 hover:bg-white/60 transition-all cursor-pointer"
              title="More"
            >
              <MoreHorizontalNavIcon className="w-5 h-5 mb-1" />
              <span className="text-[10px] font-medium">More</span>
            </button>
          </div>

          {/* Bottom Settings Button (Active) */}
          <div className="w-full px-1">
            <button
              type="button"
              className="relative w-full py-2.5 rounded-xl flex flex-col items-center bg-white shadow-xs text-[#0B57D0] transition-all cursor-pointer border border-slate-200/60"
              title={hasUpdate ? 'Settings (Update available)' : 'Settings'}
            >
              <div className="relative">
                <SettingsNavIcon className="w-5 h-5 mb-1 text-[#0B57D0]" />
                {hasUpdate && (
                  <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-[#EA4335] ring-2 ring-white" />
                )}
              </div>
              <span className="text-[10px] font-bold">Settings</span>
            </button>
          </div>
        </aside>

        {/* 3. Main Settings Content Card */}
        <main className="flex-1 bg-white rounded-xl border border-slate-200/80 shadow-xs p-6 sm:p-8 md:p-10 lg:p-12 overflow-y-auto min-h-0">
          <div className="max-w-3xl space-y-8">
            {/* Page Heading */}
            <div className="border-b border-slate-100 pb-5">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Settings
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Manage software updates, version status, and application information.
              </p>
            </div>

            {/* Software Update & Version Section */}
            <section className="space-y-4">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                Version &amp; Software Update
              </h2>

              <div
                className={`rounded-2xl border p-5 sm:p-6 transition-all ${
                  hasUpdate
                    ? 'bg-red-50/40 border-[#EA4335]/35'
                    : 'bg-[#F8FAFC] border-slate-200/80'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Left: Version & Status Details */}
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-xs font-semibold text-slate-500">
                        Current Version:
                      </span>
                      <span
                        className={`text-base sm:text-lg font-bold tracking-tight ${
                          hasUpdate ? 'text-[#EA4335]' : 'text-slate-900'
                        }`}
                      >
                        v{currentVersion}
                      </span>

                      {hasUpdate ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-red-100 text-[#EA4335]">
                          <UpdateSparklesIcon className="w-3 h-3" />
                          <span>Outdated</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                          <SuccessCheckIcon className="w-3 h-3" />
                          <span>Up to date</span>
                        </span>
                      )}
                    </div>

                    {hasUpdate ? (
                      <p className="text-xs sm:text-sm font-medium text-[#EA4335]">
                        {status === 'downloaded'
                          ? `Update v${availableVersion || ''} has been downloaded. Restart SLMeet to finish installing.`
                          : status === 'downloading'
                            ? `Downloading update v${availableVersion || ''} (${downloadProgress}%)...`
                            : updateReason === 'version' && availableVersion
                              ? `A new version (v${availableVersion}) is available. We recommend updating now for the best experience.`
                              : 'A newer build has been deployed. We recommend updating now to load the latest release.'}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500">
                        {status === 'dev-mode'
                          ? `Running local development build (v${currentVersion}).`
                          : `You are running the latest version of SLMeet (${isElectron ? 'Desktop App' : 'Web Client'}).`}
                      </p>
                    )}

                    <p className="text-[11px] text-slate-400">
                      Last checked: {formattedLastChecked}
                    </p>
                  </div>

                  {/* Right: Update CTA + Manual Check Button */}
                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    {status === 'available' && (
                      <button
                        type="button"
                        onClick={startDownload}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#5CA0F2] hover:bg-[#4A8FE0] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer outline-none"
                      >
                        <DownloadTranscriptIcon className="w-4 h-4" />
                        <span>Update Now</span>
                      </button>
                    )}

                    {status === 'downloading' && (
                      <button
                        type="button"
                        disabled
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-200 text-slate-600 text-xs font-semibold cursor-not-allowed outline-none"
                      >
                        <RefreshIcon className="w-4 h-4 animate-spin" />
                        <span>Downloading ({downloadProgress}%)</span>
                      </button>
                    )}

                    {status === 'downloaded' && (
                      <button
                        type="button"
                        onClick={applyUpdate}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#5CA0F2] hover:bg-[#4A8FE0] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer outline-none"
                      >
                        <RefreshIcon className="w-4 h-4" />
                        <span>Restart &amp; Update</span>
                      </button>
                    )}

                    {status === 'web-reload-needed' && (
                      <button
                        type="button"
                        onClick={applyUpdate}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#5CA0F2] hover:bg-[#4A8FE0] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer outline-none"
                      >
                        <RefreshIcon className="w-4 h-4" />
                        <span>Update Now</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={checkForUpdates}
                      disabled={isChecking || isDownloading}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 text-xs font-semibold shadow-2xs disabled:opacity-50 transition-colors cursor-pointer outline-none"
                    >
                      <RefreshIcon
                        className={`w-3.5 h-3.5 ${
                          isChecking ? 'animate-spin text-[#5CA0F2]' : 'text-slate-500'
                        }`}
                      />
                      <span>
                        {isChecking ? 'Checking...' : 'Check for Updates'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Download Progress Bar (Desktop background download) */}
                {isDownloading && (
                  <div className="mt-4 pt-4 border-t border-red-100">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-1.5">
                      <span>Downloading update package...</span>
                      <span>{downloadProgress}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#5CA0F2] transition-all duration-200 rounded-full"
                        style={{
                          width: `${Math.min(100, Math.max(0, downloadProgress))}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Error Feedback */}
                {status === 'error' && errorMessage && (
                  <div className="mt-4 flex items-center gap-2 text-xs text-[#EA4335] bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
                    <AlertErrorIcon className="w-4 h-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

