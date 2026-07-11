// Market-hash-name parsing helpers — pure, dependency-free, shared by client
// & server. Single home for the prefix-strip + " | " split logic so patterns.ts
// (blue-gem lookup) and the dashboard (tags, category filters) stay in sync.

export function cleanWeaponBase(marketHashName: string): string {
  // Strip quality/category prefixes, then take the weapon segment before " | ".
  const noPrefix = marketHashName
    .replace(/^★\s*/, '')
    .replace(/^StatTrak™\s*/, '')
    .replace(/^Souvenir\s*/, '');
  return noPrefix.split(' | ')[0].trim();
}

export function weaponTag(name: string): string {
  const w = cleanWeaponBase(name);
  if (w.includes('AWP')) return 'AWP';
  if (w.includes('AK-47')) return 'AK';
  if (w.includes('M4A4') || w.includes('M4A1-S')) return 'M4';
  if (w.includes('USP')) return 'USP';
  if (w.includes('Glock')) return 'GLK';
  if (w.includes('Desert Eagle')) return 'DE';
  if (w.includes('Five-SeveN')) return '57';
  if (w.includes('P250')) return 'P25';
  if (w.includes('P90')) return 'P90';
  if (w.includes('MAC-10')) return 'MAC';
  if (w.includes('SSG')) return 'SSG';
  if (w.includes('FAMAS')) return 'FMS';
  if (w.includes('Galil')) return 'GAL';
  if (w.includes('AUG')) return 'AUG';
  if (w.includes('SG 553')) return 'SG';
  if (w.includes('SCAR')) return 'SCR';
  if (w.includes('Nova') || w.includes('XM') || w.includes('MAG') || w.includes('Sawed')) return 'SHG';
  if (w.includes('Negev') || w.includes('M249')) return 'LMG';
  if (w.includes('MP') || w.includes('UMP') || w.includes('PP-Bizon')) return 'SMG';
  if (name.includes('Knife') || name.includes('Bayonet') || name.includes('Karambit') || name.includes('Daggers') || name.includes('Stiletto') || name.includes('Talon') || name.includes('Skeleton') || name.includes('Kukri')) return 'KNF';
  if (name.includes('Gloves') || name.includes('Wraps')) return 'GLV';
  if (name.includes('Sticker')) return 'STK';
  if (name.includes('Case') || name.includes('Container')) return 'CSE';
  return w.substring(0, 3).toUpperCase();
}

export type ItemCategoryId =
  | 'knife' | 'gloves' | 'rifle' | 'pistol' | 'smg'
  | 'sniper' | 'heavy' | 'sticker' | 'case' | 'agent' | 'other';

export const CATEGORY_ORDER: ItemCategoryId[] = [
  'knife', 'gloves', 'rifle', 'pistol', 'smg', 'sniper', 'heavy', 'sticker', 'case', 'agent', 'other',
];

export function itemCategory(name: string): ItemCategoryId {
  const weapon = cleanWeaponBase(name);
  if (name.includes('Gloves') || name.includes('Wraps')) return 'gloves';
  if (name.startsWith('★') || /Knife|Bayonet|Karambit|Daggers/.test(weapon)) return 'knife';
  if (/AWP|SSG 08|SCAR-20|G3SG1/.test(weapon)) return 'sniper';
  if (/AK-47|M4A4|M4A1-S|FAMAS|Galil|AUG|SG 553/.test(weapon)) return 'rifle';
  if (/USP|Glock|P250|Five-SeveN|Desert Eagle|Tec-9|CZ75|Dual Berettas|R8 Revolver|P2000/.test(weapon)) return 'pistol';
  if (/MP9|MP7|MP5|MAC-10|UMP|P90|PP-Bizon/.test(weapon)) return 'smg';
  if (/Nova|XM1014|MAG-7|Sawed-Off|Negev|M249/.test(weapon)) return 'heavy';
  if (/Zeus/.test(weapon)) return 'pistol';
  // Capsules/cases first: "Sticker Capsule" is a container, not a sticker.
  if (/Case|Container|Capsule|Package/.test(name)) return 'case';
  if (name.includes('Sticker')) return 'sticker';
  if (
    name.includes('Agent')
    || (!name.includes('Graffiti') && !name.includes('Patch')
      && /\|\s*(The Professionals|FBI|SWAT|SEAL|NSWC|KSK|TACP|NZSAS|SAS|Sabre|Guerrilla|Phoenix|Elite Crew|Gendarmerie|Brazilian)/.test(name))
  ) return 'agent';
  return 'other';
}
