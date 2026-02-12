const axios = require('axios');
const PQueue = require('p-queue').default;
const db = require('../config/database');

// Rate limiting queue: conservative 3.5s interval for Steam Market
const steamQueue = new PQueue({ concurrency: 1, interval: 3500, intervalCap: 1 });

/**
 * Get Steam Market price for an item
 * @param {string} marketHashName - Item market hash name
 * @returns {Promise<Object>} Price info
 */
async function getPrices(marketHashName) {
    // 1. Check cache first
    const cached = getCachedPrices(marketHashName);

    // 2. Smart Cache Strategy
    // If we have a cached price, check its age
    if (cached.average && cached.timestamp) {
        let cacheTime;
        try {
            cacheTime = new Date(cached.timestamp + (cached.timestamp.toString().includes('Z') ? '' : 'Z')); // Treat as UTC
        } catch (e) {
            cacheTime = new Date(); // Fallback to now if parsing fails (won't refresh immediately but prevents crash)
        }

        const ageHours = (Date.now() - cacheTime.getTime()) / (1000 * 60 * 60);

        if (ageHours < 20) {
            // Fresh enough (< 20 hours)
            return cached;
        }

        // If > 20 hours, we want to try refreshing ("start from 0")
        // But keep cached as fallback in case of failure
        console.log(`[Price] Cache stale for ${marketHashName} (${ageHours.toFixed(1)}h old). Refreshing...`);
    }

    // 3. Fetch from Steam (if not cached OR if stale)
    const steamPrice = await getSteamMarketPrice(marketHashName);

    // 4. Handle Result
    if (steamPrice !== null) {
        // Success: Update DB and return new price
        db.insertPrice(marketHashName, 'steam', steamPrice);
        return { steam: steamPrice, average: steamPrice };
    }

    // 5. Fallback: If fetch failed (Rate Limit?), use stale cache if available
    if (cached.average) {
        console.warn(`[Price] Refresh failed for ${marketHashName}, using stale cache.`);
        return cached;
    }

    // 6. No data available at all
    return { steam: null, average: null };
}

/**
 * Get prices for a list of stickers
 * @param {Array} stickers - Array of sticker objects { name, ... }
 * @returns {Promise<Object>} Map of sticker name -> price
 */
async function getStickerPrices(stickers) {
    const prices = {};
    if (!stickers || stickers.length === 0) return prices;

    for (const sticker of stickers) {
        if (sticker.name && !prices[sticker.name]) {
            // Reuse the main smart getPrices logic
            const p = await getPrices(sticker.name);
            if (p.average) {
                prices[sticker.name] = p.average;
            }
        }
    }
    return prices;
}

/**
 * Get Steam Market price
 */
async function getSteamMarketPrice(marketHashName) {
    return steamQueue.add(async () => {
        try {
            const url = `https://steamcommunity.com/market/priceoverview/?appid=730&market_hash_name=${encodeURIComponent(marketHashName)}&currency=3`;

            const response = await axios.get(url, {
                timeout: 15000,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            if (response.data && response.data.success && response.data.lowest_price) {
                const price = parseSteamPrice(response.data.lowest_price);
                console.log(`[Price] Steam: ${marketHashName} = €${price.toFixed(2)}`);
                return price;
            }

            return null;
        } catch (err) {
            if (err.response?.status === 429) {
                console.warn(`[Price] Steam rate limited, waiting 60s...`);
                await sleep(60000);
                return null;
            }
            if (err.response?.status !== 500) {
                console.error(`[Price] Steam error for ${marketHashName}:`, err.message);
            }
            return null;
        }
    });
}

/**
 * Parse Steam price string to number
 */
function parseSteamPrice(priceStr) {
    let cleaned = priceStr
        .replace(/[€$£]/g, '')
        .replace(/\s/g, '')
        .trim();

    if (cleaned.includes(',') && cleaned.includes('.')) {
        const lastComma = cleaned.lastIndexOf(',');
        const lastDot = cleaned.lastIndexOf('.');
        if (lastComma > lastDot) {
            cleaned = cleaned.replace(/\./g, '').replace(',', '.');
        } else {
            cleaned = cleaned.replace(/,/g, '');
        }
    } else if (cleaned.includes(',')) {
        const parts = cleaned.split(',');
        if (parts.length === 2 && parts[1].length <= 2) {
            cleaned = cleaned.replace(',', '.');
        } else {
            cleaned = cleaned.replace(/,/g, '');
        }
    }

    return parseFloat(cleaned) || 0;
}

/**
 * Get cached prices from database
 */
function getCachedPrices(marketHashName) {
    const prices = {
        steam: null,
        average: null,
        timestamp: null
    };

    const rows = db.all(`
        SELECT source, price_eur, timestamp FROM prices 
        WHERE market_hash_name = ? 
        ORDER BY timestamp DESC
        LIMIT 5
    `, [marketHashName]);

    for (const row of rows) {
        if (row.source === 'steam' && prices.steam === null) {
            prices.steam = row.price_eur;
            prices.timestamp = row.timestamp; // capture timestamp
        }
    }

    prices.average = prices.steam;
    return prices;
}

/**
 * Get the Steam image URL for an item
 */
function getItemImageUrl(marketHashName) {
    return `https://community.akamai.steamstatic.com/economy/image/class/730/${encodeURIComponent(marketHashName)}/300fx300f`;
}

/**
 * Get item rarity based on name patterns
 */
function getItemRarity(marketHashName) {
    const name = marketHashName.toLowerCase();

    if (name.includes('★') || name.startsWith('★')) {
        if (name.includes('stattrak')) return { name: 'Extraordinary', color: '#FFD700', bg: 'rgba(255, 215, 0, 0.15)' };
        return { name: 'Extraordinary', color: '#FFD700', bg: 'rgba(255, 215, 0, 0.15)' };
    }
    if (name.includes('covert') || name.includes('awp |') || name.includes('ak-47 |') || name.includes('m4a4 |') || name.includes('m4a1-s |')) {
        // Common high-tier weapons - check by quality tags
    }

    // Rarity by exterior / special patterns
    if (name.includes('stattrak')) return { name: 'StatTrak', color: '#CF6A32', bg: 'rgba(207, 106, 50, 0.15)' };
    if (name.includes('souvenir')) return { name: 'Souvenir', color: '#FFD700', bg: 'rgba(255, 215, 0, 0.15)' };

    // Pins, stickers, agents, etc
    if (name.includes('pin')) return { name: 'Remarkable', color: '#4B69FF', bg: 'rgba(75, 105, 255, 0.15)' };
    if (name.includes('sticker')) return { name: 'High Grade', color: '#4B69FF', bg: 'rgba(75, 105, 255, 0.15)' };
    if (name.includes('music kit')) return { name: 'High Grade', color: '#4B69FF', bg: 'rgba(75, 105, 255, 0.15)' };
    if (name.includes('agent')) return { name: 'Distinguished', color: '#8847FF', bg: 'rgba(136, 71, 255, 0.15)' };

    // Default
    return { name: 'Mil-Spec', color: '#4B69FF', bg: 'rgba(75, 105, 255, 0.15)' };
}

/**
 * Get wear level from float value
 */
function getWearLevel(floatValue) {
    if (floatValue === null || floatValue === undefined) return null;
    if (floatValue < 0.07) return { name: 'Factory New', short: 'FN', color: '#4CAF50' };
    if (floatValue < 0.15) return { name: 'Minimal Wear', short: 'MW', color: '#8BC34A' };
    if (floatValue < 0.38) return { name: 'Field-Tested', short: 'FT', color: '#FFC107' };
    if (floatValue < 0.45) return { name: 'Well-Worn', short: 'WW', color: '#FF9800' };
    return { name: 'Battle-Scarred', short: 'BS', color: '#F44336' };
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    getPrices,
    getSteamMarketPrice,
    getCachedPrices,
    getStickerPrices,
    getItemImageUrl,
    getItemRarity,
    getWearLevel
};
