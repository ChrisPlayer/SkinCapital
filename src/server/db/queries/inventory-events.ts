import { getSqlite } from '../client.ts';

export interface InventoryEventRow {
  id: number;
  steam_id: string;
  market_hash_name: string;
  delta: number;
  price_eur: number | null;
  created_at: string;
}

export interface InsertInventoryEvent {
  steamId: string;
  marketHashName: string;
  delta: number;
  priceEur: number | null;
}

export function insertInventoryEvents(rows: InsertInventoryEvent[]): void {
  if (rows.length === 0) return;
  const sqlite = getSqlite();
  const stmt = sqlite.prepare(
    'INSERT INTO inventory_events (steam_id, market_hash_name, delta, price_eur) VALUES (?, ?, ?, ?)',
  );
  const insertAll = sqlite.transaction((batch: InsertInventoryEvent[]) => {
    for (const row of batch) {
      stmt.run(row.steamId, row.marketHashName, row.delta, row.priceEur);
    }
  });
  insertAll(rows);
}

/** steamId null = movements across all profiles (aggregated view). */
export function listInventoryEvents(steamId: string | null, limit: number): InventoryEventRow[] {
  const sqlite = getSqlite();
  if (steamId === null) {
    return sqlite
      .prepare('SELECT * FROM inventory_events ORDER BY created_at DESC, id DESC LIMIT ?')
      .all(limit) as InventoryEventRow[];
  }
  return sqlite
    .prepare('SELECT * FROM inventory_events WHERE steam_id = ? ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(steamId, limit) as InventoryEventRow[];
}
