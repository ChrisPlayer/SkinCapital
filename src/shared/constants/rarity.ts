import type { Rarity } from '../types/inventory.ts';

export function getItemRarity(marketHashName: string): Rarity {
  const name = marketHashName.toLowerCase();

  if (name.includes('\u2605') || name.startsWith('\u2605')) {
    return { name: 'Extraordinary', color: '#FFD700', bg: 'rgba(255, 215, 0, 0.15)' };
  }
  if (name.includes('stattrak')) {
    return { name: 'StatTrak', color: '#CF6A32', bg: 'rgba(207, 106, 50, 0.15)' };
  }
  if (name.includes('souvenir')) {
    return { name: 'Souvenir', color: '#FFD700', bg: 'rgba(255, 215, 0, 0.15)' };
  }
  if (name.includes('pin')) {
    return { name: 'Remarkable', color: '#4B69FF', bg: 'rgba(75, 105, 255, 0.15)' };
  }
  if (name.includes('sticker')) {
    return { name: 'High Grade', color: '#4B69FF', bg: 'rgba(75, 105, 255, 0.15)' };
  }
  if (name.includes('music kit')) {
    return { name: 'High Grade', color: '#4B69FF', bg: 'rgba(75, 105, 255, 0.15)' };
  }
  if (name.includes('agent')) {
    return { name: 'Distinguished', color: '#8847FF', bg: 'rgba(136, 71, 255, 0.15)' };
  }

  return { name: 'Mil-Spec', color: '#4B69FF', bg: 'rgba(75, 105, 255, 0.15)' };
}
