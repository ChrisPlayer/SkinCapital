import { getSqlite } from '../client.ts';

export interface PurchaseRow {
  steam_id: string;
  market_hash_name: string;
  buy_price_eur: number;
  updated_at: string;
}

/** Purchase prices for a profile, keyed by market_hash_name. */
export function getPurchasesByProfile(steamId: string): Map<string, number> {
  const sqlite = getSqlite();
  const rows = sqlite
    .prepare('SELECT market_hash_name, buy_price_eur FROM purchases WHERE steam_id = ?')
    .all(steamId) as Array<Pick<PurchaseRow, 'market_hash_name' | 'buy_price_eur'>>;
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.market_hash_name, row.buy_price_eur);
  }
  return map;
}

/** All purchase prices, keyed steamId -> (market_hash_name -> buy price). */
export function getAllPurchases(): Map<string, Map<string, number>> {
  const sqlite = getSqlite();
  const rows = sqlite
    .prepare('SELECT steam_id, market_hash_name, buy_price_eur FROM purchases')
    .all() as Array<Pick<PurchaseRow, 'steam_id' | 'market_hash_name' | 'buy_price_eur'>>;
  const byProfile = new Map<string, Map<string, number>>();
  for (const row of rows) {
    let inner = byProfile.get(row.steam_id);
    if (!inner) {
      inner = new Map<string, number>();
      byProfile.set(row.steam_id, inner);
    }
    inner.set(row.market_hash_name, row.buy_price_eur);
  }
  return byProfile;
}

export function setPurchase(steamId: string, marketHashName: string, buyPriceEur: number): void {
  const sqlite = getSqlite();
  sqlite
    .prepare(
      `INSERT INTO purchases (steam_id, market_hash_name, buy_price_eur) VALUES (?, ?, ?)
       ON CONFLICT(steam_id, market_hash_name)
       DO UPDATE SET buy_price_eur = excluded.buy_price_eur, updated_at = CURRENT_TIMESTAMP`,
    )
    .run(steamId, marketHashName, buyPriceEur);
}

export function deletePurchase(steamId: string, marketHashName: string): void {
  const sqlite = getSqlite();
  sqlite
    .prepare('DELETE FROM purchases WHERE steam_id = ? AND market_hash_name = ?')
    .run(steamId, marketHashName);
}
