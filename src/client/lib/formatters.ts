import { applyFees, type Locale, type PriceProvider } from './i18n.tsx';
import type { ItemGroup } from '../../shared/types/inventory.ts';

const DATE_LOCALES: Record<Locale, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
};

// Cached per locale: Intl.NumberFormat construction is expensive and formatEur
// runs on every row of every list.
const EUR_FORMATTERS: Record<Locale, Intl.NumberFormat> = {
  fr: new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }),
  en: new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR' }),
};

// formatEur has ~50 call sites with no access to the i18n context, so the active
// locale lives at module level and is kept in sync by I18nProvider.
let formatterLocale: Locale = 'fr';

export function setFormatterLocale(locale: Locale): void {
  formatterLocale = locale;
}

export function formatEur(value: number | null | undefined, provider?: PriceProvider): string {
  if (value === null || value === undefined) return '\u2014';
  const adjusted = provider ? applyFees(value, provider) : value;
  if (adjusted === null) return '\u2014';
  return EUR_FORMATTERS[formatterLocale].format(adjusted);
}

/**
 * Client-side P&L on ONE shared basis across every surface (hero, AssetRow,
 * ItemDetailModal): market side = applyFees(item.total, pp) — net-of-fees in
 * steam_fees mode, stickers included (item.total already carries stickerValue;
 * applyFees is a no-op for every other provider). Sums over groups that have a
 * buy price; count is the number of such groups.
 */
export function computePnl(
  items: ItemGroup[],
  pp: PriceProvider,
): { invested: number; pnl: number; count: number } {
  let invested = 0;
  let market = 0;
  let count = 0;
  for (const item of items) {
    if (item.buyPrice == null) continue;
    invested += item.buyPrice * item.quantity;
    market += applyFees(item.total, pp) ?? 0;
    count += 1;
  }
  return { invested, pnl: market - invested, count };
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

export function formatDate(dateStr: string, locale: Locale = 'fr'): string {
  return new Date(dateStr).toLocaleDateString(DATE_LOCALES[locale]);
}

export function formatDateShort(dateStr: string, locale: Locale = 'fr'): string {
  return new Date(dateStr).toLocaleDateString(DATE_LOCALES[locale], { day: '2-digit', month: 'short' });
}

export function formatFloat(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return value.toFixed(8);
}
