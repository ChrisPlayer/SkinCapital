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
 * Get items with significant price changes
 * @param {number} thresholdPercent - Minimum change percentage
 * @returns {Array} Items with price alerts
 */
function getPriceAlerts(thresholdPercent = 5) {
    try {
        const alerts = [];

        // Get items with old and new prices - simplified query
        const rows = db.all(`
            SELECT 
                market_hash_name,
                price_eur as current_price,
                source
            FROM prices 
            WHERE timestamp > datetime('now', '-1 hour')
            GROUP BY market_hash_name
        `);

        // For each item, check if we have older prices to compare
        for (const row of rows) {
            const oldPrices = db.all(`
                SELECT AVG(price_eur) as avg_price
                FROM prices 
                WHERE market_hash_name = ? 
                AND timestamp < datetime('now', '-1 day')
                AND timestamp > datetime('now', '-2 days')
            `, [row.market_hash_name]);

            if (oldPrices.length > 0 && oldPrices[0].avg_price && row.current_price) {
                const oldAvg = oldPrices[0].avg_price;
                const change = row.current_price - oldAvg;
                const percentage = (change / oldAvg) * 100;

                if (Math.abs(percentage) >= thresholdPercent) {
                    alerts.push({
                        market_hash_name: row.market_hash_name,
                        current_price: row.current_price,
                        old_price: oldAvg,
                        change,
                        percentage,
                        direction: percentage > 0 ? 'up' : 'down'
                    });
                }
            }
        }

        // Sort by absolute percentage change
        alerts.sort((a, b) => Math.abs(b.percentage) - Math.abs(a.percentage));

        return alerts;
    } catch (err) {
        console.error('[History] Failed to get price alerts:', err.message);
        return [];
    }
}

module.exports = {
    saveSnapshot,
    getHistory,
    getItemHistory,
    get24hChange,
    getPriceAlerts
};
