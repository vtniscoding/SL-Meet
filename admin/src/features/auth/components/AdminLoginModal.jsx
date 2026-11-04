import React from 'react';
import { VerifiedShieldIcon, KeySecretIcon } from '@sl-meet/shared/icons';
import { TitleBar } from '@sl-meet/shared';

export default function AdminLoginModal({
  adminKey,
  setAdminKey,
  handleVerifyKey,
  authError,
  loading,
}) {
  return (
    <div className="w-screen h-screen bg-[#000000] text-white flex flex-col items-center justify-center p-4 font-sans select-none relative">
      {/* Frameless Drag Handle Bar (stops before top-right window controls) */}
      <div
        className="absolute top-0 left-0 right-36 h-10 select-none z-10"
        style={{ WebkitAppRegion: 'drag' }}
      />

      {/* Native Frameless Window Controls in Top-Right */}
      <div
        className="absolute top-3 right-4 z-50 flex items-center"
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        <TitleBar dark={true} />
      </div>

      <div className="w-full max-w-md bg-[#202124] border border-white/10 rounded-2xl p-8 shadow-2xl space-y-6 relative z-10">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-full bg-[#3C4043] text-[#8AB4F8] flex items-center justify-center mx-auto border border-white/10">
            <VerifiedShieldIcon className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Training and Monitoring</h1>
          <p className="text-xs text-slate-400">
            Model training, gesture telemetry and AI vision inspection portal
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleVerifyKey();
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Admin Secret Key
            </label>
            <div className="relative">
              <input
                type="password"
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                placeholder="Enter secret key..."
                className="w-full bg-[#131314] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#5CA0F2] transition-colors pr-10"
                autoFocus
              />
              <div className="absolute right-3.5 top-3.5 text-slate-500 pointer-events-none">
                <KeySecretIcon className="w-4 h-4" />
              </div>
            </div>
            {authError && (
              <p className="text-xs text-rose-400 mt-2 font-medium">{authError}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#5CA0F2] hover:bg-[#4A8FE0] text-slate-900 font-semibold py-3 px-4 rounded-xl text-sm transition-colors shadow-lg shadow-[#5CA0F2]/10 cursor-pointer disabled:opacity-50 border-none outline-none"
          >
            {loading ? 'Authenticating...' : 'Enter Studio'}
          </button>
        </form>
      </div>
    </div>
  );
}

