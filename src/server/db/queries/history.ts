import { getSqlite } from '../client.ts';

export interface HistoryRow {
  total_value: number;
  item_count: number;
  timestamp: string;
}

export function getHistory(steamId: string, days: number = 30, source = 'steam'): HistoryRow[] {
  const sqlite = getSqlite();
  return sqlite
    .prepare(
      `SELECT total_value, item_count, timestamp FROM history
       WHERE steam_id = ? AND source = ?
       AND timestamp > date('now', '-' || ? || ' days', 'localtime')
       ORDER BY timestamp ASC`,
    )
    .all(steamId, source, days.toString()) as HistoryRow[];
}

// Snapshots are keyed by LOCAL day (not UTC) so the "yesterday" comparison
// doesn't skew around midnight for non-UTC users.
export function saveSnapshot(steamId: string, totalValue: number, itemCount: number, source = 'steam') {
  const sqlite = getSqlite();
  sqlite
    .prepare(
      `INSERT OR REPLACE INTO history (steam_id, source, total_value, item_count, timestamp)
       VALUES (?, ?, ?, ?, date('now', 'localtime'))`,
    )
    .run(steamId, source, totalValue, itemCount);
}

export function getYesterdayValue(steamId: string, source = 'steam'): { total_value: number } | undefined {
  const sqlite = getSqlite();
  return sqlite
    .prepare(
      `SELECT total_value FROM history
       WHERE steam_id = ? AND source = ? AND timestamp = date('now', '-1 day', 'localtime')
       LIMIT 1`,
    )
    .get(steamId, source) as { total_value: number } | undefined;
}

/** Raw price points for one item + source (powers the modal sparkline). */
export function getItemPriceHistory(
  marketHashName: string,
  source = 'steam',
  days: number = 30,
): Array<{ price_eur: number; timestamp: string }> {
  const sqlite = getSqlite();
  return sqlite
    .prepare(
      `SELECT price_eur, timestamp FROM prices
       WHERE market_hash_name = ? AND source = ? AND price_eur IS NOT NULL
       AND timestamp > datetime('now', '-' || ? || ' days')
       ORDER BY timestamp ASC`,
    )
    .all(marketHashName, source, days.toString()) as Array<{
    price_eur: number;
    timestamp: string;
  }>;
}
