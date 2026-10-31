import React from 'react';
import {
  SignGestureIcon as Hand,
  MicOnIcon as Mic,
  CloseIcon as X,
  CheckmarkIcon,
} from '../../icons';
import { ROLES, ROLE_META } from '../../constants/roles';

/**
 * Role Prompt Modal
 * Allows switching communication mode in-room:
 * - "Sign language user" (SIGNER)
 * - "Standard user" (NON_SIGNER)
 */
export default function RolePromptModal({
  isOpen,
  onSelectRole,
  onClose,
  dismissible = true,
  currentRole = null,
}) {
  if (!isOpen) return null;

  const handleSelect = (role) => {
    if (onSelectRole) {
      onSelectRole(role);
    }
  };

  const modes = [
    {
      id: ROLES.SIGNER,
      label: ROLE_META[ROLES.SIGNER]?.label || 'Sign language user',
      description: ROLE_META[ROLES.SIGNER]?.description || 'Use camera for sign detection and read live captions of speech.',
      icon: Hand,
      tag: 'Camera AI · Live Captions',
    },
    {
      id: ROLES.NON_SIGNER,
      label: ROLE_META[ROLES.NON_SIGNER]?.label || 'Standard user',
      description: ROLE_META[ROLES.NON_SIGNER]?.description || 'Use microphone to speak, read sign translations and live speech captions.',
      icon: Mic,
      tag: 'Voice Mic · Translations',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-prompt-title"
    >
      <div className="relative w-full max-w-lg bg-[#1e1f22] border border-white/10 rounded-2xl shadow-2xl p-6 sm:p-7 text-white">
        {/* Dismiss button */}
        {dismissible && onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Cancel"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        )}

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-500/10 border border-blue-500/20 text-[#5CA0F2] mb-3">
            <Hand size={24} />
          </div>
          <h2
            id="role-prompt-title"
            className="text-xl sm:text-2xl font-bold tracking-tight text-white"
          >
            Switch Communication Mode
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-2 leading-relaxed">
            Choose how you participate in this meeting. Your choice enables the right assistive tools.
          </p>
        </div>

        {/* Choice Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
          {modes.map((mode) => {
            const isSelected = currentRole === mode.id;
            const Icon = mode.icon;

            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => handleSelect(mode.id)}
                className={`flex flex-col items-center text-center p-4 sm:p-5 rounded-xl border transition-all duration-200 group cursor-pointer relative ${
                  isSelected
                    ? 'bg-blue-600/20 border-[#1A73E8] ring-2 ring-[#1A73E8]/30 shadow-md'
                    : 'bg-white/[0.04] border-white/10 hover:border-blue-400/50 hover:bg-blue-500/[0.08]'
                }`}
              >
                {isSelected && (
                  <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-[#1A73E8] text-white flex items-center justify-center shadow-xs">
                    <CheckmarkIcon className="w-3 h-3 stroke-[3]" />
                  </div>
                )}

                <div className="w-12 h-12 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-[#5CA0F2] mb-3 group-hover:scale-105 transition-transform">
                  <Icon size={24} />
                </div>
                <div className="text-base font-bold text-white mb-1">
                  {mode.label}
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#5CA0F2] mb-2 px-2 py-0.5 rounded-full bg-blue-500/10">
                  {mode.tag}
                </div>
                <p className="text-xs text-slate-300 leading-snug">
                  {mode.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
