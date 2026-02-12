export function formatEur(value: number | null | undefined): string {
  if (value === null || value === undefined) return '\u2014';
  return `\u20ac${value.toFixed(2)}`;
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR');
}

export function formatDateShort(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

export function formatFloat(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return value.toFixed(8);
}
