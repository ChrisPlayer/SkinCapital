import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDb, getSqlite, initDb } from '../../db/client.ts';
import { countItemsByProfile, getItemsByProfile } from '../../db/queries/items.ts';
import { upsertProfile } from '../../db/queries/profiles.ts';
import type { InventoryFetchResult } from '../steam/steam.inventory.ts';
import express from 'express';
import session from 'express-session';
import type { Server } from 'node:http';
import { getPhaseState, setPhase } from '../steam/steam.status.ts';

const mocks = vi.hoisted(() => ({
  steamId: 'A',
  loggedIn: true,
  logout: vi.fn(),
  inventory: vi.fn(),
  price: vi.fn(),
  login: vi.fn(),
}));

vi.mock('../steam/steam.client.ts', () => ({
  steamClient: {
    get isLoggedIn() {
      return mocks.loggedIn;
    },
    get steamUser() {
      return { steamID: { getSteamID64: () => mocks.steamId } };
    },
    logout: mocks.logout,
    login: mocks.login,
    getPersonaInfo: async () => ({ personaName: `Account ${mocks.steamId}`, avatarUrl: '' }),
    getStatus: () => ({
      isLoggedIn: mocks.loggedIn,
      isConnectedToGC: false,
      steamId: mocks.steamId,
    }),
  },
}));
vi.mock('../steam/steam.inventory.ts', () => ({ getAllInventory: mocks.inventory }));
vi.mock('../steam/steam.schema.ts', () => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  getRarityForName: vi.fn(),
}));
vi.mock('../pricing/pricing.service.ts', () => ({
  getPrices: mocks.price,
  refreshPriceWithoutStaleFallback: mocks.price,
  getSteamWorkerPoolSnapshot: vi.fn().mockResolvedValue({ totalWorkers: 1 }),
  getSourceCooldownRemainingMs: vi.fn().mockReturnValue(0),
}));

import {
  cancelPriceRefresh,
  clearAllRuntimeState,
  isInventoryRefreshInProgress,
  isPriceRefreshInProgress,
  refresh,
} from './inventory.service.ts';
import authRoutes from '../auth/auth.routes.ts';
import inventoryRoutes from './inventory.routes.ts';

function inventory(name: string): InventoryFetchResult {
  return {
    items: [
      {
        marketHashName: name,
        assetId: name,
        casketId: null,
        casketName: null,
        floatValue: null,
        paintSeed: null,
        iconUrl: null,
        stickers: null,
        schemaImage: null,
      },
    ],
    mainOk: true,
    storageComplete: true,
    storageSummary: {
      totalUnits: 0,
      nonEmptyUnits: 0,
      emptyUnits: 0,
      loadedUnits: 0,
      enumerated: true,
    },
  };
}

let finishPrices: () => void;
let pending: Promise<unknown>[];
let server: Server | undefined;

async function startApi(): Promise<string> {
  const app = express();
  app.use(express.json());
  app.use(
    session({ secret: 'inventory-priority-test-session', resave: false, saveUninitialized: false }),
  );
  app.use('/api/auth', authRoutes);
  app.use('/api', inventoryRoutes);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

beforeEach(() => {
  process.env.DB_PATH = ':memory:';
  initDb();
  clearAllRuntimeState();
  setPhase('idle', { owner: 'refresh' });
  mocks.steamId = 'A';
  mocks.loggedIn = true;
  mocks.login.mockReset().mockImplementation(async (username: string) => {
    mocks.steamId = username;
    mocks.loggedIn = true;
    setPhase('connected', { owner: 'steam', steamId: username });
    return { status: 'ok' };
  });
  mocks.logout.mockReset().mockImplementation(() => {
    mocks.loggedIn = false;
  });
  mocks.inventory.mockReset().mockImplementation(async () => inventory(`Item ${mocks.steamId}`));
  const prices = new Promise<void>((resolve) => {
    finishPrices = resolve;
  });
  mocks.price.mockReset().mockImplementation(async () => {
    await prices;
    return { freshPrice: 10, stalePrice: null, reason: 'fresh', cooldownMs: 0 };
  });
  pending = [];
  upsertProfile('A', 'Account A');
  upsertProfile('B', 'Account B');
});

afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
  clearAllRuntimeState();
  finishPrices();
  await Promise.all(pending);
  await vi.waitFor(() => expect(isPriceRefreshInProgress()).toBe(false));
  setPhase('idle', { owner: 'refresh' });
  closeDb();
});

describe('inventory priority', () => {
  it('completes the inventory and fetches a second account while first-account prices are pending', async () => {
    let firstCompleted = false;
    const first = refresh('A').then((result) => {
      firstCompleted = true;
      return result;
    });
    pending.push(first);
    await vi.waitFor(() => expect(countItemsByProfile('A')).toBe(1));

    expect(isInventoryRefreshInProgress('A')).toBe(false);
    expect(firstCompleted).toBe(true);
    expect(isPriceRefreshInProgress('A')).toBe(true);

    mocks.steamId = 'B';
    mocks.loggedIn = true;
    const second = refresh('B');
    pending.push(second);
    await expect(second).resolves.toMatchObject({ success: true, itemCount: 1 });
    expect(getItemsByProfile('B')[0].marketHashName).toBe('Item B');
    expect(mocks.inventory).toHaveBeenCalledTimes(2);
    expect(getPhaseState()).toMatchObject({ phase: 'fetching_prices', steamId: 'A' });
    expect(cancelPriceRefresh('A')).toBe(true);
    expect(getPhaseState()).toMatchObject({ phase: 'fetching_prices', steamId: 'B' });
  });

  it('refuses to copy another active account inventory into the requested profile', async () => {
    finishPrices();
    mocks.steamId = 'B';
    setPhase('connected', { owner: 'steam', steamId: 'B' });
    const result = await refresh('A');
    expect(result).toMatchObject({ success: false, error: 'steam_session_changed' });
    expect(mocks.inventory).not.toHaveBeenCalled();
    expect(countItemsByProfile('A')).toBe(0);
    expect(mocks.logout).not.toHaveBeenCalled();
    expect(getPhaseState()).toMatchObject({ phase: 'connected', steamId: 'B' });
  });

  it('closes the matching Steam connection and releases the inventory lock after a fetch error', async () => {
    mocks.inventory.mockRejectedValueOnce(new Error('Inventory unavailable'));
    await expect(refresh('A')).resolves.toMatchObject({ success: false });
    expect(mocks.logout).toHaveBeenCalledTimes(1);
    expect(isInventoryRefreshInProgress()).toBe(false);
    expect(getPhaseState().phase).toBe('idle');
  });

  it('keeps an existing inventory when the main fetch is incomplete', async () => {
    getSqlite()
      .prepare("INSERT INTO items (steam_id, market_hash_name) VALUES ('A', 'Existing')")
      .run();
    mocks.inventory.mockResolvedValueOnce({ ...inventory('Partial'), mainOk: false });
    await expect(refresh('A')).resolves.toMatchObject({
      success: false,
      error: 'fetch_incomplete',
    });
    expect(getItemsByProfile('A').map((item) => item.marketHashName)).toEqual(['Existing']);
    expect(mocks.price).not.toHaveBeenCalled();
  });

  it('reports an incomplete first fetch as a failure instead of saving a successful empty account', async () => {
    mocks.inventory.mockResolvedValueOnce({ ...inventory('Partial'), items: [], mainOk: false });
    await expect(refresh('A')).resolves.toMatchObject({
      success: false,
      error: 'fetch_incomplete',
      kept: 0,
    });
    expect(mocks.price).not.toHaveBeenCalled();
  });

  it('preserves stored storage items when only the main inventory could be fetched', async () => {
    getSqlite()
      .prepare(
        "INSERT INTO items (steam_id, market_hash_name, casket_id) VALUES ('A', 'Stored', 'C1')",
      )
      .run();
    mocks.inventory.mockResolvedValueOnce({ ...inventory('Main'), storageComplete: false });
    await expect(refresh('A')).resolves.toMatchObject({ success: true, itemCount: 2 });
    expect(getItemsByProfile('A').map((item) => item.marketHashName)).toEqual(['Main', 'Stored']);
  });

  it('accepts a second account through the login API while the first account is pricing', async () => {
    const api = await startApi();
    await refresh('A');
    await vi.waitFor(() => expect(mocks.price).toHaveBeenCalledTimes(1));
    const response = await fetch(`${api}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'B', password: 'fixture-password' }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, profile: { steamId: 'B' } });
    await vi.waitFor(() => expect(countItemsByProfile('B')).toBe(1));
    const status = await fetch(`${api}/api/inventory/status?steamId=B`).then((res) => res.json());
    expect(status).toMatchObject({ syncType: 'prices', isRefreshing: true });
    expect(mocks.inventory).toHaveBeenCalledTimes(2);
  });

  it('refuses a login only while the Steam inventory is actually being extracted', async () => {
    let releaseInventory!: (value: InventoryFetchResult) => void;
    mocks.inventory.mockImplementationOnce(
      () =>
        new Promise<InventoryFetchResult>((resolve) => {
          releaseInventory = resolve;
        }),
    );
    const api = await startApi();
    const running = refresh('A');
    pending.push(running);
    await vi.waitFor(() => expect(mocks.inventory).toHaveBeenCalledTimes(1));
    const response = await fetch(`${api}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'B', password: 'fixture-password' }),
    });
    expect(response.status).toBe(409);
    expect(mocks.login).not.toHaveBeenCalled();
    releaseInventory(inventory('Item A'));
    await expect(running).resolves.toMatchObject({ success: true });
  });
});
