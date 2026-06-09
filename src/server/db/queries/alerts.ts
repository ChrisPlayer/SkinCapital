import { getSqlite } from '../client.ts';

export interface PriceAlertRow {
  id: number;
  steam_id: string;
  market_hash_name: string;
  direction: 'above' | 'below';
  threshold_eur: number;
  triggered_at: string | null;
  created_at: string;
}

export function listAlerts(steamId: string): PriceAlertRow[] {
  const sqlite = getSqlite();
  return sqlite
    .prepare('SELECT * FROM price_alerts WHERE steam_id = ? ORDER BY created_at DESC, id DESC')
    .all(steamId) as PriceAlertRow[];
}

export function createAlert(
  steamId: string,
  marketHashName: string,
  direction: 'above' | 'below',
  thresholdEur: number,
): PriceAlertRow {
  const sqlite = getSqlite();
  const result = sqlite
    .prepare(
      'INSERT INTO price_alerts (steam_id, market_hash_name, direction, threshold_eur) VALUES (?, ?, ?, ?)',
    )
    .run(steamId, marketHashName, direction, thresholdEur);
  return sqlite
    .prepare('SELECT * FROM price_alerts WHERE id = ?')
    .get(result.lastInsertRowid) as PriceAlertRow;
}

export function deleteAlert(id: number, steamId: string): void {
  const sqlite = getSqlite();
  sqlite.prepare('DELETE FROM price_alerts WHERE id = ? AND steam_id = ?').run(id, steamId);
}

/** Alerts not yet triggered for one item (checked when a fresh steam price lands). */
export function getActiveAlertsByName(marketHashName: string): PriceAlertRow[] {
  const sqlite = getSqlite();
  return sqlite
    .prepare('SELECT * FROM price_alerts WHERE market_hash_name = ? AND triggered_at IS NULL')
    .all(marketHashName) as PriceAlertRow[];
}

export function markTriggered(id: number): void {
  const sqlite = getSqlite();
  sqlite.prepare('UPDATE price_alerts SET triggered_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
}
