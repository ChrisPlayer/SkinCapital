import type React from 'react';

export type View = 'dashboard' | 'inventory' | 'storage' | 'activity' | 'compare';

// Computed once at module level: the SMIL pulse halo and view transitions are
// skipped entirely for users who prefer reduced motion.
export const REDUCED_MOTION =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

// Shared overline style for card section titles (mirrors .feed-section-title).
export const SECTION_TITLE = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400';

export function sourceLabel(source: 'steam' | 'csfloat' | 'skinport' | null): string {
  if (source === 'steam') return 'Steam';
  if (source === 'csfloat') return 'CSFloat';
  if (source === 'skinport') return 'Skinport';
  return '...';
}

// Keyboard activation (Enter/Space) for clickable non-button elements.
export function activationKeyDown(action: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  };
}
