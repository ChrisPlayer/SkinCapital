const steamAuth = require('./steamAuth');
const db = require('../config/database');
const priceService = require('./priceService');
const itemSchema = require('./itemSchema');

let lastRefresh = null;
let isRefreshing = false;

// Global cache: market_hash_name -> icon_url (from Steam Community API)
const iconCache = new Map();

/**
 * Get all Storage Units (caskets) from the inventory
 * @returns {Promise<Array>} Array of casket objects
 */
async function getStorageUnits() {
    const csgoClient = steamAuth.csgoClient;

    if (!steamAuth.isConnectedToGC) {
        console.log('[Inventory] Not connected to GC, waiting...');
        const connected = await steamAuth.waitForGC(30000);
        if (!connected) {
            throw new Error('Cannot connect to Game Coordinator');
        }
    }

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Storage Units request timeout'));
        }, 30000);

        try {
            // Request inventory from GC
            csgoClient.requestPlayersProfile(steamAuth.steamUser.steamID, (err, profile) => {
                if (err) {
                    clearTimeout(timeout);
                    console.error('[Inventory] Profile request error:', err);
                }
            });

            // Get caskets from inventory
            const caskets = [];

            // The GC might have inventory data cached
            if (csgoClient.inventory && csgoClient.inventory.length > 0) {
                for (const item of csgoClient.inventory) {
                    // Casket items have specific def_index for storage units
                    if (item.casket_id || (item.def_index && item.def_index === 1201)) {
                        caskets.push({
                            casket_id: item.id || item.casket_id,
                            name: item.custom_name || 'Storage Unit',
                            item_count: item.casket_contained_item_count || 0
                        });
                    }
                }
            }

            clearTimeout(timeout);
            console.log(`[Inventory] Found ${caskets.length} Storage Units`);
            resolve(caskets);
        } catch (err) {
            clearTimeout(timeout);
            reject(err);
        }
    });
}

/**
 * Load items from a specific Storage Unit
 * @param {string} casketId - The casket ID to load
 * @returns {Promise<Array>} Array of items in the casket
 */
async function loadStorageUnit(casketId) {
    const csgoClient = steamAuth.csgoClient;

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            console.warn(`[Inventory] Casket ${casketId} load timeout, skipping`);
            resolve([]);
        }, 30000);

        try {
            csgoClient.getCasketContents(casketId, (err, items) => {
                clearTimeout(timeout);

                if (err) {
                    console.error(`[Inventory] Error loading casket ${casketId}:`, err);
                    resolve([]);
                    return;
                }

                const parsedItems = items.map(item => {
                    // Use schema resolver for GC items
                    const resolved = itemSchema.resolveItem(item);
                    return {
                        market_hash_name: resolved.market_hash_name,
                        asset_id: item.id?.toString(),
                        casket_id: casketId,
                        float_value: resolved.float_value,
                        paint_seed: resolved.paint_seed
                    };
                });

                console.log(`[Inventory] Loaded ${parsedItems.length} items from casket ${casketId}`);
                resolve(parsedItems);
            });
        } catch (err) {
            clearTimeout(timeout);
            reject(err);
        }
    });
}

// getMarketHashName is now handled by itemSchema.resolveItem()

/**
 * Get all items from all Storage Units
 * @returns {Promise<Array>} Array of all items
 */
async function getAllStorageUnitItems() {
    const caskets = await getStorageUnits();
    const allItems = [];

    // Filter out empty caskets to save time
    const nonEmptyCaskets = caskets.filter(c => c.item_count > 0);
    const skipped = caskets.length - nonEmptyCaskets.length;
    if (skipped > 0) {
        console.log(`[Inventory] Skipping ${skipped} empty Storage Units`);
    }
    console.log(`[Inventory] Loading ${nonEmptyCaskets.length} non-empty Storage Units...`);

    for (const casket of nonEmptyCaskets) {
        // Rate limit: 1 second between GC calls
        await sleep(1000);

        try {
            const items = await loadStorageUnit(casket.casket_id);
            allItems.push(...items);
        } catch (err) {
            console.error(`[Inventory] Failed to load casket ${casket.casket_id}:`, err.message);
        }
    }

    console.log(`[Inventory] Total items from Storage Units: ${allItems.length}`);
    return allItems;
}

/**
 * Get main inventory via Steam Community API
 * @returns {Promise<Array>} Array of inventory items
 */
async function getMainInventory() {
    const community = steamAuth.community;
    const steamId = steamAuth.steamUser?.steamID;

    if (!steamId) {
        console.warn('[Inventory] No Steam ID available for main inventory');
        return [];
    }

    return new Promise((resolve) => {
        community.getUserInventoryContents(steamId, 730, 2, true, (err, inventory) => {
            if (err) {
                console.error('[Inventory] Main inventory error:', err.message);
                resolve([]);
                return;
            }

            const items = inventory.map(item => {
                // Cache icon_url for use by storage unit items
                if (item.icon_url) {
                    iconCache.set(item.market_hash_name, item.icon_url);
                }
                return {
                    market_hash_name: item.market_hash_name,
                    asset_id: item.assetid,
                    casket_id: null,
                    float_value: null,
                    paint_seed: null,
                    icon_url: item.icon_url || null
                };
            });

            console.log(`[Inventory] Main inventory: ${items.length} items (${iconCache.size} icons cached)`);
            resolve(items);
        });
    });
}

/**
 * Get all inventory items (Storage Units + Main)
 * @returns {Promise<Array>} All inventory items
 */
async function getAllInventory() {
    // Fetch main inventory FIRST to populate icon cache
    const mainItems = await getMainInventory();
    const storageItems = await getAllStorageUnitItems();

    // Apply icon_url from cache to storage unit items
    for (const item of storageItems) {
        if (!item.icon_url && iconCache.has(item.market_hash_name)) {
            item.icon_url = iconCache.get(item.market_hash_name);
        }
    }

    // Merge, avoiding duplicates based on asset_id
    const allItems = [...storageItems];
    const existingAssetIds = new Set(storageItems.map(i => i.asset_id).filter(Boolean));

    for (const item of mainItems) {
        if (!item.asset_id || !existingAssetIds.has(item.asset_id)) {
            allItems.push(item);
        }
    }

    return allItems;
}

/**
 * Full refresh: Fetch inventory, update prices, save to database
 * @returns {Promise<Object>} Refresh stats
 */
async function refresh() {
    if (isRefreshing) {
        console.log('[Inventory] Refresh already in progress, skipping');
        return { skipped: true };
    }

    isRefreshing = true;
    const startTime = Date.now();

    try {
        console.log('[Inventory] Starting full refresh...');

        // Initialize item schema (downloads CS2 item DB once, then cached)
        await itemSchema.initialize();

        // Get all items
        const items = await getAllInventory();

        // Clear old items and insert new ones
        db.clearItems();
        for (const item of items) {
            db.insertItem(item);
        }

        // Get unique market hash names for pricing
        const uniqueNames = [...new Set(items.map(i => i.market_hash_name))];
        console.log(`[Inventory] Fetching prices for ${uniqueNames.length} unique items...`);

        // Debug: show how items break down
        const storageItems = items.filter(i => i.casket_id);
        const mainItems = items.filter(i => !i.casket_id);
        const storageUniqueNames = [...new Set(storageItems.map(i => i.market_hash_name))];
        console.log(`[Inventory] Main inventory unique names: ${[...new Set(mainItems.map(i => i.market_hash_name))].length}`);
        console.log(`[Inventory] Storage items unique names: ${storageUniqueNames.length}`);
        if (storageUniqueNames.length <= 5) {
            console.log(`[Inventory] Storage names sample:`, storageUniqueNames);
        } else {
            console.log(`[Inventory] Storage names sample:`, storageUniqueNames.slice(0, 10));
        }

        // Fetch prices (rate limited)
        let totalValue = 0;
        for (const name of uniqueNames) {
            try {
                const prices = await priceService.getPrices(name);
                const itemCount = items.filter(i => i.market_hash_name === name).length;

                if (prices.average) {
                    totalValue += prices.average * itemCount;
                }
            } catch (err) {
                console.error(`[Inventory] Price fetch error for ${name}:`, err.message);
            }
        }

        // Save history snapshot
        const historyService = require('./historyService');
        historyService.saveSnapshot(totalValue, items.length);

        lastRefresh = new Date();
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[Inventory] Refresh complete in ${duration}s. Total value: €${totalValue.toFixed(2)}`);

        return {
            success: true,
            itemCount: items.length,
            totalValue,
            duration: parseFloat(duration)
        };
    } catch (err) {
        console.error('[Inventory] Refresh failed:', err);
        return { success: false, error: err.message };
    } finally {
        isRefreshing = false;
    }
}

/**
 * Get last refresh timestamp
 * @returns {Date|null}
 */
function getLastRefresh() {
    return lastRefresh;
}

/**
 * Check if refresh is in progress
 * @returns {boolean}
 */
function isRefreshInProgress() {
    return isRefreshing;
}

/**
 * Sleep utility
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    getStorageUnits,
    loadStorageUnit,
    getAllStorageUnitItems,
    getMainInventory,
    getAllInventory,
    refresh,
    getLastRefresh,
    isRefreshInProgress
};
