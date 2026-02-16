import type { Rarity } from '../types/inventory.ts';

const DEFAULT_RARITY: Rarity = { name: 'Base Grade', color: '#b0c3d9', bg: 'rgba(176, 195, 217, 0.12)' };

export function getItemRarity(marketHashName: string, schemaRarity?: { name: string; color: string } | null): Rarity {
  // Use schema rarity data when available (from ByMykel API)
  if (schemaRarity) {
    // Knives/Gloves (★) use gold instead of the API's red
    const isKnifeGlove = marketHashName.includes('\u2605');
    const color = isKnifeGlove ? '#FFD700' : schemaRarity.color;
    const name = isKnifeGlove ? 'Extraordinary' : schemaRarity.name;
    return { name, color, bg: `${color}26` };
  }

  // Fallback: heuristic based on item name (does NOT use StatTrak/Souvenir as rarity)
  const name = marketHashName.toLowerCase();
  if (name.includes('\u2605')) return { name: 'Extraordinary', color: '#FFD700', bg: 'rgba(255, 215, 0, 0.15)' };
  if (name.includes('covert')) return { name: 'Covert', color: '#eb4b4b', bg: 'rgba(235, 75, 75, 0.15)' };

  return DEFAULT_RARITY;
}

export type ItemQuality = 'stattrak' | 'souvenir' | null;

export function getItemQuality(marketHashName: string): ItemQuality {
  if (marketHashName.includes('StatTrak\u2122')) return 'stattrak';
  if (marketHashName.startsWith('Souvenir ')) return 'souvenir';
  return null;
}
