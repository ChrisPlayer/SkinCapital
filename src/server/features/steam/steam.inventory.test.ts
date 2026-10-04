import { afterEach, describe, expect, it, vi } from 'vitest';

type InventoryCallback = (error: Error | null, inventory?: unknown) => void;
const fetchInventory = vi.hoisted(() => vi.fn());
vi.mock('./steam.client.ts', () => ({
  steamClient: {
    community: { getUserInventoryContents: fetchInventory },
    steamUser: { steamID: 'fixture-account' },
  },
}));
import { getMainInventory } from './steam.inventory.ts';

afterEach(() => {
  vi.useRealTimers();
  fetchInventory.mockReset();
});

describe('main inventory network failures', () => {
  it('times out a stalled Steam callback and ignores its late response', async () => {
    vi.useFakeTimers();
    let callback!: InventoryCallback;
    fetchInventory.mockImplementation((_id, _app, _context, _tradable, done: InventoryCallback) => {
      callback = done;
    });
    const request = getMainInventory();
    try {
      await vi.advanceTimersByTimeAsync(60_000);
      const outcome = await Promise.race([request, Promise.resolve('still_waiting')]);
      expect(outcome).toEqual({ items: [], ok: false });
      callback(null, [{ market_hash_name: 'Late item', assetid: 'late', icon_url: '' }]);
      await expect(request).resolves.toEqual({ items: [], ok: false });
    } finally {
      callback(new Error('Fixture cleanup'));
      await request;
    }
  });

  it('treats a malformed Steam response as an incomplete fetch', async () => {
    fetchInventory.mockImplementation((_id, _app, _context, _tradable, done: InventoryCallback) => {
      done(null, undefined);
    });
    await expect(getMainInventory()).resolves.toEqual({ items: [], ok: false });
  });

  it('clears the deadline when the Steam client throws before registering its callback', async () => {
    vi.useFakeTimers();
    fetchInventory.mockImplementation(() => {
      throw new Error('Disconnected');
    });
    await expect(getMainInventory()).resolves.toEqual({ items: [], ok: false });
    expect(vi.getTimerCount()).toBe(0);
  });
});
