import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDb, closeDb, getSqlite } from '../../db/client.ts';
import {
  getPriceMovers,
  getMarketMovers,
  getLatestPricesForNames,
} from '../../db/queries/prices.ts';
import { getItemsByProfile } from '../../db/queries/items.ts';
import {
  takeCyclicWindow,
  groupItems,
  isSuspiciousDrop,
  getNamesToRefresh,
  computeSourceTotal,
} from './inventory.service.ts';

type RawRows = ReturnType<typeof getItemsByProfile>;

// Minimal raw-item rows: only the fields the functions under test read.
function rawItem(overrides: Partial<RawRows[number]>): RawRows[number] {
  return {
    id: 0,
    steamId: 'S1',
    marketHashName: 'X',
    assetId: null,
    casketId: null,
    casketName: null,
    floatValue: null,
    paintSeed: null,
    iconUrl: null,
    stickers: null,
    schemaImage: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

beforeAll(() => {
  process.env.DB_PATH = ':memory:';
  initDb();
});

afterAll(() => {
  closeDb();
});

describe('takeCyclicWindow', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];

  it('wraps around the end of the list', () => {
    const { window, nextStart } = takeCyclicWindow(items, 2, 4);
    expect(window).toEqual(['e', 'a']);
    expect(nextStart).toBe(1);
  });

  it('returns everything when the window covers the list', () => {
    expect(takeCyclicWindow(items, 5, 3)).toEqual({ window: items, nextStart: 0 });
    expect(takeCyclicWindow(items, 9, 3)).toEqual({ window: items, nextStart: 0 });
    expect(takeCyclicWindow(items, 0, 3)).toEqual({ window: items, nextStart: 0 });
  });

  it('normalizes an out-of-range start', () => {
    const { window } = takeCyclicWindow(items, 2, 12); // 12 % 5 = 2
    expect(window).toEqual(['c', 'd']);
  });
});

describe('isSuspiciousDrop', () => {
  const change = (yesterdayValue: number | undefined, hasData = true) => ({
    change: 0,
    percentage: 0,
    hasData,
    yesterdayValue,
  });

  it('flags a collapse below 20% of yesterday', () => {
    expect(isSuspiciousDrop(19, change(100))).toBe(true);
    expect(isSuspiciousDrop(21, change(100))).toBe(false);
  });

  it('never flags without a yesterday baseline', () => {
    expect(isSuspiciousDrop(1, change(undefined))).toBe(false);
    expect(isSuspiciousDrop(1, change(100, false))).toBe(false);
    expect(isSuspiciousDrop(1, change(0))).toBe(false);
  });
});

describe('groupItems', () => {
  it('groups by name, sums sticker value once per unit and sorts by total', () => {
    const stickers = JSON.stringify([
      { slot: 0, stickerId: 1, name: 'Sticker | Crown (Foil)', imageUrl: null, wear: null },
    ]);
    const rows = [
      rawItem({ marketHashName: 'AK-47 | Redline (Field-Tested)', stickers, casketId: 'C1' }),
      rawItem({ marketHashName: 'AK-47 | Redline (Field-Tested)', stickers: null }),
      rawItem({ marketHashName: 'Glock-18 | Fade (Factory New)', floatValue: 0.01 }),
    ];
    const priceMap = new Map<string, number | null>([
      ['AK-47 | Redline (Field-Tested)', 10],
      ['Glock-18 | Fade (Factory New)', 100],
      ['Sticker | Crown (Foil)', 5],
    ]);
    const previous = new Map<string, number | null>([['AK-47 | Redline (Field-Tested)', 8]]);

    const groups = groupItems(rows, priceMap, previous);
    expect(groups).toHaveLength(2);
    // Sorted by total desc: Glock 100 > AK 10*2 + 5 stickers = 25.
    expect(groups[0].marketHashName).toBe('Glock-18 | Fade (Factory New)');
    const ak = groups[1];
    expect(ak.quantity).toBe(2);
    expect(ak.stickerValue).toBe(5);
    expect(ak.total).toBe(25);
    expect(ak.casketIds).toEqual(['C1']);
    expect(ak.priceChange).toBe(2);
    expect(ak.priceChangePercent).toBe(25);
    // Wear parsed from the market hash name.
    expect(ak.wear?.short).toBe('FT');
  });

  it('handles unpriced items and corrupt sticker JSON', () => {
    const rows = [rawItem({ marketHashName: 'Unknown Thing', stickers: '{not json' })];
    const groups = groupItems(rows, new Map());
    expect(groups[0].price).toBeNull();
    expect(groups[0].total).toBe(0);
    expect(groups[0].stickers).toEqual([]);
  });
});

describe('DB-backed pricing queries', () => {
  beforeAll(() => {
    const sql = getSqlite();
    const insertItem = sql.prepare(
      `INSERT INTO items (steam_id, market_hash_name) VALUES (?, ?)`,
    );
    insertItem.run('S1', 'AK');
    insertItem.run('S1', 'M4');
    insertItem.run('S2', 'AWP');

    const insertPrice = sql.prepare(
      `INSERT INTO prices (market_hash_name, source, price_eur, timestamp) VALUES (?, ?, ?, ?)`,
    );
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    // AK: 10 → 15 inside the window (owned by S1)
    insertPrice.run('AK', 'steam', 10, '2026-07-05 10:00:00');
    insertPrice.run('AK', 'steam', 15, now);
    // M4: a single point → excluded from movers
    insertPrice.run('M4', 'steam', 50, now);
    // AWP: 100 → 80 (owned by S2 only)
    insertPrice.run('AWP', 'steam', 100, '2026-07-05 10:00:00');
    insertPrice.run('AWP', 'steam', 80, now);
    // Same name on ANOTHER source must never leak into steam reads.
    insertPrice.run('AK', 'skinport', 999, now);
  });

  it('getPriceMovers is profile-scoped and compares oldest vs newest', () => {
    const movers = getPriceMovers('S1', 'steam', 3650);
    expect(movers).toEqual([{ name: 'AK', oldPrice: 10, newPrice: 15 }]);
  });

  it('getMarketMovers covers every priced item with >= 2 points', () => {
    const movers = getMarketMovers('steam', 3650);
    const names = movers.map((m) => m.name).sort();
    expect(names).toEqual(['AK', 'AWP']);
  });

  it('getLatestPricesForNames returns the latest per name for one source', () => {
    const rows = getLatestPricesForNames(['AK', 'M4', 'NOPE'], 'steam');
    const byName = new Map(rows.map((r) => [r.market_hash_name, r.price_eur]));
    expect(byName.get('AK')).toBe(15);
    expect(byName.get('M4')).toBe(50);
    expect(byName.has('NOPE')).toBe(false);
    expect(getLatestPricesForNames([], 'steam')).toEqual([]);
  });

  it('getNamesToRefresh: missing scope returns only unpriced names', () => {
    const raw = [{ marketHashName: 'AK' }, { marketHashName: 'NEW' }];
    expect(getNamesToRefresh(raw, 'steam', 'missing')).toEqual(['NEW']);
    expect(getNamesToRefresh(raw, 'steam', 'all').sort()).toEqual(['AK', 'NEW']);
  });

  it('getNamesToRefresh: stale_or_missing includes stale prices', () => {
    // AWP's newest row is fresh; AK's is fresh; add a stale-only name.
    const sql = getSqlite();
    sql
      .prepare(`INSERT INTO prices (market_hash_name, source, price_eur, timestamp) VALUES (?, ?, ?, ?)`)
      .run('OLDIE', 'steam', 5, '2026-07-01 00:00:00');
    const raw = [{ marketHashName: 'AK' }, { marketHashName: 'OLDIE' }];
    expect(getNamesToRefresh(raw, 'steam', 'stale_or_missing')).toEqual(['OLDIE']);
  });

  it('computeSourceTotal sums item + sticker values from the latest prices', () => {
    const rows = [
      rawItem({
        marketHashName: 'AK',
        stickers: JSON.stringify([{ slot: 0, stickerId: 1, name: 'M4', imageUrl: null, wear: null }]),
      }),
      rawItem({ marketHashName: 'UNPRICED' }),
    ];
    // AK latest = 15, sticker priced via the M4 row = 50.
    const { totalValue, pricedItems } = computeSourceTotal(rows, 'steam');
    expect(totalValue).toBe(65);
    expect(pricedItems).toBe(1);
  });
});
