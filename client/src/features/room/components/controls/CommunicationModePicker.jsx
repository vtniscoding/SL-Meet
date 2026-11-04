import React from 'react';
import { ROLES, ROLE_META } from '@sl-meet/shared/constants';
import { CheckmarkIcon } from '@sl-meet/shared/icons';

/**
 * CommunicationModePicker
 * Clean 2-mode selector for SL-Meet:
 * - "Sign language user" (SIGNER)
 * - "Standard user" (NON_SIGNER)
 */
export default function CommunicationModePicker({
  selectedRole,
  onSelectRole,
  hasError = false,
}) {
  const modes = [
    {
      id: ROLES.SIGNER,
      label: ROLE_META[ROLES.SIGNER]?.label || 'Sign language user',
      sublabel: '(deaf and hard of hearing)',
    },
    {
      id: ROLES.NON_SIGNER,
      label: ROLE_META[ROLES.NON_SIGNER]?.label || 'Standard user',
    },
  ];

  const handleKeyDown = (e, index) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIndex = (index + 1) % modes.length;
      onSelectRole?.(modes[nextIndex].id);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIndex = (index - 1 + modes.length) % modes.length;
      onSelectRole?.(modes[prevIndex].id);
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onSelectRole?.(modes[index].id);
    }
  };

  return (
    <div className="w-full space-y-1.5" role="radiogroup" aria-label="How would you like to take part?">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-700">
          How would you like to take part?
        </label>
      </div>

      <div className="space-y-2">
        {modes.map((mode, index) => {
          const isSelected = selectedRole === mode.id;

          return (
            <div
              key={mode.id}
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected || (!selectedRole && index === 0) ? 0 : -1}
              onClick={() => onSelectRole?.(mode.id)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={`w-full text-left py-2.5 px-3.5 rounded-xl border transition-all cursor-pointer select-none focus-ring relative ${
                isSelected
                  ? 'border-[#1A73E8] bg-blue-50/70 shadow-xs ring-1 ring-[#1A73E8]/30'
                  : hasError
                  ? 'border-red-300 bg-red-50/30 hover:border-red-400'
                  : 'border-slate-200/90 bg-white hover:border-slate-300 hover:bg-slate-50/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-baseline flex-wrap gap-x-1.5 min-w-0 pr-2">
                  <span className="text-xs font-bold text-slate-900 tracking-tight">
                    {mode.label}
                  </span>
                  {mode.sublabel && (
                    <span className="text-[11px] font-normal text-slate-500">
                      {mode.sublabel}
                    </span>
                  )}
                </div>

                {/* Radio Indicator */}
                <div className="shrink-0">
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                      isSelected
                        ? 'border-[#1A73E8] bg-[#1A73E8] text-white'
                        : 'border-slate-300 bg-white'
                    }`}
                  >
                    {isSelected && <CheckmarkIcon className="w-2.5 h-2.5 stroke-[3]" />}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {hasError && !selectedRole && (
        <p className="text-[11px] text-red-500 font-medium pl-1 pt-0.5">
          Please select how you would like to take part.
        </p>
      )}
    </div>
  );
}
