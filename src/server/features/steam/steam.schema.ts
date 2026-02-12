import fs from 'fs';
import path from 'path';
import https from 'https';
import { WEAPON_NAMES } from '../../../shared/constants/weapons.ts';
import { getWearName } from '../../../shared/constants/wear.ts';
import { logger } from '../../lib/logger.ts';
import type { Sticker } from '../../../shared/types/inventory.ts';

const CACHE_DIR = path.join(process.cwd(), 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'item_schema.json');
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const SKINS_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json';
const STICKERS_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/stickers.json';
const CRATES_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/crates.json';

interface SchemaEntry {
  name: string;
  image: string | null;
}

let skinLookup: Record<string, SchemaEntry> = {};
let stickerLookup: Record<string, SchemaEntry> = {};
let crateLookup: Record<string, SchemaEntry> = {};
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
      if (cache.timestamp > Date.now() - CACHE_MAX_AGE && cache.version === 3) {
        skinLookup = cache.skins || {};
        stickerLookup = cache.stickers || {};
        crateLookup = cache.crates || {};
        initialized = true;
        logger.info(`[Schema] Loaded from cache: ${Object.keys(skinLookup).length} skins, ${Object.keys(stickerLookup).length} stickers, ${Object.keys(crateLookup).length} crates`);
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
        }
      }
    }
    logger.info(`[Schema] Downloaded ${Object.keys(skinLookup).length} skins`);
  } catch (err) {
    logger.error('[Schema] Failed to download skins:', (err as Error).message);
  }

  try {
    const stickers = (await downloadJSON(STICKERS_URL)) as Array<{ id?: string; name?: string; image?: string }>;
    for (const sticker of stickers) {
      if (sticker.id && sticker.name) {
        const match = sticker.id.match(/sticker-(\d+)/);
        if (match) {
          stickerLookup[match[1]] = { name: sticker.name, image: sticker.image || null };
        }
      }
    }
    logger.info(`[Schema] Downloaded ${Object.keys(stickerLookup).length} stickers`);
  } catch (err) {
    logger.error('[Schema] Failed to download stickers:', (err as Error).message);
  }

  try {
    const crates = (await downloadJSON(CRATES_URL)) as Array<{ id?: string; name?: string; image?: string }>;
    for (const crate of crates) {
      if (crate.id && crate.name) {
        const match = crate.id.match(/crate-(\d+)/);
        if (match) {
          crateLookup[match[1]] = { name: crate.name, image: crate.image || null };
        }
      }
    }
    logger.info(`[Schema] Downloaded ${Object.keys(crateLookup).length} crates`);
  } catch (err) {
    logger.error('[Schema] Failed to download crates:', (err as Error).message);
  }

  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify({
      version: 3,
      timestamp: Date.now(),
      skins: skinLookup,
      stickers: stickerLookup,
      crates: crateLookup,
    }));
    logger.info('[Schema] Cache saved');
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
  attribute?: Array<{
    def_index: number;
    float_value?: number;
    uint32_value?: number;
    value?: number;
    value_bytes?: Buffer;
  }>;
  casket_id?: string;
  [key: string]: unknown;
}

function extractFloat(item: GCItem): number | null {
  if (item.paintwear !== undefined && item.paintwear !== null) return item.paintwear;
  if (item.paint_wear !== undefined && item.paint_wear !== null) return item.paint_wear;
  if (item.attribute && Array.isArray(item.attribute)) {
    const attr = item.attribute.find((a) => a.def_index === 8);
    if (attr) {
      if (attr.float_value !== undefined) return attr.float_value;
      if (attr.value_bytes) {
        try {
          const buf = Buffer.from(attr.value_bytes);
          return buf.readFloatLE(0);
        } catch { /* ignore */ }
      }
    }
  }
  return null;
}

function extractPaintSeed(item: GCItem): number | null {
  if (item.paintseed !== undefined) return item.paintseed;
  if (item.paint_seed !== undefined) return item.paint_seed;
  if (item.attribute && Array.isArray(item.attribute)) {
    const attr = item.attribute.find((a) => a.def_index === 6);
    if (attr) {
      if (attr.uint32_value !== undefined) return attr.uint32_value;
      if (attr.value !== undefined) return attr.value;
    }
  }
  return null;
}

function extractStickerKitId(item: GCItem): number | null {
  if (item.stickers && Array.isArray(item.stickers) && item.stickers.length > 0) {
    const s = item.stickers[0];
    if (s.sticker_id) return s.sticker_id;
    if (s.kit) return s.kit;
    if (s.id) return s.id;
  }
  if (item.attribute && Array.isArray(item.attribute)) {
    for (const attr of item.attribute) {
      if (attr.def_index === 113) {
        if (attr.uint32_value !== undefined) return attr.uint32_value;
        if (attr.value !== undefined) return attr.value;
        if (attr.value_bytes) {
          try { return Buffer.from(attr.value_bytes).readUInt32LE(0); } catch { /* ignore */ }
        }
      }
    }
  }
  return null;
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
      const idAttr = item.attribute.find((a) => a.def_index === 113 + slot * 4);
      if (idAttr) {
        let kitId = idAttr.uint32_value || idAttr.value;
        if (!kitId && idAttr.value_bytes) {
          try { kitId = Buffer.from(idAttr.value_bytes).readUInt32LE(0); } catch { /* */ }
        }
        if (kitId) {
          const lookup = stickerLookup[kitId];
          const wearAttr = item.attribute.find((a) => a.def_index === 114 + slot * 4);
          let wear: number | null = null;
          if (wearAttr) {
            wear = wearAttr.float_value ?? null;
            if (wear === null && wearAttr.value_bytes) {
              try { wear = Buffer.from(wearAttr.value_bytes).readFloatLE(0); } catch { /* */ }
            }
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
    if (kitId && stickerLookup[kitId]) {
      marketHashName = stickerLookup[kitId].name;
      imageUrl = stickerLookup[kitId].image;
    } else {
      marketHashName = kitId ? `${itemType} #${kitId}` : `${itemType} #${defindex}`;
    }
  } else if (item.casket_id || defindex === 1201 || (defindex >= 4000 && defindex < 4800)) {
    itemType = 'Container';
    if (crateLookup[defindex]) {
      marketHashName = crateLookup[defindex].name;
      imageUrl = crateLookup[defindex].image;
    } else {
      marketHashName = `Container #${defindex}`;
    }
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
