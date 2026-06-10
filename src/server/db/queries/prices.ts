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

export function getAllLatestPricesBySource(source: string): PriceRow[] {
  const sqlite = getSqlite();
  return sqlite
    .prepare(
      `SELECT p1.* FROM prices p1
       INNER JOIN (
         SELECT market_hash_name, MAX(timestamp) as max_ts
         FROM prices
         WHERE source = ?
         GROUP BY market_hash_name
       ) p2 ON p1.market_hash_name = p2.market_hash_name AND p1.timestamp = p2.max_ts
       WHERE p1.source = ?`,
    )
    .all(source, source) as PriceRow[];
}

export function insertPrice(marketHashName: string, source: string, priceEur: number) {
  const sqlite = getSqlite();
  sqlite
    .prepare(`INSERT INTO prices (market_hash_name, source, price_eur) VALUES (?, ?, ?)`)
    .run(marketHashName, source, priceEur);
}

export function getCachedPriceRows(marketHashName: string): PriceRow[] {
  const sqlite = getSqlite();
  // Latest row PER source (so all of steam/csfloat/skinport are captured).
  return sqlite
    .prepare(
      `SELECT source, price_eur, timestamp FROM (
         SELECT source, price_eur, timestamp,
                ROW_NUMBER() OVER (PARTITION BY source ORDER BY timestamp DESC) AS rn
         FROM prices
         WHERE market_hash_name = ?
       ) WHERE rn = 1`,
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

export function getAllPreviousPricesBySource(source: string): Map<string, number | null> {
  const sqlite = getSqlite();
  const rows = sqlite
    .prepare(
      `SELECT market_hash_name, price_eur FROM (
         SELECT market_hash_name, price_eur,
                ROW_NUMBER() OVER (PARTITION BY market_hash_name ORDER BY timestamp DESC) as rn
         FROM prices
         WHERE source = ?
       ) WHERE rn = 2`,
    )
    .all(source) as PriceRow[];
  const map = new Map<string, number | null>();
  for (const row of rows) {
    map.set(row.market_hash_name, row.price_eur);
  }
  return map;
}

export function getLatestPriceWindow(): { from: string; to: string } | null {
  const sqlite = getSqlite();
  const row = sqlite
    .prepare(
      `SELECT MIN(max_ts) as from_ts, MAX(max_ts) as to_ts FROM (
         SELECT MAX(timestamp) as max_ts FROM prices GROUP BY market_hash_name
       )`,
    )
    .get() as { from_ts: string | null; to_ts: string | null } | undefined;
  if (!row?.from_ts || !row?.to_ts) return null;
  return { from: row.from_ts, to: row.to_ts };
}

export function getLatestPriceWindowBySource(source: string): { from: string; to: string } | null {
  const sqlite = getSqlite();
  const row = sqlite
    .prepare(
      `SELECT MIN(max_ts) as from_ts, MAX(max_ts) as to_ts FROM (
         SELECT MAX(timestamp) as max_ts
         FROM prices
         WHERE source = ?
         GROUP BY market_hash_name
       )`,
    )
    .get(source) as { from_ts: string | null; to_ts: string | null } | undefined;
  if (!row?.from_ts || !row?.to_ts) return null;
  return { from: row.from_ts, to: row.to_ts };
}

export interface MoverRow {
  name: string;
  oldPrice: number;
  newPrice: number;
}

/**
 * For each distinct item of a profile, compare the LATEST vs the OLDEST price
 * within the window (same source, non-null prices). Items with a single point
 * in the window are excluded (rn_desc > 1 means the oldest row isn't also the
 * newest). Powers the dashboard "Top movers" card.
 */
export function getPriceMovers(steamId: string, source: string, days: number): MoverRow[] {
  const sqlite = getSqlite();
  return sqlite
    .prepare(
      `WITH windowed AS (
         SELECT p.market_hash_name, p.price_eur,
                ROW_NUMBER() OVER (PARTITION BY p.market_hash_name ORDER BY p.timestamp ASC, p.id ASC) AS rn_asc,
                ROW_NUMBER() OVER (PARTITION BY p.market_hash_name ORDER BY p.timestamp DESC, p.id DESC) AS rn_desc
         FROM prices p
         WHERE p.source = ?
           AND p.price_eur IS NOT NULL
           AND p.timestamp > datetime('now', '-' || ? || ' days')
           AND p.market_hash_name IN (SELECT DISTINCT market_hash_name FROM items WHERE steam_id = ?)
       )
       SELECT o.market_hash_name AS name, o.price_eur AS oldPrice, n.price_eur AS newPrice
       FROM windowed o
       INNER JOIN windowed n
         ON n.market_hash_name = o.market_hash_name AND n.rn_desc = 1
       WHERE o.rn_asc = 1 AND o.rn_desc > 1`,
    )
    .all(source, days.toString(), steamId) as MoverRow[];
}

export function getOldAveragePrice(marketHashName: string, source = 'steam'): number | null {
  const sqlite = getSqlite();
  // Source-filtered: averaging across steam/csfloat/skinport rows would compare
  // the current single-source price against a mixed-basis average.
  const row = sqlite
    .prepare(
      `SELECT AVG(price_eur) as avg_price FROM prices
       WHERE market_hash_name = ?
       AND source = ?
       AND timestamp < datetime('now', '-20 hours')
       AND timestamp > datetime('now', '-48 hours')`,
    )
    .get(marketHashName, source) as { avg_price: number | null } | undefined;
  return row?.avg_price ?? null;
}
