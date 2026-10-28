import React from 'react';
import {
  SignGestureIcon as Hand,
  MicOnIcon as Mic,
  CloseIcon as X,
} from '../../icons';
import { ROLES } from '../../constants/roles';

/**
 * Role Prompt Modal
 * Mandatory popup asking: "Are you Deaf or hard of hearing?"
 * Yes -> assigns 'signer' role
 * No  -> assigns 'non_signer' role
 */
export default function RolePromptModal({
  isOpen,
  onSelectRole,
  onClose,
  dismissible = false,
  currentRole = null,
}) {
  if (!isOpen) return null;

  const handleSelect = (role) => {
    if (onSelectRole) {
      onSelectRole(role);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-prompt-title"
    >
      <div className="relative w-full max-w-lg bg-[#1e1f22] border border-white/10 rounded-xl shadow-2xl p-6 sm:p-7 text-white">
        {/* Dismiss button if opened from in-room Switch Role */}
        {dismissible && onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Cancel"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        )}

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 mb-3">
            <Hand size={24} />
          </div>
          <h2
            id="role-prompt-title"
            className="text-xl sm:text-2xl font-bold tracking-tight text-white"
          >
            Are you Deaf or hard of hearing?
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-2 leading-relaxed">
            Please choose how you wish to communicate in this meeting. Your choice enables the right assistive tools and avoids audio/sign conflicts.
          </p>
        </div>

        {/* Choice Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
          {/* YES -> Signer */}
          <button
            id="role-prompt-yes"
            type="button"
            onClick={() => handleSelect(ROLES.SIGNER)}
            className={`flex flex-col items-center text-center p-4 sm:p-5 rounded-lg border transition-all duration-200 group ${
              currentRole === ROLES.SIGNER
                ? 'bg-blue-600/20 border-blue-500 ring-2 ring-blue-500/30'
                : 'bg-white/[0.04] border-white/10 hover:border-blue-400/50 hover:bg-blue-500/[0.08]'
            }`}
          >
            <div className="w-12 h-12 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-3 group-hover:scale-105 transition-transform">
              <Hand size={24} />
            </div>
            <div className="text-base font-bold text-white mb-1">
              Yes, I am
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-400 mb-1.5">
              Signer Role
            </div>
            <p className="text-xs text-slate-300 leading-snug">
              Uses sign language gestures via AI camera & receives live speech captions from speakers.
            </p>
          </button>

          {/* NO -> Non-signer */}
          <button
            id="role-prompt-no"
            type="button"
            onClick={() => handleSelect(ROLES.NON_SIGNER)}
            className={`flex flex-col items-center text-center p-4 sm:p-5 rounded-lg border transition-all duration-200 group ${
              currentRole === ROLES.NON_SIGNER
                ? 'bg-emerald-600/20 border-emerald-500 ring-2 ring-emerald-500/30'
                : 'bg-white/[0.04] border-white/10 hover:border-emerald-400/50 hover:bg-emerald-500/[0.08]'
            }`}
          >
            <div className="w-12 h-12 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3 group-hover:scale-105 transition-transform">
              <Mic size={24} />
            </div>
            <div className="text-base font-bold text-white mb-1">
              No, I am hearing
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400 mb-1.5">
              Speaker Role
            </div>
            <p className="text-xs text-slate-300 leading-snug">
              Speaks verbally into microphone. Live speech-to-text will caption your voice for Signers.
            </p>
          </button>
        </div>

        {/* Footer info */}
        <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-center text-[11px] text-slate-400 text-center">
          You can change your role at any time from the meeting controls menu.
        </div>
      </div>
    </div>
  );
}
