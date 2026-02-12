const db = require('../config/database');

/**
 * Save a snapshot of current inventory value
 * @param {number} totalValue - Total value in EUR
 * @param {number} itemCount - Number of items
 */
function saveSnapshot(totalValue, itemCount) {
    try {
        db.saveHistory(totalValue, itemCount);
        console.log(`[History] Saved snapshot: €${totalValue.toFixed(2)}, ${itemCount} items`);
    } catch (err) {
        console.error('[History] Failed to save snapshot:', err.message);
    }
}

/**
 * Get value history for chart
 * @param {number} days - Number of days to fetch
 * @returns {Array} History records
 */
function getHistory(days = 30) {
    try {
        const records = db.getHistory(days);
        return records.map(r => ({
            date: r.timestamp,
            value: r.total_value,
            itemCount: r.item_count
        }));
    } catch (err) {
        console.error('[History] Failed to get history:', err.message);
        return [];
    }
}

/**
 * Get price history for a specific item
 * @param {string} marketHashName - Item name
 * @param {number} days - Number of days
 * @returns {Array} Price history
 */
function getItemHistory(marketHashName, days = 30) {
    try {
        const rows = db.all(`
            SELECT source, price_eur, timestamp 
            FROM prices 
            WHERE market_hash_name = ? 
            AND timestamp > datetime('now', '-' || ? || ' days')
            ORDER BY timestamp ASC
        `, [marketHashName, days.toString()]);

        return rows.map(r => ({
            source: r.source,
            price: r.price_eur,
            timestamp: r.timestamp
        }));
    } catch (err) {
        console.error('[History] Failed to get item history:', err.message);
        return [];
    }
}

/**
 * Calculate 24h value change
 * @param {number} currentValue - Current total value
 * @returns {Object} Change info
 */
function get24hChange(currentValue) {
    try {
        const yesterday = db.getYesterdayValue();

        if (!yesterday) {
            return { change: 0, percentage: 0, hasData: false };
        }

        const change = currentValue - yesterday.total_value;
        const percentage = yesterday.total_value > 0
            ? (change / yesterday.total_value) * 100
            : 0;

        return {
            change,
            percentage,
            hasData: true,
            yesterdayValue: yesterday.total_value
        };
    } catch (err) {
        console.error('[History] Failed to calculate 24h change:', err.message);
        return { change: 0, percentage: 0, hasData: false };
    }
}

/**
 * Calculate 24h price change for a specific item
 * @param {string} marketHashName - Item name
 * @param {number} currentPrice - Current price
 * @returns {Object} Change info
 */
function getItem24hChange(marketHashName, currentPrice) {
    try {
        // Get average price from 24h-48h ago
        const rows = db.all(`
            SELECT AVG(price_eur) as avg_price
            FROM prices 
            WHERE market_hash_name = ? 
            AND timestamp < datetime('now', '-20 hours')
            AND timestamp > datetime('now', '-48 hours')
        `, [marketHashName]);

        if (rows.length > 0 && rows[0].avg_price) {
            const oldPrice = rows[0].avg_price;
            const change = currentPrice - oldPrice;
            const percentage = (change / oldPrice) * 100;

            return {
                change,
                percentage,
                hasData: true,
                oldPrice
            };
        }

        return { change: 0, percentage: 0, hasData: false };
    } catch (err) {
        console.error(`[History] Failed to get item 24h change for ${marketHashName}:`, err.message);
        return { change: 0, percentage: 0, hasData: false };
    }
}

module.exports = {
    saveSnapshot,
    getHistory,
    getItemHistory,
    get24hChange,
    getItem24hChange
};
