const db = require('./config/database');

async function restoreHistory() {
    await db.init();

    // Calculate total value effectively
    // Instead of duplicating logic, let's just use the known good value from debug_pricing.js output
    // But to be safe, we can recalculate inside here if needed.
    // However, I recall the exact procedure: 
    // db.run(`INSERT OR REPLACE INTO history (total_value, item_count, timestamp) VALUES (?, ?, date('now'))`, [totalValue, itemCount]);

    const totalValue = 562.89; // Value calculated by debug_pricing.js
    const itemCount = 454;     // Item count from DB

    console.log(`Restoring history for today with Value: €${totalValue}, Items: ${itemCount}`);

    // Delete any bad entry first to be safe
    db.run(`DELETE FROM history WHERE timestamp = date('now')`);

    // Insert new valid entry
    const result = db.saveHistory(totalValue, itemCount);

    console.log('History updated:', result);

    // Check results
    const history = db.all('SELECT * FROM history ORDER BY timestamp ASC');
    console.log('Current History:', history);
}

restoreHistory().catch(console.error);
