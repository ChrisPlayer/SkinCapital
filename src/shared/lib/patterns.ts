// Rare pattern / finish detection — pure, dependency-free, shared by client & server.
//
// Goal: surface that a skin may be worth more than its generic market price because
// of its float or paint seed. We only emit a tag when it is RELIABLY computable from
// the data we actually have (marketHashName + floatValue + paintSeed).
//
// What we deliberately do NOT detect, because the data isn't available or the result
// would be guesswork (better no badge than a wrong one):
//   - Doppler / Gamma Doppler phases: derived from the GC paint_index, which our
//     pipeline drops in resolveItem() (only the resolved name reaches us). Skipped.
//   - Fade %: depends on a per-weapon paintSeed ordering with no simple closed form
//     across weapons. Skipped rather than shown wrong.
//   - Marble Fade "Fire & Ice": needs large per-knife curated seed tables. Skipped.

export type PatternTier = 'gold' | 'cyan' | 'pink' | 'neutral';

export interface PatternTag {
  kind: 'fnlow' | 'bluegem';
  /** i18n key (translated in the UI); patterns stays UI-framework agnostic. */
  key: string;
  /** Bilingual fallback labels so non-React callers still get readable text. */
  label: { fr: string; en: string };
  /** Optional short rank/detail, e.g. a seed number or "#1". */
  rank?: string;
  tier?: PatternTier;
}

export interface PatternInput {
  marketHashName: string;
  floatValue: number | null;
  paintSeed: number | null;
}

const FN_NEAR_ZERO = 0.0009;
const FN_LOW = 0.01;

// Community "blue gem" / pattern tier lists are indicative and curated by collectors,
// not official Valve data. We include only a small set of the most famous seeds and
// keep the keys conservative (gold = top-tier, cyan = notable). Unknown seeds → no tag.
//
// Keyed by the cleaned weapon base name ("AK-47", "Karambit", ...). Sources: public
// CS2/CSGO blue-gem pattern tier lists (e.g. csgostash / collector community lists).
const BLUE_GEM_SEEDS: Record<string, { gold: number[]; cyan: number[] }> = {
  'AK-47': {
    gold: [661, 555, 760, 168],
    cyan: [179, 592, 321, 151, 955, 463],
  },
  'Karambit': {
    // Karambit Case Hardened — famous full-blue patterns.
    gold: [387, 442, 853],
    cyan: [231, 670, 321],
  },
  'Five-SeveN': {
    gold: [278, 690],
    cyan: [868, 670],
  },
  'Bayonet': {
    gold: [555, 195],
    cyan: [21, 670],
  },
};

function cleanWeaponBase(marketHashName: string): string {
  // Strip quality/category prefixes, then take the weapon segment before " | ".
  const noPrefix = marketHashName
    .replace(/^★\s*/, '')
    .replace(/^StatTrak™\s*/, '')
    .replace(/^Souvenir\s*/, '');
  return noPrefix.split(' | ')[0].trim();
}

function isFactoryNew(marketHashName: string, floatValue: number): boolean {
  // Trust an explicit wear suffix when present; otherwise fall back to the float band.
  if (/\(Factory New\)\s*$/.test(marketHashName)) return true;
  if (/\((Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)\s*$/.test(marketHashName)) return false;
  return floatValue < 0.07;
}

/**
 * Detect notable rare-pattern / finish tags for an item.
 * Returns an empty array when nothing reliable applies.
 */
export function detectPatterns(item: PatternInput): PatternTag[] {
  const tags: PatternTag[] = [];
  const { marketHashName, floatValue, paintSeed } = item;

  // ── Low float (Factory New only) ──
  if (
    floatValue !== null &&
    floatValue >= 0 &&
    floatValue < FN_LOW &&
    isFactoryNew(marketHashName, floatValue)
  ) {
    if (floatValue < FN_NEAR_ZERO) {
      tags.push({
        kind: 'fnlow',
        key: 'patterns.nearzero',
        label: { fr: 'Float quasi nul', en: 'Near-zero float' },
        rank: floatValue.toFixed(4),
        tier: 'cyan',
      });
    } else {
      tags.push({
        kind: 'fnlow',
        key: 'patterns.fnlow',
        label: { fr: 'Float tres bas', en: 'Very low float' },
        rank: floatValue.toFixed(4),
        tier: 'neutral',
      });
    }
  }

  // ── Case Hardened "blue gem" (curated, indicative) ──
  if (paintSeed !== null && /Case Hardened/i.test(marketHashName)) {
    const base = cleanWeaponBase(marketHashName);
    const table = BLUE_GEM_SEEDS[base];
    if (table) {
      if (table.gold.includes(paintSeed)) {
        tags.push({
          kind: 'bluegem',
          key: 'patterns.bluegem',
          label: { fr: 'Blue Gem', en: 'Blue Gem' },
          rank: `#${paintSeed}`,
          tier: 'gold',
        });
      } else if (table.cyan.includes(paintSeed)) {
        tags.push({
          kind: 'bluegem',
          key: 'patterns.bluegem',
          label: { fr: 'Blue Gem', en: 'Blue Gem' },
          rank: `#${paintSeed}`,
          tier: 'cyan',
        });
      }
    }
  }

  return tags;
}

/** True when an item carries a high-tier (gold/cyan) tag — used for list indicators. */
export function hasNotableTier(tags: PatternTag[]): boolean {
  return tags.some((t) => t.tier === 'gold' || t.tier === 'cyan');
}
