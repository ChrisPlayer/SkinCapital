import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDb, initDb } from '../../db/client.ts';
import { insertPrice } from '../../db/queries/prices.ts';
import { setPhase } from '../steam/steam.status.ts';
import { waitForPriceWork } from './pricing.priority.ts';
import { csfloatQueue, steamQueue } from './pricing.queue.ts';

const httpGet = vi.hoisted(() => vi.fn());
vi.mock('axios', () => ({ default: { get: httpGet } }));
vi.mock('./steam.proxy-pool.ts', () => ({ getPricingMode: () => 'direct' }));

import { getPrices, refreshPriceWithoutStaleFallback } from './pricing.service.ts';

beforeEach(() => {
  process.env.DB_PATH = ':memory:';
  initDb();
  setPhase('idle', { owner: 'refresh' });
  httpGet.mockReset();
});

afterEach(async () => {
  setPhase('idle', { owner: 'refresh' });
  await Promise.all([steamQueue.onIdle(), csfloatQueue.onIdle()]);
  closeDb();
});

describe('price network priority', () => {
  it('holds new price HTTP calls during login and releases them when inventory work is done', async () => {
    setPhase('logging_in', { owner: 'steam', steamId: null });
    httpGet.mockResolvedValue({
      data: [{ market_hash_name: 'Priority item', suggested_price: 10 }],
    });
    const request = getPrices('Priority item', true, 'skinport');
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(httpGet).not.toHaveBeenCalled();
    expect(steamQueue.isPaused).toBe(true);
    expect(csfloatQueue.isPaused).toBe(true);

    setPhase('fetching_inventory', { owner: 'refresh', steamId: 'B' });
    setPhase('idle', { owner: 'steam' });
    expect(steamQueue.isPaused).toBe(true);
    setPhase('idle', { owner: 'refresh' });
    await expect(request).resolves.toMatchObject({ skinport: 10 });
    expect(httpGet).toHaveBeenCalledTimes(1);
    expect(steamQueue.isPaused).toBe(false);
  });

  it('returns fresh cached prices while the network is reserved for items', async () => {
    insertPrice('Cached item', 'steam', 12);
    setPhase('fetching_inventory', { owner: 'refresh', steamId: 'B' });
    await expect(getPrices('Cached item')).resolves.toMatchObject({ steam: 12 });
    expect(httpGet).not.toHaveBeenCalled();
  });

  it('cancels a paused scan without waiting for inventory completion', async () => {
    setPhase('fetching_inventory', { owner: 'refresh', steamId: 'B' });
    const controller = new AbortController();
    const ready = waitForPriceWork(controller.signal);
    controller.abort();
    await expect(ready).resolves.toBe(false);
    expect(steamQueue.isPaused).toBe(true);
  });

  it('pauses a price dispatch when inventory starts in the same event-loop turn', async () => {
    httpGet.mockResolvedValue({ data: { success: true, lowest_price: '10,00€' } });
    const request = getPrices('Overlapping item', true);
    setPhase('fetching_inventory', { owner: 'refresh', steamId: 'B' });
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(httpGet).not.toHaveBeenCalled();
    } finally {
      setPhase('idle', { owner: 'refresh' });
      await request;
    }
  });

  it('shares one Steam request between an item-detail fetch and a background scan', async () => {
    httpGet.mockResolvedValue({ data: { success: true, lowest_price: '10,00€' } });
    const [detail, scan] = await Promise.all([
      getPrices('Shared item', true),
      refreshPriceWithoutStaleFallback('Shared item', 'steam'),
    ]);
    expect(detail.steam).toBe(10);
    expect(scan.freshPrice).toBe(10);
    expect(httpGet).toHaveBeenCalledTimes(1);
  });
});
