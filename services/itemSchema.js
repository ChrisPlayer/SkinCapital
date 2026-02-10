/**
 * CS2 Item Schema Resolver
 * Downloads item databases from ByMykel/CSGO-API and resolves
 * GC item data (def_index, paint_index) to market_hash_names + images
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const CACHE_DIR = path.join(__dirname, '..', 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'item_schema.json');
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

const SKINS_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json';
const STICKERS_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/stickers.json';

// Weapon defindex → name (fallback)
const WEAPON_NAMES = {
    1: 'Desert Eagle', 2: 'Dual Berettas', 3: 'Five-SeveN', 4: 'Glock-18',
    7: 'AK-47', 8: 'AUG', 9: 'AWP', 10: 'FAMAS', 11: 'G3SG1',
    13: 'Galil AR', 14: 'M249', 16: 'M4A4', 17: 'MAC-10', 19: 'P90',
    23: 'MP5-SD', 24: 'UMP-45', 25: 'XM1014', 26: 'PP-Bizon',
    27: 'MAG-7', 28: 'Negev', 29: 'Sawed-Off', 30: 'Tec-9',
    32: 'P2000', 33: 'MP7', 34: 'MP9', 35: 'Nova', 36: 'P250',
    38: 'SCAR-20', 39: 'SG 553', 40: 'SSG 08',
    60: 'M4A1-S', 61: 'USP-S', 63: 'CZ75-Auto', 64: 'R8 Revolver',
    500: 'Bayonet', 503: 'Classic Knife', 505: 'Flip Knife',
    506: 'Gut Knife', 507: 'Karambit', 508: 'M9 Bayonet',
    509: 'Huntsman Knife', 512: 'Falchion Knife', 514: 'Bowie Knife',
    515: 'Butterfly Knife', 516: 'Shadow Daggers', 517: 'Paracord Knife',
    518: 'Survival Knife', 519: 'Ursus Knife', 520: 'Navaja Knife',
    521: 'Nomad Knife', 522: 'Stiletto Knife', 523: 'Talon Knife',
    525: 'Skeleton Knife', 526: 'Kukri Knife',
    5027: 'Sport Gloves', 5028: 'Driver Gloves', 5029: 'Hand Wraps',
    5030: 'Moto Gloves', 5031: 'Specialist Gloves', 5032: 'Hydra Gloves',
    5033: 'Broken Fang Gloves'
};

// Lookups - populated from API
let skinLookup = {};     // "defindex_paintindex" → { name, image }
let stickerLookup = {};  // sticker_kit_id → { name, image }
let initialized = false;

/**
 * Download JSON from URL
 */
function downloadJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                res.resume();
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

/**
 * Initialize item schema - download from API or load from cache
 */
async function initialize() {
    if (initialized) return;

    // Try loading cache
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            if (cache.timestamp > Date.now() - CACHE_MAX_AGE && cache.version === 2) {
                skinLookup = cache.skins || {};
                stickerLookup = cache.stickers || {};
                initialized = true;
                console.log(`[Schema] Loaded from cache: ${Object.keys(skinLookup).length} skins, ${Object.keys(stickerLookup).length} stickers`);
                return;
            }
        }
    } catch (e) { /* no cache */ }

    console.log('[Schema] Downloading CS2 item database...');

    // Download skins
    try {
        const skins = await downloadJSON(SKINS_URL);
        for (const skin of skins) {
            if (skin.weapon && skin.paint_index) {
                const defindex = skin.weapon.weapon_id;
                const paintIndex = parseInt(skin.paint_index);
                if (defindex && paintIndex) {
                    const key = `${defindex}_${paintIndex}`;
                    // Build base name from weapon + pattern
                    let baseName;
                    if (skin.weapon.name && skin.pattern && skin.pattern.name) {
                        baseName = `${skin.weapon.name} | ${skin.pattern.name}`;
                    } else if (skin.name) {
                        baseName = skin.name.replace(/^StatTrak™ |^★ |^Souvenir /g, '').trim();
                    } else {
                        baseName = `${skin.weapon.name || 'Unknown'} | Skin`;
                    }
                    skinLookup[key] = { name: baseName, image: skin.image || null };
                }
            }
        }
        console.log(`[Schema] Downloaded ${Object.keys(skinLookup).length} skins`);
    } catch (err) {
        console.error('[Schema] Failed to download skins:', err.message);
    }

    // Download stickers
    try {
        const stickers = await downloadJSON(STICKERS_URL);
        for (const sticker of stickers) {
            if (sticker.id && sticker.name) {
                const match = sticker.id.match(/sticker-(\d+)/);
                if (match) {
                    stickerLookup[match[1]] = { name: sticker.name, image: sticker.image || null };
                }
            }
        }
        console.log(`[Schema] Downloaded ${Object.keys(stickerLookup).length} stickers`);
    } catch (err) {
        console.error('[Schema] Failed to download stickers:', err.message);
    }

    // Save cache
    try {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(CACHE_FILE, JSON.stringify({
            version: 2,
            timestamp: Date.now(),
            skins: skinLookup,
            stickers: stickerLookup
        }));
        console.log('[Schema] Cache saved');
    } catch (e) {
        console.error('[Schema] Failed to save cache:', e.message);
    }

    initialized = true;
}

/**
 * Get wear level name from float value
 */
function getWearName(floatValue) {
    if (floatValue === null || floatValue === undefined || isNaN(floatValue)) return null;
    if (floatValue < 0.07) return 'Factory New';
    if (floatValue < 0.15) return 'Minimal Wear';
    if (floatValue < 0.38) return 'Field-Tested';
    if (floatValue < 0.45) return 'Well-Worn';
    return 'Battle-Scarred';
}

/**
 * Extract float value from GC item attributes
 */
function extractFloat(item) {
    if (item.paintwear !== undefined && item.paintwear !== null) return item.paintwear;
    if (item.paint_wear !== undefined && item.paint_wear !== null) return item.paint_wear;
    if (item.attribute && Array.isArray(item.attribute)) {
        const attr = item.attribute.find(a => a.def_index === 8);
        if (attr) {
            if (attr.float_value !== undefined) return attr.float_value;
            // Sometimes stored as uint32 that needs conversion to float
            if (attr.value_bytes) {
                try {
                    const buf = Buffer.from(attr.value_bytes);
                    return buf.readFloatLE(0);
                } catch (e) { /* ignore */ }
            }
        }
    }
    return null;
}

/**
 * Extract paint seed from GC item attributes
 */
function extractPaintSeed(item) {
    if (item.paintseed !== undefined) return item.paintseed;
    if (item.paint_seed !== undefined) return item.paint_seed;
    if (item.attribute && Array.isArray(item.attribute)) {
        const attr = item.attribute.find(a => a.def_index === 6);
        if (attr) {
            if (attr.uint32_value !== undefined) return attr.uint32_value;
            if (attr.value !== undefined) return attr.value;
        }
    }
    return null;
}

/**
 * Extract sticker kit ID from GC item (for standalone stickers)
 * Tries multiple sources: item.stickers array, attributes, etc.
 */
function extractStickerKitId(item) {
    // Method 1: stickers array (node-globaloffensive populates this)
    if (item.stickers && Array.isArray(item.stickers) && item.stickers.length > 0) {
        const s = item.stickers[0];
        if (s.sticker_id) return s.sticker_id;
        if (s.kit) return s.kit;
        if (s.id) return s.id;
    }

    // Method 2: GC attributes (def_index 113 = sticker slot 0 id)
    if (item.attribute && Array.isArray(item.attribute)) {
        for (const attr of item.attribute) {
            if (attr.def_index === 113) {
                if (attr.uint32_value !== undefined) return attr.uint32_value;
                if (attr.value !== undefined) return attr.value;
                if (attr.value_bytes) {
                    try {
                        return Buffer.from(attr.value_bytes).readUInt32LE(0);
                    } catch (e) { /* ignore */ }
                }
            }
        }
    }

    return null;
}

/**
 * Resolve a GC item to its market_hash_name + image
 * @param {Object} item - Raw GC item from getCasketContents
 * @returns {Object} { market_hash_name, float_value, paint_seed, image_url }
 */
function resolveItem(item) {
    const defindex = item.def_index;
    const paintIndex = item.paint_index;
    const quality = item.quality;
    const floatValue = extractFloat(item);
    const paintSeed = extractPaintSeed(item);

    // Build quality prefix
    let prefix = '';
    const isKnife = defindex >= 500 && defindex < 600;
    const isGlove = defindex >= 5027 && defindex <= 5035;
    if (isKnife || isGlove) prefix = '★ ';
    if (quality === 9) prefix += 'StatTrak™ ';
    if (quality === 12) prefix += 'Souvenir ';

    let marketHashName = null;
    let imageUrl = null;

    // Case 1: Weapon skin (has paint_index)
    if (paintIndex && defindex) {
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
    }
    // Case 2: Sticker (defindex 1209) or Patch (4609) or similar
    else if (defindex === 1209 || defindex === 4609 || defindex === 1348 || defindex === 1349) {
        const kitId = extractStickerKitId(item);
        if (kitId && stickerLookup[kitId]) {
            marketHashName = stickerLookup[kitId].name;
            imageUrl = stickerLookup[kitId].image;
        } else {
            const typeLabel = defindex === 1209 ? 'Sticker' : defindex === 4609 ? 'Patch' : 'Graffiti';
            marketHashName = kitId ? `${typeLabel} #${kitId}` : `${typeLabel} #${defindex}`;
        }
    }
    // Case 3: Vanilla knife/weapon (no paint)
    else if (defindex && WEAPON_NAMES[defindex]) {
        marketHashName = prefix + WEAPON_NAMES[defindex];
    }
    // Case 4: Unknown item - store def_index for debugging
    else {
        marketHashName = `Item #${defindex || 'Unknown'}`;
    }

    return {
        market_hash_name: marketHashName,
        float_value: floatValue,
        paint_seed: paintSeed,
        image_url: imageUrl
    };
}

module.exports = { initialize, resolveItem, getWearName, WEAPON_NAMES };
