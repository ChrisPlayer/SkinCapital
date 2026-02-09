const axios = require('axios');
const PQueue = require('p-queue').default;
const db = require('../config/database');

// Rate limiting queues with conservative settings
const steamQueue = new PQueue({ concurrency: 1, interval: 3500, intervalCap: 1 });

// Cache for Skinport prices (full list, refreshed once per session)
let skinportCache = null;
let skinportCacheTime = 0;
const SKINPORT_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// USD to EUR conversion rate
const USD_TO_EUR = parseFloat(process.env.USD_TO_EUR_RATE) || 0.92;

/**
 * Get prices from multiple sources for an item
 * @param {string} marketHashName - Item market hash name
 * @returns {Promise<Object>} Prices from all sources
 */
async function getPrices(marketHashName) {
    const prices = {
        steam: null,
        skinport: null,
        average: null
    };

    // Fetch Steam price (primary source)
    const steamPrice = await getSteamMarketPrice(marketHashName);
    prices.steam = steamPrice;

    // Try Skinport from cache
    const skinportPrice = await getSkinportPrice(marketHashName);
    prices.skinport = skinportPrice;

    // Calculate average from available prices
    const validPrices = [steamPrice, skinportPrice].filter(p => p !== null);
    if (validPrices.length > 0) {
        prices.average = validPrices.reduce((a, b) => a + b, 0) / validPrices.length;
    }

    // Save to database
    if (steamPrice !== null) {
        db.insertPrice(marketHashName, 'steam', steamPrice);
    }
    if (skinportPrice !== null) {
        db.insertPrice(marketHashName, 'skinport', skinportPrice);
    }

    return prices;
}

/**
 * Get Steam Market price
 * @param {string} marketHashName 
 * @returns {Promise<number|null>} Price in EUR or null
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
                const priceStr = response.data.lowest_price;
                const price = parseSteamPrice(priceStr);
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
            // Don't spam logs for items without market listings
            if (err.response?.status !== 500) {
                console.error(`[Price] Steam error for ${marketHashName}:`, err.message);
            }
            return null;
        }
    });
}

/**
 * Parse Steam price string to number
 * @param {string} priceStr - Price string like "1,23€" or "$1.23"
 * @returns {number} Price as float
 */
function parseSteamPrice(priceStr) {
    let cleaned = priceStr
        .replace(/[€$£]/g, '')
        .replace(/\s/g, '')
        .trim();

    // Handle European format (1.234,56) vs US format (1,234.56)
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
 * Get Skinport price from cached full item list
 * @param {string} marketHashName 
 * @returns {Promise<number|null>} Price in EUR or null
 */
async function getSkinportPrice(marketHashName) {
    try {
        // Fetch full Skinport list if not cached or expired
        if (!skinportCache || Date.now() - skinportCacheTime > SKINPORT_CACHE_TTL) {
            console.log('[Price] Refreshing Skinport price cache...');

            const response = await axios.get('https://api.skinport.com/v1/items?app_id=730&currency=EUR', {
                timeout: 30000,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            if (response.data && Array.isArray(response.data)) {
                // Build cache map
                skinportCache = new Map();
                for (const item of response.data) {
                    if (item.market_hash_name && item.min_price) {
                        skinportCache.set(item.market_hash_name, item.min_price);
                    }
                }
                skinportCacheTime = Date.now();
                console.log(`[Price] Skinport cache updated: ${skinportCache.size} items`);
            }
        }

        // Lookup from cache
        if (skinportCache && skinportCache.has(marketHashName)) {
            return skinportCache.get(marketHashName);
        }

        return null;
    } catch (err) {
        if (err.response?.status === 429) {
            console.warn('[Price] Skinport rate limited, using cache');
        } else {
            console.error('[Price] Skinport error:', err.message);
        }
        return skinportCache?.get(marketHashName) || null;
    }
}

/**
 * Get cached prices from database
 * @param {string} marketHashName 
 * @returns {Object} Cached prices
 */
function getCachedPrices(marketHashName) {
    const prices = {
        steam: null,
        skinport: null,
        average: null
    };

    const rows = db.all(`
        SELECT source, price_eur FROM prices 
        WHERE market_hash_name = ? 
        AND timestamp > datetime('now', '-6 hours')
        ORDER BY timestamp DESC
    `, [marketHashName]);

    for (const row of rows) {
        if (prices[row.source] === null) {
            prices[row.source] = row.price_eur;
        }
    }

    const validPrices = [prices.steam, prices.skinport].filter(p => p !== null);
    if (validPrices.length > 0) {
        prices.average = validPrices.reduce((a, b) => a + b, 0) / validPrices.length;
    }

    return prices;
}

/**
 * Sleep utility
 * @param {number} ms 
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    getPrices,
    getSteamMarketPrice,
    getSkinportPrice,
    getCachedPrices
};
