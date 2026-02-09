const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'inventory.db');
let db = null;

/**
 * Initialize database
 */
async function init() {
    const SQL = await initSqlJs();

    // Load existing database or create new
    if (fs.existsSync(dbPath)) {
        const buffer = fs.readFileSync(dbPath);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    // Create tables
    db.run(`
        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            market_hash_name TEXT NOT NULL,
            asset_id TEXT,
            casket_id TEXT,
            float_value REAL,
            paint_seed INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS prices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            market_hash_name TEXT NOT NULL,
            source TEXT NOT NULL,
            price_eur REAL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            total_value REAL NOT NULL,
            item_count INTEGER NOT NULL,
            timestamp DATE UNIQUE DEFAULT (date('now'))
        )
    `);

    // Create indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_items_market_hash ON items(market_hash_name)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_items_casket ON items(casket_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_prices_name ON prices(market_hash_name)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_prices_timestamp ON prices(timestamp)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp)`);

    // Cleanup old data
    db.run(`DELETE FROM history WHERE timestamp < date('now', '-90 days')`);
    db.run(`DELETE FROM prices WHERE timestamp < datetime('now', '-30 days')`);

    saveToFile();
    console.log('[DB] Database initialized successfully');
}

/**
 * Save database to file
 */
function saveToFile() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    }
}

/**
 * Execute query and return all results
 */
function all(sql, params = []) {
    try {
        const stmt = db.prepare(sql);
        if (params.length > 0) stmt.bind(params);
        const results = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
    } catch (err) {
        console.error('[DB] Query error:', err.message);
        return [];
    }
}

/**
 * Execute query and return first result
 */
function get(sql, params = []) {
    const results = all(sql, params);
    return results.length > 0 ? results[0] : null;
}

/**
 * Execute query (INSERT, UPDATE, DELETE)
 */
function run(sql, params = []) {
    try {
        db.run(sql, params);
        saveToFile();
        return { changes: db.getRowsModified() };
    } catch (err) {
        console.error('[DB] Run error:', err.message);
        return { changes: 0 };
    }
}

// Helper functions
function getItems() {
    return all('SELECT * FROM items ORDER BY market_hash_name');
}

function getItemsByName(marketHashName) {
    return all('SELECT * FROM items WHERE market_hash_name = ?', [marketHashName]);
}

function getItemsFromCasket(casketId) {
    return all('SELECT * FROM items WHERE casket_id = ?', [casketId]);
}

function insertItem(item) {
    return run(
        `INSERT INTO items (market_hash_name, asset_id, casket_id, float_value, paint_seed) VALUES (?, ?, ?, ?, ?)`,
        [item.market_hash_name, item.asset_id, item.casket_id, item.float_value, item.paint_seed]
    );
}

function clearItems() {
    return run('DELETE FROM items');
}

function getLatestPrice(marketHashName) {
    return get(
        `SELECT * FROM prices WHERE market_hash_name = ? ORDER BY timestamp DESC LIMIT 1`,
        [marketHashName]
    );
}

function getLatestPrices() {
    return all(`
        SELECT p1.* FROM prices p1
        INNER JOIN (
            SELECT market_hash_name, MAX(timestamp) as max_ts
            FROM prices GROUP BY market_hash_name
        ) p2 ON p1.market_hash_name = p2.market_hash_name AND p1.timestamp = p2.max_ts
    `);
}

function insertPrice(marketHashName, source, priceEur) {
    return run(
        `INSERT INTO prices (market_hash_name, source, price_eur) VALUES (?, ?, ?)`,
        [marketHashName, source, priceEur]
    );
}

function getHistory(days = 30) {
    return all(
        `SELECT total_value, item_count, timestamp FROM history WHERE timestamp > date('now', '-' || ? || ' days') ORDER BY timestamp ASC`,
        [days.toString()]
    );
}

function saveHistory(totalValue, itemCount) {
    return run(
        `INSERT OR REPLACE INTO history (total_value, item_count, timestamp) VALUES (?, ?, date('now'))`,
        [totalValue, itemCount]
    );
}

function getYesterdayValue() {
    return get(`SELECT total_value FROM history WHERE timestamp = date('now', '-1 day') LIMIT 1`);
}

module.exports = {
    init,
    db: { prepare: (sql) => ({ all: (params) => all(sql, params || []), get: (params) => get(sql, params || []) }) },
    all,
    get,
    run,
    getItems,
    getItemsByName,
    getItemsFromCasket,
    insertItem,
    clearItems,
    getLatestPrice,
    getLatestPrices,
    insertPrice,
    getHistory,
    saveHistory,
    getYesterdayValue
};
