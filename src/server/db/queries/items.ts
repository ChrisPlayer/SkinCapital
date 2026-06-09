import { getSqlite } from '../client.ts';
import type { Sticker } from '../../../shared/types/inventory.ts';

export interface InsertItem {
  marketHashName: string;
  assetId: string | null;
  casketId: string | null;
  casketName: string | null;
  floatValue: number | null;
  paintSeed: number | null;
  iconUrl: string | null;
  stickers: Sticker[] | null;
  schemaImage: string | null;
}

export interface ItemRow {
  id: number;
  steamId: string | null;
  marketHashName: string;
  assetId: string | null;
  casketId: string | null;
  casketName: string | null;
  floatValue: number | null;
  paintSeed: number | null;
  iconUrl: string | null;
  stickers: string | null;
  schemaImage: string | null;
  createdAt: string;
  updatedAt: string;
}

// camelCase aliases keep the exact shape the former Drizzle queries returned.
const ITEM_SELECT = `
  SELECT id, steam_id AS steamId, market_hash_name AS marketHashName,
         asset_id AS assetId, casket_id AS casketId, casket_name AS casketName,
         float_value AS floatValue, paint_seed AS paintSeed, icon_url AS iconUrl,
         stickers, schema_image AS schemaImage,
         created_at AS createdAt, updated_at AS updatedAt
  FROM items`;

export function getItemsByProfile(steamId: string): ItemRow[] {
  const sqlite = getSqlite();
  return sqlite
    .prepare(`${ITEM_SELECT} WHERE steam_id = ? ORDER BY market_hash_name`)
    .all(steamId) as ItemRow[];
}

export function getAllItems(): ItemRow[] {
  const sqlite = getSqlite();
  return sqlite.prepare(`${ITEM_SELECT} ORDER BY market_hash_name`).all() as ItemRow[];
}

export function insertItemsBatch(itemList: InsertItem[], steamId: string) {
  const sqlite = getSqlite();
  const stmt = sqlite.prepare(`
    INSERT INTO items (steam_id, market_hash_name, asset_id, casket_id, casket_name, float_value, paint_seed, icon_url, stickers, schema_image)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = sqlite.transaction((list: InsertItem[]) => {
    for (const item of list) {
      stmt.run(
        steamId,
        item.marketHashName,
        item.assetId,
        item.casketId,
        item.casketName,
        item.floatValue,
        item.paintSeed,
        item.iconUrl,
        item.stickers ? JSON.stringify(item.stickers) : null,
        item.schemaImage,
      );
    }
  });

  transaction(itemList);
}

export function clearItemsByProfile(steamId: string) {
  const sqlite = getSqlite();
  sqlite.prepare('DELETE FROM items WHERE steam_id = ?').run(steamId);
}

export function countItemsByProfile(steamId: string): number {
  const sqlite = getSqlite();
  const row = sqlite.prepare('SELECT COUNT(*) AS c FROM items WHERE steam_id = ?').get(steamId) as { c: number };
  return row?.c ?? 0;
}

/**
 * Atomically replace a profile's whole inventory (delete + insert in ONE
 * transaction). If the insert fails, the delete is rolled back, so a profile
 * is never left empty by a partial failure.
 */
export function replaceProfileItems(itemList: InsertItem[], steamId: string) {
  const sqlite = getSqlite();
  const del = sqlite.prepare('DELETE FROM items WHERE steam_id = ?');
  const ins = sqlite.prepare(`
    INSERT INTO items (steam_id, market_hash_name, asset_id, casket_id, casket_name, float_value, paint_seed, icon_url, stickers, schema_image)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = sqlite.transaction((list: InsertItem[]) => {
    del.run(steamId);
    for (const item of list) {
      ins.run(
        steamId,
        item.marketHashName,
        item.assetId,
        item.casketId,
        item.casketName,
        item.floatValue,
        item.paintSeed,
        item.iconUrl,
        item.stickers ? JSON.stringify(item.stickers) : null,
        item.schemaImage,
      );
    }
  });

  tx(itemList);
}

/**
 * Atomically replace ONLY the main inventory rows (casket_id IS NULL), keeping
 * the stored storage-unit contents. Used by the GC-less partial refresh, where
 * storage units cannot be enumerated but the main inventory fetch succeeded.
 */
export function replaceMainInventoryItems(itemList: InsertItem[], steamId: string) {
  const sqlite = getSqlite();
  const del = sqlite.prepare('DELETE FROM items WHERE steam_id = ? AND casket_id IS NULL');
  const ins = sqlite.prepare(`
    INSERT INTO items (steam_id, market_hash_name, asset_id, casket_id, casket_name, float_value, paint_seed, icon_url, stickers, schema_image)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = sqlite.transaction((list: InsertItem[]) => {
    del.run(steamId);
    for (const item of list) {
      ins.run(
        steamId,
        item.marketHashName,
        item.assetId,
        item.casketId,
        item.casketName,
        item.floatValue,
        item.paintSeed,
        item.iconUrl,
        item.stickers ? JSON.stringify(item.stickers) : null,
        item.schemaImage,
      );
    }
  });

  tx(itemList);
}

export function clearAllItems() {
  const sqlite = getSqlite();
  sqlite.exec('DELETE FROM items');
}
