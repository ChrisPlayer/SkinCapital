import type { KeyboardEvent } from 'react';
import type { TranslationKey } from '../../lib/i18n.tsx';
import type { ItemCategoryId } from '../../../shared/lib/item-names.ts';

// Computed once at module level: the SMIL pulse halo and view transitions are
// skipped entirely for users who prefer reduced motion.
export const REDUCED_MOTION =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

// Shared overline style for card section titles (mirrors .feed-section-title).
export const SECTION_TITLE = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400';

// Labels for the shared item categories: the TranslationKey mapping lives
// client-side while itemCategory itself stays in shared/lib.
export const CATEGORY_LABEL_KEYS: Record<ItemCategoryId, TranslationKey> = {
  knife: 'type.knife',
  gloves: 'type.gloves',
  rifle: 'type.rifle',
  pistol: 'type.pistol',
  smg: 'type.smg',
  sniper: 'type.sniper',
  heavy: 'type.heavy',
  sticker: 'type.sticker',
  case: 'type.case',
  agent: 'type.agent',
  other: 'type.other',
};

export const COUNT_FORMATTERS: Record<'fr' | 'en', Intl.NumberFormat> = {
  fr: new Intl.NumberFormat('fr-FR'),
  en: new Intl.NumberFormat('en-US'),
};

export function sourceLabel(source: 'steam' | 'csfloat' | 'skinport' | null): string {
  if (source === 'steam') return 'Steam';
  if (source === 'csfloat') return 'CSFloat';
  if (source === 'skinport') return 'Skinport';
  return '...';
}

// Keyboard activation (Enter/Space) for clickable non-button elements.
export function activationKeyDown(action: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  };
}
