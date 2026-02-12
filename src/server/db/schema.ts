import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const items = sqliteTable(
  'items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    marketHashName: text('market_hash_name').notNull(),
    assetId: text('asset_id'),
    casketId: text('casket_id'),
    casketName: text('casket_name'),
    floatValue: real('float_value'),
    paintSeed: integer('paint_seed'),
    iconUrl: text('icon_url'),
    stickers: text('stickers'),
    schemaImage: text('schema_image'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_items_market_hash').on(table.marketHashName),
    index('idx_items_casket').on(table.casketId),
  ],
);

export const prices = sqliteTable(
  'prices',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    marketHashName: text('market_hash_name').notNull(),
    source: text('source').notNull(),
    priceEur: real('price_eur'),
    timestamp: text('timestamp').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index('idx_prices_name').on(table.marketHashName),
    index('idx_prices_timestamp').on(table.timestamp),
  ],
);

export const history = sqliteTable(
  'history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    totalValue: real('total_value').notNull(),
    itemCount: integer('item_count').notNull(),
    timestamp: text('timestamp').unique().default(sql`(date('now'))`),
  },
  (table) => [index('idx_history_timestamp').on(table.timestamp)],
);
