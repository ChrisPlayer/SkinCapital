import { describe, it, expect } from 'vitest';
import { parseSteamPrice, parseSteamRenderPrice } from './pricing.service.ts';

// A regression in either parser silently corrupts every stored price, so the
// locale/decimal-separator matrix is pinned here.
describe('parseSteamPrice', () => {
  it('parses EU comma decimals', () => {
    expect(parseSteamPrice('2,50€')).toBe(2.5);
    expect(parseSteamPrice('0,03€')).toBe(0.03);
  });

  it('parses EU format with dot thousands separators', () => {
    expect(parseSteamPrice('1.234,56€')).toBe(1234.56);
    expect(parseSteamPrice('12.345.678,90€')).toBe(12345678.9);
  });

  it('parses US format with comma thousands separators', () => {
    expect(parseSteamPrice('1,234.56')).toBe(1234.56);
    expect(parseSteamPrice('$1,234')).toBe(1234);
  });

  it('strips currency symbols and whitespace (incl. narrow nbsp)', () => {
    expect(parseSteamPrice('1 234,56 €')).toBe(1234.56);
    expect(parseSteamPrice('£9.99')).toBe(9.99);
  });

  it('parses plain numbers', () => {
    expect(parseSteamPrice('12')).toBe(12);
    expect(parseSteamPrice('12.5')).toBe(12.5);
  });

  it('returns 0 for garbage', () => {
    expect(parseSteamPrice('abc')).toBe(0);
    expect(parseSteamPrice('')).toBe(0);
  });
});

describe('parseSteamRenderPrice', () => {
  it('uses lowest_sell_order (cents) when present', () => {
    expect(parseSteamRenderPrice({ lowest_sell_order: '250' })).toBe(2.5);
    expect(parseSteamRenderPrice({ lowest_sell_order: 199 })).toBe(1.99);
  });

  it('falls back to the cheapest listing (price + fee)', () => {
    const payload = {
      lowest_sell_order: 0,
      listinginfo: {
        a: { converted_price: 100, converted_fee: 15 },
        b: { converted_price: 90, converted_fee: 20 },
      },
    };
    expect(parseSteamRenderPrice(payload)).toBe(1.1);
  });

  it('ignores listings with missing or non-numeric fees', () => {
    const payload = {
      listinginfo: {
        broken: { converted_price: 100 },
        ok: { converted_price: 200, converted_fee: 30 },
      },
    };
    expect(parseSteamRenderPrice(payload)).toBe(2.3);
  });

  it('returns null when nothing is sellable', () => {
    expect(parseSteamRenderPrice(null)).toBeNull();
    expect(parseSteamRenderPrice({})).toBeNull();
    expect(parseSteamRenderPrice({ listinginfo: {} })).toBeNull();
    expect(parseSteamRenderPrice({ lowest_sell_order: 0 })).toBeNull();
  });
});
