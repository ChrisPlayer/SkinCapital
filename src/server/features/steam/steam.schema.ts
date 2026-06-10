import fs from 'fs';
import path from 'path';
import https from 'https';
import { WEAPON_NAMES } from '../../../shared/constants/weapons.ts';
import { getWearName } from '../../../shared/constants/wear.ts';
import { logger } from '../../lib/logger.ts';
import { DATA_DIR } from '../../lib/paths.ts';
import type { Sticker } from '../../../shared/types/inventory.ts';

const CACHE_DIR = DATA_DIR;
const CACHE_FILE = path.join(CACHE_DIR, 'item_schema.json');
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const SKINS_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json';
const STICKERS_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/stickers.json';
const CRATES_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/crates.json';
const PATCHES_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/patches.json';
const GRAFFITI_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/graffiti.json';
const COLLECTIBLES_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/collectibles.json';
const AGENTS_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/agents.json';
const KEYS_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/keys.json';
const TOOLS_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/tools.json';
const MUSIC_KITS_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/music_kits.json';

interface SchemaEntry {
  name: string;
  image: string | null;
}

export interface SchemaRarity {
  id: string;
  name: string;
  color: string;
}

let skinLookup: Record<string, SchemaEntry> = {};
let stickerLookup: Record<string, SchemaEntry> = {};
let crateLookup: Record<string, SchemaEntry> = {};
let defindexLookup: Record<string, SchemaEntry> = {};
let musicKitLookup: Record<string, SchemaEntry> = {};
let rarityByName: Record<string, SchemaRarity> = {};
let initialized = false;

function downloadJSON(url: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      let data = '';
      res.on('data', (chunk: Buffer) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

export async function initialize(): Promise<void> {
  if (initialized) return;

  try {
    if (fs.existsSync(CACHE_FILE)) {
      const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (cache.timestamp > Date.now() - CACHE_MAX_AGE && cache.version === 6) {
        skinLookup = cache.skins || {};
        stickerLookup = cache.stickers || {};
        crateLookup = cache.crates || {};
        defindexLookup = cache.defindex || {};
        musicKitLookup = cache.musicKits || {};
        rarityByName = cache.rarities || {};
        initialized = true;
        logger.info(`[Schema] Loaded from cache: ${Object.keys(skinLookup).length} skins, ${Object.keys(stickerLookup).length} stickers/patches/graffiti, ${Object.keys(crateLookup).length} crates, ${Object.keys(defindexLookup).length} misc items, ${Object.keys(musicKitLookup).length} music kits, ${Object.keys(rarityByName).length} rarities`);
        return;
      }
    }
  } catch { /* no cache */ }

  logger.info('[Schema] Downloading CS2 item database...');

  try {
    const skins = (await downloadJSON(SKINS_URL)) as Array<{
      weapon?: { weapon_id?: number; name?: string };
      paint_index?: string;
      pattern?: { name?: string };
      name?: string;
      image?: string;
      rarity?: { id?: string; name?: string; color?: string };
    }>;
    for (const skin of skins) {
      if (skin.weapon && skin.paint_index) {
        const defindex = skin.weapon.weapon_id;
        const paintIndex = parseInt(skin.paint_index);
        if (defindex && paintIndex) {
          const key = `${defindex}_${paintIndex}`;
          let baseName: string;
          if (skin.weapon.name && skin.pattern?.name) {
            baseName = `${skin.weapon.name} | ${skin.pattern.name}`;
          } else if (skin.name) {
            baseName = skin.name.replace(/^StatTrak\u2122 |^\u2605 |^Souvenir /g, '').trim();
          } else {
            baseName = `${skin.weapon.name || 'Unknown'} | Skin`;
          }
          skinLookup[key] = { name: baseName, image: skin.image || null };
          if (skin.rarity?.id && skin.rarity?.name && skin.rarity?.color) {
            rarityByName[baseName] = { id: skin.rarity.id, name: skin.rarity.name, color: skin.rarity.color };
          }
        }
      }
    }
    logger.info(`[Schema] Downloaded ${Object.keys(skinLookup).length} skins`);
  } catch (err) {
    logger.error('[Schema] Failed to download skins:', (err as Error).message);
  }

  try {
    const stickers = (await downloadJSON(STICKERS_URL)) as Array<{ id?: string; name?: string; image?: string; rarity?: { id?: string; name?: string; color?: string } }>;
    for (const sticker of stickers) {
      if (sticker.id && sticker.name) {
        const match = sticker.id.match(/sticker-(\d+)/);
        if (match) {
          stickerLookup[match[1]] = { name: sticker.name, image: sticker.image || null };
          if (sticker.rarity?.id && sticker.rarity?.name && sticker.rarity?.color) {
            rarityByName[sticker.name] = { id: sticker.rarity.id, name: sticker.rarity.name, color: sticker.rarity.color };
          }
        }
      }
    }
    logger.info(`[Schema] Downloaded ${Object.keys(stickerLookup).length} stickers`);
  } catch (err) {
    logger.error('[Schema] Failed to download stickers:', (err as Error).message);
  }

  try {
    const crates = (await downloadJSON(CRATES_URL)) as Array<{ id?: string; name?: string; image?: string; rarity?: { id?: string; name?: string; color?: string } }>;
    for (const crate of crates) {
      if (crate.id && crate.name) {
        const match = crate.id.match(/crate-(\d+)/);
        if (match) {
          crateLookup[match[1]] = { name: crate.name, image: crate.image || null };
          if (crate.rarity?.id && crate.rarity?.name && crate.rarity?.color) {
            rarityByName[crate.name] = { id: crate.rarity.id, name: crate.rarity.name, color: crate.rarity.color };
          }
        }
      }
    }
    logger.info(`[Schema] Downloaded ${Object.keys(crateLookup).length} crates`);
  } catch (err) {
    logger.error('[Schema] Failed to download crates:', (err as Error).message);
  }

  try {
    const patches = (await downloadJSON(PATCHES_URL)) as Array<{ id?: string; name?: string; image?: string; rarity?: { id?: string; name?: string; color?: string } }>;
    let patchCount = 0;
    for (const patch of patches) {
      if (patch.id && patch.name) {
        const match = patch.id.match(/^patch-(\d+)$/);
        if (match && !stickerLookup[match[1]]) {
          stickerLookup[match[1]] = { name: patch.name, image: patch.image || null };
          if (patch.rarity?.id && patch.rarity?.name && patch.rarity?.color) {
            rarityByName[patch.name] = { id: patch.rarity.id, name: patch.rarity.name, color: patch.rarity.color };
          }
          patchCount++;
        }
      }
    }
    logger.info(`[Schema] Downloaded ${patchCount} patches`);
  } catch (err) {
    logger.error('[Schema] Failed to download patches:', (err as Error).message);
  }

  try {
    const graffiti = (await downloadJSON(GRAFFITI_URL)) as Array<{ id?: string; name?: string; image?: string; rarity?: { id?: string; name?: string; color?: string } }>;
    let graffitiCount = 0;
    for (const g of graffiti) {
      if (g.id && g.name) {
        const match = g.id.match(/^graffiti-(\d+)(?:_(\d+))?$/);
        if (match) {
          const baseId = match[1];
          const tintId = match[2];
          if (tintId) {
            const tintKey = `${baseId}_${tintId}`;
            if (!stickerLookup[tintKey]) {
              stickerLookup[tintKey] = { name: g.name, image: g.image || null };
              graffitiCount++;
            }
            if (!stickerLookup[baseId]) {
              const baseName = g.name.replace(/\s*\([^)]+\)\s*$/, '');
              stickerLookup[baseId] = { name: baseName, image: g.image || null };
            }
          } else if (!stickerLookup[baseId]) {
            stickerLookup[baseId] = { name: g.name, image: g.image || null };
            graffitiCount++;
          }
          if (g.rarity?.id && g.rarity?.name && g.rarity?.color && !rarityByName[g.name]) {
            rarityByName[g.name] = { id: g.rarity.id, name: g.rarity.name, color: g.rarity.color };
          }
        }
      }
    }
    logger.info(`[Schema] Downloaded ${graffitiCount} graffiti`);
  } catch (err) {
    logger.error('[Schema] Failed to download graffiti:', (err as Error).message);
  }

  try {
    const collectibles = (await downloadJSON(COLLECTIBLES_URL)) as Array<{ id?: string; name?: string; image?: string; rarity?: { id?: string; name?: string; color?: string } }>;
    for (const c of collectibles) {
      if (c.id && c.name) {
        const match = c.id.match(/collectible-(\d+)/);
        if (match) {
          defindexLookup[match[1]] = { name: c.name, image: c.image || null };
          if (c.rarity?.id && c.rarity?.name && c.rarity?.color) {
            rarityByName[c.name] = { id: c.rarity.id, name: c.rarity.name, color: c.rarity.color };
          }
        }
      }
    }
    logger.info(`[Schema] Downloaded ${Object.keys(defindexLookup).length} collectibles`);
  } catch (err) {
    logger.error('[Schema] Failed to download collectibles:', (err as Error).message);
  }

  try {
    const agents = (await downloadJSON(AGENTS_URL)) as Array<{ id?: string; name?: string; image?: string; rarity?: { id?: string; name?: string; color?: string } }>;
    let agentCount = 0;
    for (const a of agents) {
      if (a.id && a.name) {
        const match = a.id.match(/agent-(\d+)/);
        if (match) {
          defindexLookup[match[1]] = { name: a.name, image: a.image || null };
          if (a.rarity?.id && a.rarity?.name && a.rarity?.color) {
            rarityByName[a.name] = { id: a.rarity.id, name: a.rarity.name, color: a.rarity.color };
          }
          agentCount++;
        }
      }
    }
    logger.info(`[Schema] Downloaded ${agentCount} agents`);
  } catch (err) {
    logger.error('[Schema] Failed to download agents:', (err as Error).message);
  }

  try {
    const keys = (await downloadJSON(KEYS_URL)) as Array<{ id?: string; name?: string; image?: string; rarity?: { id?: string; name?: string; color?: string } }>;
    let keyCount = 0;
    for (const k of keys) {
      if (k.id && k.name) {
        const match = k.id.match(/key-(\d+)/);
        if (match) {
          defindexLookup[match[1]] = { name: k.name, image: k.image || null };
          if (k.rarity?.id && k.rarity?.name && k.rarity?.color) {
            rarityByName[k.name] = { id: k.rarity.id, name: k.rarity.name, color: k.rarity.color };
          }
          keyCount++;
        }
      }
    }
    logger.info(`[Schema] Downloaded ${keyCount} keys`);
  } catch (err) {
    logger.error('[Schema] Failed to download keys:', (err as Error).message);
  }

  try {
    const tools = (await downloadJSON(TOOLS_URL)) as Array<{ id?: string; name?: string; def_index?: number; image?: string }>;
    let toolCount = 0;
    for (const t of tools) {
      if (t.def_index && t.name && t.def_index !== 1201) {
        defindexLookup[String(t.def_index)] = { name: t.name, image: t.image || null };
        toolCount++;
      }
    }
    logger.info(`[Schema] Downloaded ${toolCount} tools`);
  } catch (err) {
    logger.error('[Schema] Failed to download tools:', (err as Error).message);
  }

  try {
    const kits = (await downloadJSON(MUSIC_KITS_URL)) as Array<{ id?: string; name?: string; image?: string }>;
    let kitCount = 0;
    for (const kit of kits) {
      if (kit.id && kit.name) {
        const match = kit.id.match(/^music_kit-(\d+)$/);
        if (match) {
          musicKitLookup[match[1]] = { name: kit.name, image: kit.image || null };
          kitCount++;
        }
      }
    }
    logger.info(`[Schema] Downloaded ${kitCount} music kits`);
  } catch (err) {
    logger.error('[Schema] Failed to download music kits:', (err as Error).message);
  }

  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify({
      version: 6,
      timestamp: Date.now(),
      skins: skinLookup,
      stickers: stickerLookup,
      crates: crateLookup,
      defindex: defindexLookup,
      musicKits: musicKitLookup,
      rarities: rarityByName,
    }));
    logger.info(`[Schema] Cache saved (${Object.keys(rarityByName).length} rarities)`);
  } catch (e) {
    logger.error('[Schema] Failed to save cache:', (e as Error).message);
  }

  initialized = true;
}

interface GCItem {
  def_index: number;
  paint_index?: number;
  quality?: number;
  paintwear?: number;
  paint_wear?: number;
  paintseed?: number;
  paint_seed?: number;
  stickers?: Array<{
    slot: number;
    sticker_id?: number;
    kit?: number;
    id?: number;
    wear?: number;
  }>;
  // CSOEconItemAttribute: def_index, value (uint32), value_bytes (bytes)
  attribute?: Array<{
    def_index: number;
    value?: number;
    value_bytes?: Buffer | Uint8Array;
  }>;
  casket_id?: string;
  [key: string]: unknown;
}

function extractFloat(item: GCItem): number | null {
  // _processSOEconItem extracts attribute 8 → paint_wear (readFloatLE)
  if (item.paintwear !== undefined && item.paintwear !== null) return item.paintwear;
  if (item.paint_wear !== undefined && item.paint_wear !== null) return item.paint_wear;
  // Fallback: read directly from attribute 8
  if (item.attribute && Array.isArray(item.attribute)) {
    const attr = item.attribute.find((a) => a.def_index === 8);
    if (attr?.value_bytes) {
      try {
        const buf = Buffer.isBuffer(attr.value_bytes) ? attr.value_bytes : Buffer.from(attr.value_bytes);
        if (buf.length >= 4) return buf.readFloatLE(0);
      } catch { /* ignore */ }
    }
  }
  return null;
}

function extractPaintSeed(item: GCItem): number | null {
  // _processSOEconItem extracts attribute 7 → paint_seed (readFloatLE, Math.floor)
  if (item.paintseed !== undefined) return item.paintseed;
  if (item.paint_seed !== undefined) return item.paint_seed;
  // Fallback: read directly from attribute 7
  if (item.attribute && Array.isArray(item.attribute)) {
    const attr = item.attribute.find((a) => a.def_index === 7);
    if (attr?.value_bytes) {
      try {
        const buf = Buffer.isBuffer(attr.value_bytes) ? attr.value_bytes : Buffer.from(attr.value_bytes);
        if (buf.length >= 4) return Math.floor(buf.readFloatLE(0));
      } catch { /* ignore */ }
    }
  }
  return null;
}

function extractStickerKitId(item: GCItem): number | null {
  // _processSOEconItem extracts attribute 113 → stickers[0].sticker_id (readUInt32LE)
  if (item.stickers && Array.isArray(item.stickers) && item.stickers.length > 0) {
    const s = item.stickers[0];
    if (s.sticker_id) return s.sticker_id;
    if (s.kit) return s.kit;
    if (s.id) return s.id;
  }
  // Fallback: read directly from attribute 113
  return getAttributeUint32(item, 113);
}

function getAttributeUint32(item: GCItem, attrDefIndex: number): number | null {
  if (!item.attribute || !Array.isArray(item.attribute)) return null;
  const attr = item.attribute.find((a) => a.def_index === attrDefIndex);
  if (!attr) return null;
  // CSOEconItemAttribute has: def_index (uint32), value (uint32), value_bytes (bytes)
  // Try value_bytes first (most reliable, used by globaloffensive library)
  if (attr.value_bytes) {
    try {
      const buf = Buffer.isBuffer(attr.value_bytes) ? attr.value_bytes : Buffer.from(attr.value_bytes);
      if (buf.length >= 4) return buf.readUInt32LE(0);
    } catch { /* ignore */ }
  }
  // Fallback to value field
  if (attr.value !== undefined && attr.value !== null) return attr.value;
  return null;
}

function extractGraffitiTintId(item: GCItem): number | null {
  return getAttributeUint32(item, 233);
}

function extractMusicKitId(item: GCItem): number | null {
  return getAttributeUint32(item, 166);
}

function extractStickers(item: GCItem): Sticker[] | null {
  const stickers: Sticker[] = [];

  if (item.stickers && Array.isArray(item.stickers) && item.stickers.length > 0) {
    item.stickers.forEach((s) => {
      if (s.sticker_id || s.kit) {
        const kitId = s.sticker_id || s.kit!;
        const lookup = stickerLookup[kitId];
        stickers.push({
          slot: s.slot,
          stickerId: kitId,
          name: lookup ? lookup.name : `Sticker #${kitId}`,
          imageUrl: lookup ? lookup.image : null,
          wear: s.wear || null,
        });
      }
    });
    return stickers.length > 0 ? stickers : null;
  }

  if (item.attribute && Array.isArray(item.attribute)) {
    for (let slot = 0; slot < 6; slot++) {
      const kitId = getAttributeUint32(item, 113 + slot * 4);
      if (kitId) {
        const lookup = stickerLookup[kitId];
        let wear: number | null = null;
        const wearAttr = item.attribute.find((a) => a.def_index === 114 + slot * 4);
        if (wearAttr?.value_bytes) {
          try {
            const buf = Buffer.isBuffer(wearAttr.value_bytes) ? wearAttr.value_bytes : Buffer.from(wearAttr.value_bytes);
            if (buf.length >= 4) wear = buf.readFloatLE(0);
          } catch { /* */ }
        }
        stickers.push({
          slot,
          stickerId: kitId,
          name: lookup ? lookup.name : `Sticker #${kitId}`,
          imageUrl: lookup ? lookup.image : null,
          wear,
        });
      }
    }
  }

  return stickers.length > 0 ? stickers : null;
}

export interface ResolvedItem {
  marketHashName: string;
  floatValue: number | null;
  paintSeed: number | null;
  imageUrl: string | null;
  stickers: Sticker[] | null;
  itemType: string;
}

export function resolveItem(item: GCItem): ResolvedItem {
  const defindex = item.def_index;
  const paintIndex = item.paint_index;
  const quality = item.quality;
  const floatValue = extractFloat(item);
  const paintSeed = extractPaintSeed(item);
  const stickers = extractStickers(item);

  let prefix = '';
  const isKnife = defindex >= 500 && defindex < 600;
  const isGlove = defindex >= 5027 && defindex <= 5035;
  if (isKnife || isGlove) prefix = '\u2605 ';
  if (quality === 9) prefix += 'StatTrak\u2122 ';
  if (quality === 12) prefix += 'Souvenir ';

  let marketHashName: string;
  let imageUrl: string | null = null;
  let itemType = 'Unknown';

  if (paintIndex && defindex) {
    itemType = 'Weapon';
    const key = `${defindex}_${paintIndex}`;
    const skinInfo = skinLookup[key];

    if (skinInfo) {
      const wear = getWearName(floatValue);
      marketHashName = wear ? `${prefix}${skinInfo.name} (${wear})` : `${prefix}${skinInfo.name}`;
      imageUrl = skinInfo.image;
    } else {
      const weaponName = WEAPON_NAMES[defindex] || `Weapon #${defindex}`;
      const wear = getWearName(floatValue);
      const base = `${prefix}${weaponName} | Skin #${paintIndex}`;
      marketHashName = wear ? `${base} (${wear})` : base;
    }
  } else if (defindex === 1209 || defindex === 4609 || defindex === 1348 || defindex === 1349) {
    itemType = defindex === 1209 ? 'Sticker' : defindex === 4609 ? 'Patch' : 'Graffiti';
    const kitId = extractStickerKitId(item);
    if (kitId) {
      let lookupEntry: SchemaEntry | undefined;
      // For graffiti, try color-specific lookup first, then base name
      if (defindex === 1348 || defindex === 1349) {
        const tintId = extractGraffitiTintId(item);
        if (tintId) {
          lookupEntry = stickerLookup[`${kitId}_${tintId}`];
        }
        if (!lookupEntry) {
          lookupEntry = stickerLookup[kitId];
        }
      } else {
        lookupEntry = stickerLookup[kitId];
      }
      if (lookupEntry) {
        marketHashName = lookupEntry.name;
        imageUrl = lookupEntry.image;
      } else {
        marketHashName = `${itemType} #${kitId}`;
      }
    } else {
      marketHashName = `${itemType} #${defindex}`;
    }
  } else if (defindex === 1314) {
    itemType = 'Music Kit';
    const musicId = extractMusicKitId(item);
    if (musicId && musicKitLookup[musicId]) {
      marketHashName = `${prefix}${musicKitLookup[musicId].name}`;
      imageUrl = musicKitLookup[musicId].image;
    } else {
      marketHashName = musicId ? `Music Kit #${musicId}` : `Music Kit #${defindex}`;
    }
  } else if (defindex === 1201) {
    itemType = 'Container';
    marketHashName = 'Storage Unit';
  } else if (crateLookup[defindex]) {
    itemType = 'Container';
    marketHashName = crateLookup[defindex].name;
    imageUrl = crateLookup[defindex].image;
  } else if (defindexLookup[defindex]) {
    itemType = 'Collectible';
    marketHashName = defindexLookup[defindex].name;
    imageUrl = defindexLookup[defindex].image;
  } else if (defindex && WEAPON_NAMES[defindex]) {
    itemType = 'Weapon';
    marketHashName = prefix + WEAPON_NAMES[defindex];
  } else {
    marketHashName = `Item #${defindex || 'Unknown'}`;
  }

  const finalStickers = itemType === 'Weapon' ? stickers : null;

  return {
    marketHashName,
    floatValue,
    paintSeed,
    imageUrl,
    stickers: finalStickers,
    itemType,
  };
}

const WEAR_SUFFIX_RE = /\s*\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/;
const QUALITY_PREFIX_RE = /^(StatTrak\u2122\s*|Souvenir\s*|\u2605\s*)/;

function normalizeNameForRarity(name: string): string {
  return name.replace(QUALITY_PREFIX_RE, '').replace(WEAR_SUFFIX_RE, '').trim();
}

export function getRarityForName(marketHashName: string): SchemaRarity | null {
  // Direct match
  if (rarityByName[marketHashName]) return rarityByName[marketHashName];
  // Strip quality prefixes and wear suffix
  const normalized = normalizeNameForRarity(marketHashName);
  if (rarityByName[normalized]) return rarityByName[normalized];
  return null;
}
