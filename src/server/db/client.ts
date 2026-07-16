import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { logger } from '../lib/logger.ts';
import { DATA_DIR } from '../lib/paths.ts';

let sqlite: Database.Database | null = null;

export function getSqlite() {
  if (!sqlite) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return sqlite;
}

export function initDb() {
  // DB_PATH env override exists for the tests (':memory:'); resolved lazily so
  // a test can set it before calling initDb(). Default anchors under DATA_DIR
  // (relocatable by the Docker image / Windows exe shells).
  const dbPath = process.env.DB_PATH || path.join(DATA_DIR, 'inventory.db');
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  // Avoid SQLITE_BUSY when the cron price refresh and a manual refresh write concurrently.
  sqlite.pragma('busy_timeout = 5000');

  // Profiles table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      steam_id TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL,
      avatar_url TEXT,
      item_count INTEGER DEFAULT 0,
      total_value REAL DEFAULT 0,
      last_refresh TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Items table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      steam_id TEXT,
      market_hash_name TEXT NOT NULL,
      asset_id TEXT,
      casket_id TEXT,
      casket_name TEXT,
      float_value REAL,
      paint_seed INTEGER,
      icon_url TEXT,
      stickers TEXT,
      schema_image TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Prices table (unchanged)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      market_hash_name TEXT NOT NULL,
      source TEXT NOT NULL,
      price_eur REAL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // History table (one snapshot per profile, per price source, per local day)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      steam_id TEXT,
      source TEXT NOT NULL DEFAULT 'steam',
      total_value REAL NOT NULL,
      item_count INTEGER NOT NULL,
      timestamp DATE DEFAULT (date('now', 'localtime'))
    )
  `);

  // Migration: add persona_name to profiles if missing
  const profileCols = sqlite.pragma('table_info(profiles)') as Array<{ name: string }>;
  if (!profileCols.some((c) => c.name === 'persona_name')) {
    sqlite.exec('ALTER TABLE profiles ADD COLUMN persona_name TEXT');
  }

  // Migration: add steam_id to items if missing
  const itemCols = sqlite.pragma('table_info(items)') as Array<{ name: string }>;
  if (!itemCols.some((c) => c.name === 'steam_id')) {
    sqlite.exec('ALTER TABLE items ADD COLUMN steam_id TEXT');
  }

  // Migration: add steam_id to history if missing (recreate for compound unique)
  const historyCols = sqlite.pragma('table_info(history)') as Array<{ name: string }>;
  if (!historyCols.some((c) => c.name === 'steam_id')) {
    sqlite.exec('ALTER TABLE history RENAME TO history_old');
    sqlite.exec(`
      CREATE TABLE history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        steam_id TEXT,
        source TEXT NOT NULL DEFAULT 'steam',
        total_value REAL NOT NULL,
        item_count INTEGER NOT NULL,
        timestamp DATE DEFAULT (date('now', 'localtime'))
      )
    `);
    try {
      sqlite.exec(
        'INSERT INTO history (total_value, item_count, timestamp) SELECT total_value, item_count, timestamp FROM history_old',
      );
    } catch {
      /* ignore migration errors */
    }
    sqlite.exec('DROP TABLE IF EXISTS history_old');
  }

  // Migration: per-source history snapshots (steam/csfloat/skinport)
  const historyCols2 = sqlite.pragma('table_info(history)') as Array<{ name: string }>;
  if (!historyCols2.some((c) => c.name === 'source')) {
    sqlite.exec(`ALTER TABLE history ADD COLUMN source TEXT NOT NULL DEFAULT 'steam'`);
  }

  // Indexes
  // Key/value app settings (e.g. pricing mode + proxies, set from the UI)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // Purchase prices (per profile, per item) backing the P&L computation
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS purchases (
      steam_id TEXT NOT NULL,
      market_hash_name TEXT NOT NULL,
      buy_price_eur REAL NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (steam_id, market_hash_name)
    )
  `);

  // Inventory movements: per-item quantity deltas detected between two
  // inventory refreshes (feeds the Activity tab's "movements" section)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS inventory_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      steam_id TEXT NOT NULL,
      market_hash_name TEXT NOT NULL,
      delta INTEGER NOT NULL,
      price_eur REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Custom price-threshold alerts (triggered when a fresh steam price crosses)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS price_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      steam_id TEXT NOT NULL,
      market_hash_name TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('above','below')),
      threshold_eur REAL NOT NULL,
      triggered_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_items_market_hash ON items(market_hash_name)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_items_casket ON items(casket_id)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_items_steam_id ON items(steam_id)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_prices_name ON prices(market_hash_name)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_prices_timestamp ON prices(timestamp)');
  // Composite index backing the "latest price per (name, source)" reads.
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_prices_name_source_ts ON prices(market_hash_name, source, timestamp)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp)');
  // Alert trigger checks look up active alerts by item name on every fresh price.
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_price_alerts_name ON price_alerts(market_hash_name)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_inventory_events_steam_id ON inventory_events(steam_id, created_at)');
  // One snapshot per (profile, source, day) — replaces the old (profile, day) key.
  sqlite.exec('DROP INDEX IF EXISTS idx_history_steam_date');
  sqlite.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_history_steam_source_date ON history(steam_id, source, timestamp)',
  );

  // Cleanup old data (also run periodically by the cron, not just at boot)
  cleanupOldData();

  logger.info('[DB] Database initialized (WAL mode, better-sqlite3)');
}

/** Retention: prune old history/price rows. Safe to call on a schedule. */
export function cleanupOldData() {
  const sql = getSqlite();
  sql.exec(`DELETE FROM history WHERE timestamp < date('now', '-90 days')`);
  sql.exec(`DELETE FROM prices WHERE timestamp < datetime('now', '-30 days')`);
  sql.exec(`DELETE FROM inventory_events WHERE created_at < datetime('now', '-90 days')`);
}

export function closeDb() {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    logger.info('[DB] Database closed');
  }
}
