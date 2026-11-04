import React, { useState, useRef, useEffect } from 'react';
import {
  LeaveRoomIcon as LogOut,
  SignGestureIcon,
} from '@sl-meet/shared/icons';
import ParticipantAvatar from '../../room/components/video/ParticipantAvatar';

/**
 * Standardized Profile Avatar Menu Component
 * Renders the compact circular avatar with initial or uploaded avatar and dropdown profile details + Log Out.
 */
export default function ProfileAvatarMenu({
  user,
  profile,
  onSignOut,
  isAdmin: propIsAdmin,
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const displayName = profile?.display_name || user?.email?.split('@')[0] || 'User';
  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || null;
  const isAdmin =
    propIsAdmin !== undefined
      ? propIsAdmin
      : Boolean(
          profile?.role === 'admin' ||
          user?.app_metadata?.role === 'admin' ||
          user?.user_metadata?.role === 'admin'
        );
  const adminUrl = import.meta.env.VITE_ADMIN_URL || 'http://localhost:5174';

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  if (!user) return null;

  return (
    <div
      className="relative"
      ref={menuRef}
      style={{ WebkitAppRegion: 'no-drag' }}
    >
      <button
        type="button"
        onClick={() => setIsMenuOpen((prev) => !prev)}
        className="rounded-full ring-1 ring-[#5CA0F2]/40 hover:ring-[#5CA0F2] transition-all cursor-pointer outline-none shadow-xs"
        title="Account profile"
        aria-label="Account profile"
      >
        <ParticipantAvatar
          name={displayName}
          avatarUrl={avatarUrl}
          avatarColor="#5CA0F2"
          className="w-7 h-7 text-xs"
        />
      </button>

      {isMenuOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 p-3.5 z-50 animate-in fade-in duration-150 text-slate-900">
          <div className="flex items-center space-x-3 pb-3 border-b border-slate-100">
            <ParticipantAvatar
              name={displayName}
              avatarUrl={avatarUrl}
              avatarColor="#5CA0F2"
              className="w-10 h-10 text-sm"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-bold text-slate-900 truncate">{displayName}</p>
                {isAdmin && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-[#0B57D0] uppercase tracking-wide shrink-0">
                    Admin
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>

          {/* Admin-only Access to Training & Monitoring Studio */}
          {isAdmin && (
            <div className="py-2 space-y-1 border-b border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  if (window.electronAPI?.openTrainingMonitor) {
                    window.electronAPI.openTrainingMonitor('#admin');
                  } else {
                    window.open(adminUrl, '_blank', 'noopener,noreferrer');
                  }
                }}
                className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-[#5CA0F2] rounded-lg transition-colors cursor-pointer outline-none"
              >
                <SignGestureIcon className="w-4 h-4 text-[#5CA0F2] shrink-0" />
                <span>Training and Monitoring</span>
              </button>
            </div>
          )}

          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                onSignOut?.();
              }}
              className="w-full flex items-center space-x-2.5 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer outline-none"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
