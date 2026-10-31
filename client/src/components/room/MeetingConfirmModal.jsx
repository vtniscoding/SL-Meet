import React, { useEffect } from 'react';

/**
 * MeetingConfirmModal
 * Clean, lightweight Google Meet-style confirmation dialog.
 * Matches Google Meet specifications with a clean white card, left-aligned typography,
 * and flat blue text action buttons.
 */
export default function MeetingConfirmModal({
  isOpen = false,
  title = '',
  description = '',
  actions = [],
  onClose,
}) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 select-none animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="meet-confirm-title"
    >
      <div
        className="w-full max-w-[420px] bg-white rounded-xl shadow-2xl p-6 text-left transform transition-all animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="meet-confirm-title"
          className="text-base sm:text-[17px] font-semibold text-[#202124] tracking-tight leading-snug"
        >
          {title}
        </h3>

        {description && (
          <p className="text-sm text-[#5f6368] mt-2.5 leading-relaxed">
            {description}
          </p>
        )}

        {actions && actions.length > 0 && (
          <div className="flex items-center justify-end space-x-2 sm:space-x-3 mt-6 pt-1">
            {actions.map((act, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  act.onClick?.();
                }}
                className={`px-3 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer outline-none focus:outline-none ${
                  act.variant === 'secondary'
                    ? 'text-[#5f6368] hover:bg-slate-100 hover:text-[#202124]'
                    : 'text-[#1a73e8] hover:bg-blue-50/70 hover:text-[#1765cc]'
                }`}
              >
                {act.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
