import { getSqlite } from '../client.ts';

export interface PriceRow {
  id: number;
  market_hash_name: string;
  source: string;
  price_eur: number | null;
  timestamp: string;
}

export function getLatestPrice(marketHashName: string): PriceRow | undefined {
  const sqlite = getSqlite();
  return sqlite
    .prepare(
      `SELECT * FROM prices WHERE market_hash_name = ? ORDER BY timestamp DESC LIMIT 1`,
    )
    .get(marketHashName) as PriceRow | undefined;
}

export function getAllLatestPrices(): PriceRow[] {
  const sqlite = getSqlite();
  return sqlite
    .prepare(
      `SELECT p1.* FROM prices p1
       INNER JOIN (
         SELECT market_hash_name, MAX(timestamp) as max_ts
         FROM prices GROUP BY market_hash_name
       ) p2 ON p1.market_hash_name = p2.market_hash_name AND p1.timestamp = p2.max_ts`,
    )
    .all() as PriceRow[];
}

export function insertPrice(marketHashName: string, source: string, priceEur: number) {
  const sqlite = getSqlite();
  sqlite
    .prepare(`INSERT INTO prices (market_hash_name, source, price_eur) VALUES (?, ?, ?)`)
    .run(marketHashName, source, priceEur);
}

export function getCachedPriceRows(marketHashName: string): PriceRow[] {
  const sqlite = getSqlite();
  return sqlite
    .prepare(
      `SELECT source, price_eur, timestamp FROM prices
       WHERE market_hash_name = ?
       ORDER BY timestamp DESC LIMIT 5`,
    )
    .all(marketHashName) as PriceRow[];
}

export function getPreviousPrice(marketHashName: string): number | null {
  const sqlite = getSqlite();
  const row = sqlite
    .prepare(
      `SELECT price_eur FROM prices
       WHERE market_hash_name = ?
       ORDER BY timestamp DESC LIMIT 1 OFFSET 1`,
    )
    .get(marketHashName) as { price_eur: number | null } | undefined;
  return row?.price_eur ?? null;
}

export function getAllPreviousPrices(): Map<string, number | null> {
  const sqlite = getSqlite();
  const rows = sqlite
    .prepare(
      `SELECT market_hash_name, price_eur FROM (
         SELECT market_hash_name, price_eur,
                ROW_NUMBER() OVER (PARTITION BY market_hash_name ORDER BY timestamp DESC) as rn
         FROM prices
       ) WHERE rn = 2`,
    )
    .all() as PriceRow[];
  const map = new Map<string, number | null>();
  for (const row of rows) {
    map.set(row.market_hash_name, row.price_eur);
  }
  return map;
}

export function getOldAveragePrice(marketHashName: string): number | null {
  const sqlite = getSqlite();
  const row = sqlite
    .prepare(
      `SELECT AVG(price_eur) as avg_price FROM prices
       WHERE market_hash_name = ?
       AND timestamp < datetime('now', '-20 hours')
       AND timestamp > datetime('now', '-48 hours')`,
    )
    .get(marketHashName) as { avg_price: number | null } | undefined;
  return row?.avg_price ?? null;
}
