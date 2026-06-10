import type { ReactNode } from 'react';

interface ControlButtonProps {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

// Canonical pill (text or icon+text) used by the dashboard header actions,
// period toggles, and settings mode pills — one style to rule them all.
export function PillButton({ active, onClick, children, title, ariaLabel, disabled }: ControlButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 h-10 px-3 rounded-xl text-sm transition-all border disabled:opacity-50 ${
        active
          ? 'text-[color:var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]'
          : 'bg-white/[0.02] text-gray-400 border-white/[0.08] hover:text-white hover:border-white/[0.16]'
      }`}
    >
      {children}
    </button>
  );
}

// Square icon-only sibling of PillButton (view mode / density toggles).
export function GhostIconButton({ active, onClick, children, title, ariaLabel, disabled }: ControlButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      className={`inline-flex items-center justify-center w-10 h-10 rounded-xl transition-all border disabled:opacity-50 ${
        active
          ? 'text-[color:var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_10%,transparent)] border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]'
          : 'bg-white/[0.02] text-gray-500 border-white/[0.08] hover:text-white hover:border-white/[0.16]'
      }`}
    >
      {children}
    </button>
  );
}
