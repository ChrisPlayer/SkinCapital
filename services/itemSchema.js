/**
 * CS2 Item Schema Resolver
 * Downloads item databases from ByMykel/CSGO-API and resolves
 * GC item data (def_index, paint_index) to market_hash_names
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const CACHE_DIR = path.join(__dirname, '..', 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'item_schema.json');
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

const SKINS_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json';
const STICKERS_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/stickers.json';

// Weapon defindex → name (fallback if API fails)
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
let skinLookup = {};     // "defindex_paintindex" → base name (without wear)
let stickerLookup = {};  // sticker_kit_id → name

/**
 * Download JSON from URL
 */
function downloadJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
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
    // Try loading cache
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            if (cache.timestamp > Date.now() - CACHE_MAX_AGE) {
                skinLookup = cache.skins || {};
                stickerLookup = cache.stickers || {};
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
                // Use weapon.weapon_id (numeric defindex) from ByMykel API
                const defindex = skin.weapon.weapon_id || skin.weapon.id;
                const paintIndex = parseInt(skin.paint_index);
                if (defindex && paintIndex) {
                    const key = `${defindex}_${paintIndex}`;
                    // Store base name: "AK-47 | Fire Serpent" (without wear or StatTrak™ prefix)
                    let baseName = skin.weapon.name;
                    if (skin.pattern && skin.pattern.name) {
                        baseName += ' | ' + skin.pattern.name;
                    } else if (skin.name) {
                        // skin.name is like "AK-47 | Fire Serpent"
                        baseName = skin.name.replace(/^StatTrak™ |^★ |^Souvenir /g, '').trim();
                    }
                    skinLookup[key] = baseName;
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
            // Extract numeric ID from sticker.id like "sticker-4879"
            if (sticker.id && sticker.name) {
                const match = sticker.id.match(/sticker-(\d+)/);
                if (match) {
                    stickerLookup[match[1]] = sticker.name;
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
            timestamp: Date.now(),
            skins: skinLookup,
            stickers: stickerLookup
        }));
        console.log('[Schema] Cache saved');
    } catch (e) {
        console.error('[Schema] Failed to save cache:', e.message);
    }
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
    if (item.paintwear) return item.paintwear;
    if (item.paint_wear) return item.paint_wear;
    if (item.attribute && Array.isArray(item.attribute)) {
        const attr = item.attribute.find(a => a.def_index === 8);
        if (attr && attr.float_value !== undefined) return attr.float_value;
    }
    return null;
}

/**
 * Extract paint seed from GC item attributes
 */
function extractPaintSeed(item) {
    if (item.paintseed) return item.paintseed;
    if (item.paint_seed) return item.paint_seed;
    if (item.attribute && Array.isArray(item.attribute)) {
        const attr = item.attribute.find(a => a.def_index === 6);
        if (attr && attr.uint32_value !== undefined) return attr.uint32_value;
    }
    return null;
}

/**
 * Extract sticker kit ID from GC item attributes (for standalone stickers)
 */
function extractStickerKitId(item) {
    if (item.attribute && Array.isArray(item.attribute)) {
        // Attribute def_index 113 = sticker slot 0 ID
        const attr = item.attribute.find(a => a.def_index === 113);
        if (attr) {
            return attr.uint32_value || attr.value;
        }
    }
    // Sometimes the sticker info is in the stickers array
    if (item.stickers && item.stickers.length > 0) {
        return item.stickers[0].sticker_id || item.stickers[0].kit;
    }
    return null;
}

/**
 * Resolve a GC item to its market_hash_name
 * @param {Object} item - Raw GC item from getCasketContents
 * @returns {Object} { market_hash_name, float_value, paint_seed }
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

    // Case 1: Weapon skin (has paint_index)
    if (paintIndex && defindex) {
        const key = `${defindex}_${paintIndex}`;
        const baseName = skinLookup[key];

        if (baseName) {
            const wear = getWearName(floatValue);
            marketHashName = wear ? `${prefix}${baseName} (${wear})` : `${prefix}${baseName}`;
        } else {
            // Fallback: weapon name + unknown skin
            const weaponName = WEAPON_NAMES[defindex] || `Weapon #${defindex}`;
            const wear = getWearName(floatValue);
            const base = `${prefix}${weaponName} | Skin #${paintIndex}`;
            marketHashName = wear ? `${base} (${wear})` : base;
        }
    }
    // Case 2: Sticker (defindex 1209)
    else if (defindex === 1209) {
        const kitId = extractStickerKitId(item);
        if (kitId && stickerLookup[kitId]) {
            marketHashName = stickerLookup[kitId];
        } else {
            marketHashName = `Sticker #${kitId || defindex}`;
        }
    }
    // Case 3: Graffiti (defindex 1348/1349)
    else if (defindex === 1348 || defindex === 1349) {
        marketHashName = `Graffiti #${defindex}`;
    }
    // Case 4: Vanilla knife/weapon (no paint)
    else if (defindex && WEAPON_NAMES[defindex]) {
        marketHashName = prefix + WEAPON_NAMES[defindex];
    }
    // Case 5: Unknown
    else {
        marketHashName = `Item #${defindex || 'Unknown'}`;
    }

    return {
        market_hash_name: marketHashName,
        float_value: floatValue,
        paint_seed: paintSeed
    };
}

module.exports = { initialize, resolveItem, getWearName, WEAPON_NAMES };
