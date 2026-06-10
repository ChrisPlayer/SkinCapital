import type { WearLevel } from '../types/inventory.ts';

export function getWearLevel(floatValue: number | null | undefined): WearLevel | null {
  if (floatValue === null || floatValue === undefined) return null;
  if (floatValue < 0.07) return { name: 'Factory New', short: 'FN', color: '#4CAF50' };
  if (floatValue < 0.15) return { name: 'Minimal Wear', short: 'MW', color: '#8BC34A' };
  if (floatValue < 0.38) return { name: 'Field-Tested', short: 'FT', color: '#FFC107' };
  if (floatValue < 0.45) return { name: 'Well-Worn', short: 'WW', color: '#FF9800' };
  return { name: 'Battle-Scarred', short: 'BS', color: '#F44336' };
}

export function getWearName(floatValue: number | null | undefined): string | null {
  const level = getWearLevel(floatValue);
  return level?.name ?? null;
}

const WEAR_BY_TOKEN: Record<string, WearLevel> = {
  'factory new': { name: 'Factory New', short: 'FN', color: '#4CAF50' },
  fn: { name: 'Factory New', short: 'FN', color: '#4CAF50' },
  'minimal wear': { name: 'Minimal Wear', short: 'MW', color: '#8BC34A' },
  mw: { name: 'Minimal Wear', short: 'MW', color: '#8BC34A' },
  'field-tested': { name: 'Field-Tested', short: 'FT', color: '#FFC107' },
  'field tested': { name: 'Field-Tested', short: 'FT', color: '#FFC107' },
  ft: { name: 'Field-Tested', short: 'FT', color: '#FFC107' },
  'well-worn': { name: 'Well-Worn', short: 'WW', color: '#FF9800' },
  'well worn': { name: 'Well-Worn', short: 'WW', color: '#FF9800' },
  ww: { name: 'Well-Worn', short: 'WW', color: '#FF9800' },
  'battle-scarred': { name: 'Battle-Scarred', short: 'BS', color: '#F44336' },
  'battle scarred': { name: 'Battle-Scarred', short: 'BS', color: '#F44336' },
  bs: { name: 'Battle-Scarred', short: 'BS', color: '#F44336' },
};

export function getWearFromMarketHashName(marketHashName: string): WearLevel | null {
  const match = /\(([^)]+)\)\s*$/.exec(marketHashName);
  if (!match) return null;
  const token = match[1].trim().toLowerCase();
  return WEAR_BY_TOKEN[token] ?? null;
}
