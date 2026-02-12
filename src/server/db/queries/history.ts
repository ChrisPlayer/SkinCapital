import { getSqlite } from '../client.ts';

export interface HistoryRow {
  total_value: number;
  item_count: number;
  timestamp: string;
}

export function getHistory(days: number = 30): HistoryRow[] {
  const sqlite = getSqlite();
  return sqlite
    .prepare(
      `SELECT total_value, item_count, timestamp FROM history
       WHERE timestamp > date('now', '-' || ? || ' days')
       ORDER BY timestamp ASC`,
    )
    .all(days.toString()) as HistoryRow[];
}

export function saveSnapshot(totalValue: number, itemCount: number) {
  const sqlite = getSqlite();
  sqlite
    .prepare(
      `INSERT OR REPLACE INTO history (total_value, item_count, timestamp) VALUES (?, ?, date('now'))`,
    )
    .run(totalValue, itemCount);
}

export function getYesterdayValue(): { total_value: number } | undefined {
  const sqlite = getSqlite();
  return sqlite
    .prepare(`SELECT total_value FROM history WHERE timestamp = date('now', '-1 day') LIMIT 1`)
    .get() as { total_value: number } | undefined;
}

export function getItemPriceHistory(
  marketHashName: string,
  days: number = 30,
): Array<{ source: string; price_eur: number; timestamp: string }> {
  const sqlite = getSqlite();
  return sqlite
    .prepare(
      `SELECT source, price_eur, timestamp FROM prices
       WHERE market_hash_name = ?
       AND timestamp > datetime('now', '-' || ? || ' days')
       ORDER BY timestamp ASC`,
    )
    .all(marketHashName, days.toString()) as Array<{
    source: string;
    price_eur: number;
    timestamp: string;
  }>;
}
