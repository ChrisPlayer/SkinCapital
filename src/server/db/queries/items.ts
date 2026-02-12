import { eq } from 'drizzle-orm';
import { getDb, getSqlite } from '../client.ts';
import { items } from '../schema.ts';
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

export function getAllItems() {
  const db = getDb();
  return db.select().from(items).orderBy(items.marketHashName).all();
}

export function getItemsByCasket(casketId: string) {
  const db = getDb();
  return db.select().from(items).where(eq(items.casketId, casketId)).all();
}

export function insertItemsBatch(itemList: InsertItem[]) {
  const sqlite = getSqlite();
  const stmt = sqlite.prepare(`
    INSERT INTO items (market_hash_name, asset_id, casket_id, casket_name, float_value, paint_seed, icon_url, stickers, schema_image)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = sqlite.transaction((list: InsertItem[]) => {
    for (const item of list) {
      stmt.run(
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

export function clearAllItems() {
  const sqlite = getSqlite();
  sqlite.exec('DELETE FROM items');
}
