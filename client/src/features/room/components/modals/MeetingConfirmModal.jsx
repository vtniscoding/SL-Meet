import React, { useEffect } from 'react';

/**
 * MeetingConfirmModal
 * SLMeet Dark Theme Confirmation Modal with rounded pill containers and actions.
 * Strictly icon-free, elegant typography, with distinct brand Sky Blue, danger red,
 * and neutral slate pill variants.
 */
export default function MeetingConfirmModal({
  isOpen = false,
  title = '',
  description = '',
  infoPill = '',
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
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs select-none animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="meet-confirm-title"
    >
      <div
        className="w-full max-w-[500px] bg-[#28292C] border border-[#3C4043] rounded-2xl shadow-2xl p-6 sm:p-7 text-left transform-gpu animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="meet-confirm-title"
          className="text-lg sm:text-[19px] font-bold text-white tracking-tight leading-snug"
        >
          {title}
        </h3>

        {description && (
          <p className="text-sm text-slate-300 mt-2.5 leading-relaxed">
            {description}
          </p>
        )}

        {infoPill && (
          <div className="mt-4 px-4 py-3 bg-[#3C4043]/40 border border-[#3C4043] rounded-xl text-xs text-slate-300 leading-relaxed">
            {infoPill}
          </div>
        )}

        {actions && actions.length > 0 && (
          <div className="flex flex-row items-center justify-end gap-2.5 sm:gap-3 mt-6 pt-1 flex-nowrap">
            {actions.map((act, idx) => {
              let btnStyle = 'bg-[#3C4043] hover:bg-[#474B4F] text-slate-200';
              if (act.variant === 'brand' || act.variant === 'primary') {
                btnStyle = 'bg-[#5CA0F2] hover:bg-[#4A8FE0] text-white shadow-md shadow-blue-500/20';
              } else if (act.variant === 'danger') {
                btnStyle = 'bg-[#EA4335] hover:bg-[#D93025] text-white shadow-md shadow-red-500/20';
              } else if (act.variant === 'ghost') {
                btnStyle = 'bg-transparent hover:bg-white/10 text-slate-400 hover:text-white';
              }

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    act.onClick?.();
                  }}
                  className={`whitespace-nowrap px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-semibold rounded-full transition-all cursor-pointer outline-none focus:outline-none active:scale-95 shrink-0 ${btnStyle}`}
                >
                  {act.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
