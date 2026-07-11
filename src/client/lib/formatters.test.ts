import { describe, it, expect } from 'vitest';
import { computePnl } from './formatters.ts';
import { applyFees } from './i18n.tsx';
import type { ItemGroup } from '../../shared/types/inventory.ts';

function group(overrides: Partial<ItemGroup>): ItemGroup {
  return {
    marketHashName: 'X',
    quantity: 1,
    casketIds: [],
    floatValue: null,
    paintSeed: null,
    wear: null,
    rarity: { name: 'Consumer', color: '#fff', bg: '#000' },
    quality: null,
    imageUrl: null,
    price: null,
    total: 0,
    stickers: [],
    stickerValue: 0,
    priceChange: null,
    priceChangePercent: null,
    buyPrice: null,
    ...overrides,
  };
}

describe('applyFees', () => {
  it('is a passthrough for every provider except steam_fees', () => {
    expect(applyFees(10, 'steam')).toBe(10);
    expect(applyFees(10, 'csfloat')).toBe(10);
    expect(applyFees(10, 'skinport')).toBe(10);
    expect(applyFees(null, 'steam_fees')).toBeNull();
  });

  it('applies Steam + game fees, each rounded up separately', () => {
    // 10.00€ → steam fee ceil(10%)=1.00, game fee ceil(5%)=0.50 → 8.50 net.
    expect(applyFees(10, 'steam_fees')).toBe(8.5);
    // 0.03€ → both fees floor at 1 cent → 0.01 net.
    expect(applyFees(0.03, 'steam_fees')).toBe(0.01);
    expect(applyFees(0, 'steam_fees')).toBe(0);
  });
});

describe('computePnl', () => {
  it('sums only groups that have a buy price', () => {
    const items = [
      group({ buyPrice: 5, quantity: 2, total: 15 }),
      group({ buyPrice: null, total: 999 }), // ignored
    ];
    const { invested, pnl, count } = computePnl(items, 'steam');
    expect(invested).toBe(10);
    expect(pnl).toBe(5);
    expect(count).toBe(1);
  });

  it('nets fees off the market side in steam_fees mode', () => {
    const items = [group({ buyPrice: 5, quantity: 2, total: 15 })];
    const { invested, pnl } = computePnl(items, 'steam_fees');
    // market = applyFees(15) = 15 - 1.50 - 0.75 = 12.75
    expect(invested).toBe(10);
    expect(pnl).toBeCloseTo(2.75, 10);
  });

  it('returns zeros when no group has a buy price', () => {
    expect(computePnl([group({})], 'steam')).toEqual({ invested: 0, pnl: 0, count: 0 });
  });
});
