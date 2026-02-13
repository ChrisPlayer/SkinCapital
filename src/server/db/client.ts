import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import fs from 'fs';
import * as schema from './schema.ts';
import { logger } from '../lib/logger.ts';

const DB_PATH = path.join(process.cwd(), 'data', 'inventory.db');

let sqlite: Database.Database | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!_db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return _db;
}

export function getSqlite() {
  if (!sqlite) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return sqlite;
}

export function initDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  sqlite = new Database(DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  _db = drizzle(sqlite, { schema });

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

  // History table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      steam_id TEXT,
      total_value REAL NOT NULL,
      item_count INTEGER NOT NULL,
      timestamp DATE DEFAULT (date('now'))
    )
  `);

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
        total_value REAL NOT NULL,
        item_count INTEGER NOT NULL,
        timestamp DATE DEFAULT (date('now'))
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

  // Indexes
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_items_market_hash ON items(market_hash_name)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_items_casket ON items(casket_id)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_items_steam_id ON items(steam_id)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_prices_name ON prices(market_hash_name)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_prices_timestamp ON prices(timestamp)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp)');
  sqlite.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_history_steam_date ON history(steam_id, timestamp)',
  );

  // Cleanup old data
  sqlite.exec(`DELETE FROM history WHERE timestamp < date('now', '-90 days')`);
  sqlite.exec(`DELETE FROM prices WHERE timestamp < datetime('now', '-30 days')`);

  logger.info('[DB] Database initialized (WAL mode, better-sqlite3)');
}

export function closeDb() {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    _db = null;
    logger.info('[DB] Database closed');
  }
}
