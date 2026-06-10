import { getAllInventory } from '../steam/steam.inventory.ts';
import { steamClient } from '../steam/steam.client.ts';
import { initialize as initSchema } from '../steam/steam.schema.ts';
import {
  getCachedPrices,
  getPrices,
  refreshPriceWithoutStaleFallback,
  getSteamWorkerPoolSnapshot,
  getSourceCooldownRemainingMs,
  type PriceFetchReason,
  type PriceSource,
} from '../pricing/pricing.service.ts';
import * as historyService from '../history/history.service.ts';
import {
  replaceProfileItems,
  replaceMainInventoryItems,
  countItemsByProfile,
  getItemsByProfile,
} from '../../db/queries/items.ts';
import { updateProfileSummary } from '../../db/queries/profiles.ts';
import { getPurchasesByProfile } from '../../db/queries/purchases.ts';
import {
  getAllLatestPricesBySource,
  getAllPreviousPricesBySource,
  getLatestPriceWindowBySource,
} from '../../db/queries/prices.ts';
import { getItemRarity, getItemQuality } from '../../../shared/constants/rarity.ts';
import { getRarityForName } from '../steam/steam.schema.ts';
import { getWearFromMarketHashName, getWearLevel } from '../../../shared/constants/wear.ts';
import { logger } from '../../lib/logger.ts';
import type { ItemGroup, StorageUnit, Sticker } from '../../../shared/types/inventory.ts';
import type { ChangeInfo, DashboardData, DailyHistoryEntry } from '../../../shared/types/api.ts';
import type { StorageUnitFetchSummary } from '../steam/steam.inventory.ts';

export type PriceRefreshScope = 'all' | 'stale_or_missing' | 'missing';
interface PriceRefreshTaskState {
  id: number;
  source: PriceSource;
  cancelled: boolean;
}
interface PriceRefreshProgressState {
  taskId: number;
  fetched: number;
  total: number;
  source: PriceSource;
}

let lastRefresh: Date | null = null;
let isRefreshing = false;
let currentRefreshSteamId: string | null = null;
const activePriceRefreshes = new Map<string, PriceRefreshTaskState>();
const storageSummaryBySteamId = new Map<string, StorageUnitFetchSummary>();
const priceRefreshProgressBySteamId = new Map<string, PriceRefreshProgressState>();
const lastInventoryRefreshBySteamId = new Map<string, Date>();
const lastPriceRefreshBySteamId = new Map<string, Partial<Record<PriceSource, Date | null>>>();
const missingPriceChecksByProfileSource = new Map<string, Map<string, number>>();
const noFreshPriceChecksByProfileSource = new Map<string, Map<string, number>>();
const staleRefreshCursorByProfileSource = new Map<string, number>();
let priceRefreshTaskCounter = 0;
// Tracks progress of full inventory refresh (Steam inventory fetch + initial price pass)
let inventoryRefreshProgress: { fetched: number; total: number } | null = null;

const STEAM_CDN = 'https://community.akamai.steamstatic.com/economy/image/';
const PRICE_REFRESH_STALE_HOURS = parseFloat(
  process.env.PRICE_CACHE_TTL_HOURS || process.env.PRICE_STALE_HOURS || '20',
);
const MISSING_PRICE_CHECK_COOLDOWN_MINUTES = parseInt(
  process.env.MISSING_PRICE_CHECK_COOLDOWN_MINUTES || '60',
  10,
);
const MISSING_PRICE_CHECK_COOLDOWN_MS = Math.max(
  5 * 60_000,
  MISSING_PRICE_CHECK_COOLDOWN_MINUTES * 60_000,
);
const NO_FRESH_PRICE_CHECK_COOLDOWN_MINUTES = parseInt(
  process.env.NO_FRESH_PRICE_CHECK_COOLDOWN_MINUTES || '360',
  10,
);
const NO_FRESH_PRICE_CHECK_COOLDOWN_MS = Math.max(
  30 * 60_000,
  NO_FRESH_PRICE_CHECK_COOLDOWN_MINUTES * 60_000,
);
const PRICE_FETCH_CONCURRENCY = Math.max(
  10,
  parseInt(process.env.PRICE_FETCH_CONCURRENCY || process.env.STEAM_PROXY_WORKERS || '10', 10),
);
const PRICE_FETCH_RETRY_ATTEMPTS = Math.max(1, parseInt(process.env.PRICE_FETCH_RETRY_ATTEMPTS || '3', 10));
const PRICE_FETCH_RETRY_BACKOFF_MS = Math.max(200, parseInt(process.env.PRICE_FETCH_RETRY_BACKOFF_MS || '1200', 10));
const PRICE_REFRESH_MAX_ITEMS_PER_CYCLE = Math.max(
  0,
  parseInt(process.env.PRICE_REFRESH_MAX_ITEMS_PER_CYCLE || '300', 10),
);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function markPriceRefreshCompleted(steamId: string, source: PriceSource, at: Date) {
  const current = lastPriceRefreshBySteamId.get(steamId) ?? {};
  current[source] = at;
  lastPriceRefreshBySteamId.set(steamId, current);
}

function getMissingPriceCheckKey(steamId: string, source: PriceSource) {
  return `${steamId}:${source}`;
}

function shouldRefreshMissingPriceName(steamId: string, source: PriceSource, name: string, now: number): boolean {
  const byName = missingPriceChecksByProfileSource.get(getMissingPriceCheckKey(steamId, source));
  if (!byName) return true;

  const checkedAt = byName.get(name);
  if (!checkedAt) return true;

  if (now - checkedAt >= MISSING_PRICE_CHECK_COOLDOWN_MS) {
    byName.delete(name);
    if (byName.size === 0) {
      missingPriceChecksByProfileSource.delete(getMissingPriceCheckKey(steamId, source));
    }
    return true;
  }

  return false;
}

function markMissingPriceChecked(steamId: string, source: PriceSource, name: string, checkedAt: number) {
  const key = getMissingPriceCheckKey(steamId, source);
  let byName = missingPriceChecksByProfileSource.get(key);
  if (!byName) {
    byName = new Map<string, number>();
    missingPriceChecksByProfileSource.set(key, byName);
  }
  byName.set(name, checkedAt);
}

function clearMissingPriceChecked(steamId: string, source: PriceSource, name: string) {
  const key = getMissingPriceCheckKey(steamId, source);
  const byName = missingPriceChecksByProfileSource.get(key);
  if (!byName) return;
  byName.delete(name);
  if (byName.size === 0) {
    missingPriceChecksByProfileSource.delete(key);
  }
}

function shouldRefreshNoFreshPriceName(steamId: string, source: PriceSource, name: string, now: number): boolean {
  const byName = noFreshPriceChecksByProfileSource.get(getMissingPriceCheckKey(steamId, source));
  if (!byName) return true;

  const checkedAt = byName.get(name);
  if (!checkedAt) return true;

  if (now - checkedAt >= NO_FRESH_PRICE_CHECK_COOLDOWN_MS) {
    byName.delete(name);
    if (byName.size === 0) {
      noFreshPriceChecksByProfileSource.delete(getMissingPriceCheckKey(steamId, source));
    }
    return true;
  }

  return false;
}

function markNoFreshPriceChecked(steamId: string, source: PriceSource, name: string, checkedAt: number) {
  const key = getMissingPriceCheckKey(steamId, source);
  let byName = noFreshPriceChecksByProfileSource.get(key);
  if (!byName) {
    byName = new Map<string, number>();
    noFreshPriceChecksByProfileSource.set(key, byName);
  }
  byName.set(name, checkedAt);
}

function clearNoFreshPriceChecked(steamId: string, source: PriceSource, name: string) {
  const key = getMissingPriceCheckKey(steamId, source);
  const byName = noFreshPriceChecksByProfileSource.get(key);
  if (!byName) return;
  byName.delete(name);
  if (byName.size === 0) {
    noFreshPriceChecksByProfileSource.delete(key);
  }
}

function takeCyclicWindow<T>(items: T[], size: number, start: number): { window: T[]; nextStart: number } {
  if (size <= 0 || items.length === 0 || size >= items.length) {
    return { window: items, nextStart: 0 };
  }
  const normalizedStart = ((start % items.length) + items.length) % items.length;
  const window: T[] = [];
  for (let i = 0; i < size; i++) {
    window.push(items[(normalizedStart + i) % items.length]);
  }
  return {
    window,
    nextStart: (normalizedStart + size) % items.length,
  };
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  handler: (item: T, index: number) => Promise<void>,
  shouldStop?: () => boolean,
): Promise<void> {
  if (items.length === 0) return;

  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  let cursor = 0;
  const runners = Array.from({ length: workerCount }, async () => {
    while (true) {
      if (shouldStop?.()) return;
      const index = cursor++;
      if (index >= items.length) {
        return;
      }
      await handler(items[index], index);
    }
  });

  await Promise.all(runners);
}

export function getLastRefresh(steamId?: string, source?: PriceSource) {
  if (steamId) {
    if (source) {
      const bySource = lastPriceRefreshBySteamId.get(steamId)?.[source] ?? null;
      if (bySource) return bySource;
      if (source === 'csfloat' || source === 'skinport') return null;
    }
    return lastInventoryRefreshBySteamId.get(steamId) ?? null;
  }
  return lastRefresh;
}

export function isRefreshInProgress() {
  return isRefreshing;
}

export function isInventoryRefreshInProgress(steamId?: string) {
  if (!steamId) {
    return isRefreshing;
  }
  return isRefreshing && currentRefreshSteamId === steamId;
}

export function getRefreshProgress(steamId?: string) {
  if (steamId && currentRefreshSteamId !== steamId) {
    return null;
  }
  return inventoryRefreshProgress;
}

export function isPriceRefreshInProgress(steamId?: string) {
  if (!steamId) {
    return activePriceRefreshes.size > 0;
  }
  return activePriceRefreshes.has(steamId);
}

export function getActivePriceRefreshSource(steamId: string): PriceSource | null {
  return activePriceRefreshes.get(steamId)?.source ?? null;
}

export function cancelPriceRefresh(steamId: string) {
  const task = activePriceRefreshes.get(steamId);
  if (!task) return false;
  task.cancelled = true;
  // Remove immediately so UI stops showing an active sync.
  activePriceRefreshes.delete(steamId);
  priceRefreshProgressBySteamId.delete(steamId);
  return true;
}

export function getPriceRefreshProgress(steamId?: string) {
  if (steamId) {
    const progress = priceRefreshProgressBySteamId.get(steamId);
    return progress ? { fetched: progress.fetched, total: progress.total } : null;
  }
  const first = priceRefreshProgressBySteamId.values().next();
  if (first.done) return null;
  return { fetched: first.value.fetched, total: first.value.total };
}

export async function refresh(steamId: string, force = false) {
  if (isRefreshing) {
    logger.info('[Inventory] Refresh already in progress, skipping');
    return { skipped: true };
  }

  isRefreshing = true;
  currentRefreshSteamId = steamId;
  inventoryRefreshProgress = { fetched: 0, total: 0 };
  const startTime = Date.now();

  try {
    logger.info(`[Inventory] Starting full refresh for ${steamId}...`);
    await initSchema();

    const inventoryResult = await getAllInventory();
    const items = inventoryResult.items;
    storageSummaryBySteamId.set(steamId, inventoryResult.storageSummary);

    // Anti-wipe guard: a transient Steam/GC error can return 0 items OR a
    // failed main fetch. Never replace a non-empty inventory with an empty
    // fetch or one whose main inventory errored — keep the existing data
    // unless the caller explicitly forces the replace.
    const previousCount = countItemsByProfile(steamId);
    if (!force && previousCount > 0 && (items.length === 0 || !inventoryResult.mainOk)) {
      steamClient.logout();
      const detail =
        items.length === 0
          ? 'fetch returned 0 items'
          : `incomplete fetch (main ok=${inventoryResult.mainOk}, storage ${inventoryResult.storageSummary.loadedUnits}/${inventoryResult.storageSummary.nonEmptyUnits} units)`;
      logger.warn(
        `[Inventory] Aborting replace for ${steamId}: ${detail}; keeping existing ${previousCount} items. Re-run with force to override.`,
      );
      return { success: false, error: 'fetch_incomplete', kept: previousCount, detail };
    }
    if (!force && previousCount > 0 && !inventoryResult.storageComplete) {
      // Main inventory is fresh but storage units could not be (fully) read —
      // typically the GC-less rescue login. Replace only the main rows and
      // keep the stored storage-unit contents instead of aborting everything.
      logger.warn(
        `[Inventory] Partial refresh for ${steamId}: main inventory replaced, storage units kept (GC unavailable — storage ${inventoryResult.storageSummary.loadedUnits}/${inventoryResult.storageSummary.nonEmptyUnits} units).`,
      );
      replaceMainInventoryItems(items.filter((i) => !i.casketId), steamId);
    } else {
      // Atomic: delete + insert in one transaction (no partial-failure wipe).
      replaceProfileItems(items, steamId);
    }
    // After a partial refresh the DB also keeps the old storage rows, so count
    // what was actually persisted instead of trusting the fetched list.
    const persistedCount = countItemsByProfile(steamId);

    // Disconnect Steam as soon as inventory extraction is done.
    // Price fetching uses Steam Market HTTP and does not need an active Steam session.
    steamClient.logout();
    logger.info('[Inventory] Steam session disconnected after inventory extraction');

    const itemCountByName = new Map<string, number>();
    for (const item of items) {
      itemCountByName.set(item.marketHashName, (itemCountByName.get(item.marketHashName) || 0) + 1);
    }
    const uniqueNames = [...itemCountByName.keys()];
    inventoryRefreshProgress = { fetched: 0, total: uniqueNames.length };
    logger.info(`[Inventory] Fetching prices for ${uniqueNames.length} unique items...`);

    let totalValue = 0;
    await runWithConcurrency(uniqueNames, PRICE_FETCH_CONCURRENCY, async (name) => {
      try {
        const prices = await getPrices(name, false, 'steam');
        const itemCount = itemCountByName.get(name) || 0;
        if (prices.average) {
          totalValue += prices.average * itemCount;
        }
      } catch (err) {
        logger.error(`[Inventory] Price fetch error for ${name}:`, (err as Error).message);
      } finally {
        if (inventoryRefreshProgress) {
          inventoryRefreshProgress = {
            fetched: inventoryRefreshProgress.fetched + 1,
            total: inventoryRefreshProgress.total,
          };
        }
      }
    });

    // Recompute from the cache so the snapshot includes sticker values \u2014 the
    // same basis as the dashboard total it will be compared against.
    const finalTotal = computeSourceTotal(getItemsByProfile(steamId), 'steam');
    totalValue = finalTotal.totalValue;

    const changeInfo = historyService.get24hChange(steamId, totalValue);

    if (changeInfo.hasData && changeInfo.yesterdayValue && totalValue < changeInfo.yesterdayValue * 0.2) {
      logger.warn(`[History] SKIPPING SNAPSHOT: Calculated value \u20ac${totalValue.toFixed(2)} is suspiciously low compared to yesterday (\u20ac${changeInfo.yesterdayValue.toFixed(2)}). Preserving history.`);
    } else {
      historyService.saveSnapshot(steamId, totalValue, persistedCount);
    }

    updateProfileSummary(steamId, persistedCount, totalValue);

    const completedAt = new Date();
    lastInventoryRefreshBySteamId.set(steamId, completedAt);
    lastRefresh = completedAt;
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`[Inventory] Refresh complete in ${duration}s. Total value: \u20ac${totalValue.toFixed(2)}`);

    return { success: true, itemCount: persistedCount, totalValue, duration: parseFloat(duration) };
  } catch (err) {
    logger.error('[Inventory] Refresh failed:', err);
    return { success: false, error: (err as Error).message };
  } finally {
    isRefreshing = false;
    currentRefreshSteamId = null;
    inventoryRefreshProgress = null;
  }
}

function groupItems(
  rawItems: Array<{
    marketHashName: string;
    assetId: string | null;
    casketId: string | null;
    casketName: string | null;
    floatValue: number | null;
    paintSeed: number | null;
    iconUrl: string | null;
    stickers: string | null;
    schemaImage: string | null;
  }>,
  priceMap: Map<string, number | null>,
  previousPriceMap?: Map<string, number | null>,
): ItemGroup[] {
  const groups: Record<string, {
    quantity: number;
    items: typeof rawItems;
    casketIds: Set<string>;
  }> = {};

  for (const item of rawItems) {
    if (!groups[item.marketHashName]) {
      groups[item.marketHashName] = { quantity: 0, items: [], casketIds: new Set() };
    }
    groups[item.marketHashName].quantity++;
    groups[item.marketHashName].items.push(item);
    if (item.casketId) {
      groups[item.marketHashName].casketIds.add(item.casketId);
    }
  }

  const result: ItemGroup[] = [];

  for (const [name, data] of Object.entries(groups)) {
    const unitPrice = priceMap.get(name) ?? null;
    const schemaRarity = getRarityForName(name);
    const rarity = getItemRarity(name, schemaRarity);
    const quality = getItemQuality(name);
    const floatVal = data.items[0]?.floatValue ?? null;
    const wear = getWearLevel(floatVal) ?? getWearFromMarketHashName(name);

    let stickerValue = 0;
    for (const item of data.items) {
      const stickers = parseStickers(item.stickers);
      if (stickers) {
        for (const s of stickers) {
          const sp = priceMap.get(s.name);
          if (sp) stickerValue += sp;
        }
      }
    }

    const total = (unitPrice || 0) * data.quantity + stickerValue;
    const firstItem = data.items[0];
    const imageUrl = getBestImage(name, firstItem);
    const stickers = parseStickers(firstItem?.stickers) || [];

    let priceChange: number | null = null;
    let priceChangePercent: number | null = null;
    if (previousPriceMap && unitPrice !== null) {
      const prevPrice = previousPriceMap.get(name) ?? null;
      if (prevPrice !== null && prevPrice > 0) {
        priceChange = unitPrice - prevPrice;
        priceChangePercent = (priceChange / prevPrice) * 100;
      }
    }

    result.push({
      marketHashName: name,
      quantity: data.quantity,
      items: [],
      casketIds: [...data.casketIds],
      floatValue: floatVal,
      wear,
      rarity,
      quality,
      imageUrl,
      price: unitPrice,
      total,
      stickers,
      stickerValue,
      priceChange,
      priceChangePercent,
      buyPrice: null,
    });
  }

  result.sort((a, b) => b.total - a.total);
  return result;
}

/** Decorate grouped items with the profile's purchase prices (P&L basis). */
function applyBuyPrices(groups: ItemGroup[], purchases: Map<string, number>) {
  if (purchases.size === 0) return;
  for (const group of groups) {
    group.buyPrice = purchases.get(group.marketHashName) ?? null;
  }
}

function parseStickers(stickersJson: string | null): Sticker[] | null {
  if (!stickersJson) return null;
  try {
    return JSON.parse(stickersJson);
  } catch {
    return null;
  }
}

function getBestImage(
  _name: string,
  item: { iconUrl: string | null; schemaImage: string | null } | undefined,
): string | null {
  if (item?.iconUrl) return `${STEAM_CDN}${item.iconUrl}/200fx200f`;
  if (item?.schemaImage) return item.schemaImage;
  return null;
}

function getPriceTimestampMs(timestamp: string | null | undefined): number | null {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp.includes('Z') ? timestamp : `${timestamp}Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function getNamesToRefresh(
  rawItems: Array<{ marketHashName: string }>,
  source: PriceSource,
  scope: PriceRefreshScope,
): string[] {
  const uniqueNames = [...new Set(rawItems.map((i) => i.marketHashName))];
  if (scope === 'all') {
    return uniqueNames;
  }

  const latestPrices = getAllLatestPricesBySource(source);
  const latestByName = new Map(
    latestPrices.map((row) => [row.market_hash_name, { price: row.price_eur, timestamp: row.timestamp }]),
  );
  const now = Date.now();

  return uniqueNames.filter((name) => {
    const latest = latestByName.get(name);
    if (!latest || latest.price === null || latest.price === undefined) {
      return true;
    }
    if (scope === 'missing') {
      return false;
    }

    const ts = getPriceTimestampMs(latest.timestamp);
    if (!ts) {
      return true;
    }

    const ageHours = (now - ts) / (1000 * 60 * 60);
    return ageHours >= PRICE_REFRESH_STALE_HOURS;
  });
}

/**
 * Source total from the latest cached prices, STICKER VALUES INCLUDED — the
 * same basis as the dashboard total, so history snapshots and the 24h change
 * compare like with like.
 */
function computeSourceTotal(
  rawItems: ReturnType<typeof getItemsByProfile>,
  source: PriceSource,
): { totalValue: number; pricedItems: number } {
  const latest = getAllLatestPricesBySource(source);
  const priceMap = new Map(latest.map((p) => [p.market_hash_name, p.price_eur]));
  let totalValue = 0;
  let pricedItems = 0;
  for (const item of rawItems) {
    const price = priceMap.get(item.marketHashName);
    if (price !== null && price !== undefined) {
      totalValue += price;
      pricedItems += 1;
    }
    const stickers = parseStickers(item.stickers);
    if (stickers) {
      for (const s of stickers) {
        const sp = priceMap.get(s.name);
        if (sp !== null && sp !== undefined) totalValue += sp;
      }
    }
  }
  return { totalValue, pricedItems };
}

export function getDashboardData(
  steamId: string,
  days: number = 30,
  priceSource: PriceSource = 'steam',
): DashboardData {
  const rawItems = getItemsByProfile(steamId);
  const storageSummary = storageSummaryBySteamId.get(steamId);

  // Build price map for selected source
  const latestPrices = getAllLatestPricesBySource(priceSource);
  const priceMap = new Map<string, number | null>();
  for (const p of latestPrices) {
    priceMap.set(p.market_hash_name, p.price_eur);
  }

  // Also compute sticker prices
  for (const item of rawItems) {
    const stickers = parseStickers(item.stickers);
    if (stickers) {
      for (const s of stickers) {
        if (!priceMap.has(s.name)) {
          const cached = getCachedPrices(s.name);
          priceMap.set(
            s.name,
            priceSource === 'csfloat' ? cached.csfloat : priceSource === 'skinport' ? cached.skinport : cached.steam,
          );
        }
      }
    }
  }

  // Previous prices for change detection
  const previousPriceMap = getAllPreviousPricesBySource(priceSource);

  // Purchase prices (per profile) for the P&L computation
  const purchases = getPurchasesByProfile(steamId);

  // All items grouped
  const allGrouped = groupItems(rawItems, priceMap, previousPriceMap);
  applyBuyPrices(allGrouped, purchases);
  const totalValue = allGrouped.reduce((sum, g) => sum + g.total, 0);

  // Invested / P&L over groups that have a purchase price (null when none do).
  let invested: number | null = null;
  let pnl: number | null = null;
  for (const group of allGrouped) {
    if (group.buyPrice === null) continue;
    const cost = group.buyPrice * group.quantity;
    invested = (invested ?? 0) + cost;
    pnl = (pnl ?? 0) + (group.total - cost);
  }

  // Main inventory
  const mainRaw = rawItems.filter((i) => !i.casketId);
  const mainGrouped = groupItems(mainRaw, priceMap, previousPriceMap);
  applyBuyPrices(mainGrouped, purchases);
  const mainTotal = mainGrouped.reduce((sum, g) => sum + g.total, 0);

  // Storage units
  const storageUnits: StorageUnit[] = [];
  const casketItemsMap = new Map<string, typeof rawItems>();
  const casketAssetMap = new Map<string, (typeof rawItems)[number]>();

  for (const item of rawItems) {
    if (item.casketId) {
      if (!casketItemsMap.has(item.casketId)) {
        casketItemsMap.set(item.casketId, []);
      }
      casketItemsMap.get(item.casketId)!.push(item);
    }
    if (item.assetId && !casketAssetMap.has(item.assetId)) {
      casketAssetMap.set(item.assetId, item);
    }
  }

  for (const [casketId, casketItems] of casketItemsMap) {
    const casketGrouped = groupItems(casketItems, priceMap, previousPriceMap);
    applyBuyPrices(casketGrouped, purchases);
    const casketTotal = casketGrouped.reduce((sum, g) => sum + g.total, 0);

    // Find the storage unit item itself to get its image
    const casketItem = casketAssetMap.get(casketId);
    const casketImageUrl = casketItem ? getBestImage(casketItem.marketHashName, casketItem) : null;

    storageUnits.push({
      casketId,
      name: casketItems[0]?.casketName || `Storage Unit #${storageUnits.length + 1}`,
      shortId: casketId.slice(-6),
      imageUrl: casketImageUrl,
      itemCount: casketItems.length,
      uniqueItems: casketGrouped.length,
      totalValue: casketTotal,
      items: casketGrouped,
    });
  }
  storageUnits.sort((a, b) => b.totalValue - a.totalValue);

  // History (per selected source — each source has its own snapshot line)
  const historyData = historyService.getHistory(steamId, days, priceSource);
  const dailyHistory: DailyHistoryEntry[] = historyData
    .map((day, index) => {
      let change = 0;
      let changePercent = 0;
      if (index > 0) {
        const prev = historyData[index - 1];
        change = day.value - prev.value;
        changePercent = prev.value > 0 ? (change / prev.value) * 100 : 0;
      }
      return { ...day, change, changePercent };
    })
    .reverse();

  // Snapshots are per-source, so the 24h change is meaningful for every source
  // (hasData stays false until that source has a yesterday snapshot).
  const change24h: ChangeInfo = historyService.get24hChange(steamId, totalValue, priceSource);
  const priceWindow = getLatestPriceWindowBySource(priceSource);

  return {
    items: allGrouped,
    mainInventory: { items: mainGrouped, total: mainTotal, count: mainRaw.length },
    storageUnits,
    emptyStorageUnits: storageSummary?.emptyUnits ?? 0,
    totalItems: rawItems.length,
    uniqueItems: allGrouped.length,
    totalValue,
    invested,
    pnl,
    change24h,
    historyData,
    dailyHistory,
    priceWindow,
  };
}

export async function refreshPrices(
  steamId: string,
  source: PriceSource = 'steam',
  scope: PriceRefreshScope = 'stale_or_missing',
) {
  const existing = activePriceRefreshes.get(steamId);
  if (existing) {
    if (existing.source === source) {
      logger.info(`[Prices] ${source} refresh already in progress for ${steamId}, skipping`);
      return;
    }
    existing.cancelled = true;
    logger.info(`[Prices] Cancelling ${existing.source} refresh for ${steamId} (switch to ${source})`);
  }

  const task: PriceRefreshTaskState = { id: ++priceRefreshTaskCounter, source, cancelled: false };
  activePriceRefreshes.set(steamId, task);

  try {
    const rawItems = getItemsByProfile(steamId);
    if (rawItems.length === 0) {
      logger.info('[Prices] No items in DB for this profile, skipping price refresh');
      return;
    }

    let namesToRefresh = getNamesToRefresh(rawItems, source, scope);
    if (scope === 'missing') {
      const now = Date.now();
      const beforeFilterCount = namesToRefresh.length;
      namesToRefresh = namesToRefresh.filter((name) =>
        shouldRefreshMissingPriceName(steamId, source, name, now),
      );
      const skippedRecentlyChecked = beforeFilterCount - namesToRefresh.length;
      if (skippedRecentlyChecked > 0) {
        logger.info(
          `[Prices] ${source} refresh skipped ${skippedRecentlyChecked} recently checked missing items (cooldown ${(MISSING_PRICE_CHECK_COOLDOWN_MS / 1000 / 60).toFixed(0)}m).`,
        );
      }
    }
    if (scope === 'stale_or_missing') {
      const now = Date.now();
      const beforeFilterCount = namesToRefresh.length;
      namesToRefresh = namesToRefresh.filter((name) =>
        shouldRefreshNoFreshPriceName(steamId, source, name, now),
      );
      const skippedRecentlyChecked = beforeFilterCount - namesToRefresh.length;
      if (skippedRecentlyChecked > 0) {
        logger.info(
          `[Prices] ${source} refresh skipped ${skippedRecentlyChecked} recently no-fresh items (cooldown ${(NO_FRESH_PRICE_CHECK_COOLDOWN_MS / 1000 / 60).toFixed(0)}m).`,
        );
      }
    }

    if (
      source === 'steam' &&
      scope === 'stale_or_missing' &&
      PRICE_REFRESH_MAX_ITEMS_PER_CYCLE > 0 &&
      namesToRefresh.length > PRICE_REFRESH_MAX_ITEMS_PER_CYCLE
    ) {
      const cycleKey = `${steamId}:${source}`;
      const cursor = staleRefreshCursorByProfileSource.get(cycleKey) || 0;
      const originalCount = namesToRefresh.length;
      const windowed = takeCyclicWindow(namesToRefresh, PRICE_REFRESH_MAX_ITEMS_PER_CYCLE, cursor);
      namesToRefresh = windowed.window;
      staleRefreshCursorByProfileSource.set(cycleKey, windowed.nextStart);
      logger.info(
        `[Prices] ${source} refresh windowed ${namesToRefresh.length}/${originalCount} stale_or_missing items (cursor ${cursor} -> ${windowed.nextStart}).`,
      );
    }

    if (namesToRefresh.length === 0) {
      const completedAt = new Date();
      markPriceRefreshCompleted(steamId, source, completedAt);
      lastRefresh = completedAt;
      // Still record today's snapshot: right after midnight every price can be
      // "fresh enough", which would otherwise leave a hole in the history line.
      const cachedTotal = computeSourceTotal(rawItems, source);
      if (cachedTotal.pricedItems > 0) {
        const changeInfo = historyService.get24hChange(steamId, cachedTotal.totalValue, source);
        if (!(changeInfo.hasData && changeInfo.yesterdayValue && cachedTotal.totalValue < changeInfo.yesterdayValue * 0.2)) {
          historyService.saveSnapshot(steamId, cachedTotal.totalValue, rawItems.length, source);
        }
      }
      logger.info(`[Prices] ${source} refresh skipped: no items match scope ${scope} for ${steamId}`);
      return;
    }

    const initialCooldownMs = getSourceCooldownRemainingMs(source);
    if (source !== 'steam' && initialCooldownMs > 0) {
      logger.warn(
        `[Prices] ${source} refresh blocked by cooldown (${Math.ceil(initialCooldownMs / 1000)}s remaining).`,
      );
      return;
    }

    priceRefreshProgressBySteamId.set(steamId, {
      taskId: task.id,
      fetched: 0,
      total: namesToRefresh.length,
      source,
    });
    logger.info(`[Prices] Refreshing ${source} prices for ${namesToRefresh.length} unique items (scope: ${scope})...`);

    let totalValue = 0;
    let pricedItems = 0;
    let resolvedNames = 0;
    let unresolvedNames = 0;
    let processedCount = 0;
    let foundCount = 0;
    let staleKeptCount = 0;
    let noPriceCount = 0;
    let retryScheduledCount = 0;
    let workerCrashCount = 0;
    let retryQueueSize = 0;
    const finalizedNames = new Set<string>();

    const finalizeName = (
      name: string,
      freshPrice: number | null,
      attempt: number,
      stalePrice: number | null,
      reason: PriceFetchReason,
    ) => {
      if (finalizedNames.has(name)) {
        return;
      }
      finalizedNames.add(name);

      const progress = priceRefreshProgressBySteamId.get(steamId);
      if (progress && progress.taskId === task.id) {
        priceRefreshProgressBySteamId.set(steamId, {
          taskId: progress.taskId,
          fetched: progress.fetched + 1,
          total: progress.total,
          source,
        });
      }

      processedCount += 1;
      if (freshPrice !== null) {
        foundCount += 1;
        clearNoFreshPriceChecked(steamId, source, name);
        logger.info(
          `[Prices] ${source} price found: ${name} = \u20ac${freshPrice.toFixed(2)} (attempt ${attempt})`,
        );
      } else if (stalePrice !== null) {
        staleKeptCount += 1;
        if (reason === 'no_price') {
          markNoFreshPriceChecked(steamId, source, name, Date.now());
          logger.debug(
            `[Prices] ${source} no fresh price for ${name} after ${attempt} attempt(s). Stale value kept unchanged (\u20ac${stalePrice.toFixed(2)}).`,
          );
        } else {
          logger.warn(
            `[Prices] ${source} no fresh price for ${name} after ${attempt} attempt(s), reason ${reason}. Stale value kept unchanged (\u20ac${stalePrice.toFixed(2)}).`,
          );
        }
      } else {
        noPriceCount += 1;
        if (reason === 'no_price') {
          markNoFreshPriceChecked(steamId, source, name, Date.now());
          logger.info(`[Prices] ${source} no price for ${name} after ${attempt} attempt(s).`);
        } else {
          logger.warn(`[Prices] ${source} no price for ${name} after ${attempt} attempt(s), reason ${reason}.`);
        }
      }

      if (processedCount % 25 === 0 || processedCount === namesToRefresh.length) {
        logger.info(
          `[Prices] Progress: ${processedCount}/${namesToRefresh.length} processed, ${foundCount} fresh, ${staleKeptCount} stale-kept, ${noPriceCount} no-price, ${retryScheduledCount} retries, queue ${retryQueueSize}.`,
        );
      }

      if (scope === 'missing') {
        const now = Date.now();
        if (freshPrice === null) {
          markMissingPriceChecked(steamId, source, name, now);
          unresolvedNames += 1;
        } else {
          clearMissingPriceChecked(steamId, source, name);
          resolvedNames += 1;
        }
      }
    };

    const fetchOneName = async (
      name: string,
      attempt: number,
      workerLabel: string,
    ): Promise<{ status: 'success' | 'retry' | 'failed'; retryAfterMs?: number }> => {
      const maxAttempts = source === 'steam' ? PRICE_FETCH_RETRY_ATTEMPTS : 1;
      try {
        const refreshed = await refreshPriceWithoutStaleFallback(name, source);
        if (refreshed.freshPrice !== null) {
          finalizeName(name, refreshed.freshPrice, attempt, refreshed.stalePrice, 'fresh');
          return { status: 'success' };
        }

        const shouldRetry =
          source === 'steam' &&
          attempt < maxAttempts &&
          (refreshed.reason === 'no_worker' || refreshed.reason === 'error');

        if (shouldRetry) {
          const retryAfterMs = Math.max(
            PRICE_FETCH_RETRY_BACKOFF_MS,
            Math.min(12_000, Math.max(0, refreshed.cooldownMs || 0)),
          );
          logger.info(
            `[Prices] ${source} check failed for ${name} on ${workerLabel} (attempt ${attempt}/${maxAttempts}, reason ${refreshed.reason}, cooldown ${Math.ceil((refreshed.cooldownMs || 0) / 1000)}s). Releasing for another worker.`,
          );
          return { status: 'retry', retryAfterMs };
        }

        finalizeName(name, null, attempt, refreshed.stalePrice, refreshed.reason);
        return { status: 'failed' };
      } catch (err) {
        logger.error(
          `[Prices] ${source} price fetch error for ${name} on ${workerLabel} (attempt ${attempt}/${maxAttempts}):`,
          (err as Error).message,
        );
        if (source === 'steam' && attempt < maxAttempts) {
          return { status: 'retry', retryAfterMs: PRICE_FETCH_RETRY_BACKOFF_MS };
        }
        finalizeName(name, null, attempt, null, 'error');
        return { status: 'failed' };
      }
    };

    if (source === 'steam') {
      type RefreshWorkItem = { name: string; attempt: number; readyAt: number };
      const queue: RefreshWorkItem[] = namesToRefresh.map((name) => ({ name, attempt: 1, readyAt: 0 }));
      retryQueueSize = queue.length;
      const maxAttempts = PRICE_FETCH_RETRY_ATTEMPTS;
      const snapshot = await getSteamWorkerPoolSnapshot();
      const effectiveWorkerCap = Math.max(1, Math.min(PRICE_FETCH_CONCURRENCY, snapshot.totalWorkers));
      const workerCount = Math.min(effectiveWorkerCap, namesToRefresh.length);
      if (workerCount < PRICE_FETCH_CONCURRENCY) {
        logger.warn(
          `[Prices] ${source} concurrency reduced ${PRICE_FETCH_CONCURRENCY} -> ${workerCount} (pool ${snapshot.totalWorkers}: ${snapshot.proxyWorkers} proxy, ${snapshot.directWorkers} direct; ready ${snapshot.readyWorkers}, cooling ${snapshot.coolingWorkers}, busy ${snapshot.busyWorkers}).`,
        );
      }

      const popReadyWorkItem = (): { item: RefreshWorkItem | null; waitMs: number } => {
        if (queue.length === 0) {
          return { item: null, waitMs: 0 };
        }

        const now = Date.now();
        let minWaitMs = Number.POSITIVE_INFINITY;
        for (let i = 0; i < queue.length; i++) {
          const item = queue[i];
          if (item.readyAt <= now) {
            queue.splice(i, 1);
            retryQueueSize = queue.length;
            return { item, waitMs: 0 };
          }
          minWaitMs = Math.min(minWaitMs, item.readyAt - now);
        }

        return { item: null, waitMs: Math.max(25, Math.min(200, Math.ceil(minWaitMs))) };
      };

      const requeueWorkItem = (item: RefreshWorkItem, workerLabel: string, retryAfterMs?: number) => {
        const nextAttempt = item.attempt + 1;
        const exponentialDelayMs = PRICE_FETCH_RETRY_BACKOFF_MS * Math.max(1, 2 ** (nextAttempt - 2));
        const retryDelayMs = Math.max(exponentialDelayMs, retryAfterMs ?? 0);
        retryScheduledCount += 1;
        queue.push({
          name: item.name,
          attempt: nextAttempt,
          readyAt: Date.now() + retryDelayMs,
        });
        retryQueueSize = queue.length;
        logger.info(
          `[Prices] ${source} requeued ${item.name} for attempt ${nextAttempt}/${maxAttempts} after ${retryDelayMs}ms (${workerLabel}).`,
        );
      };

      await Promise.all(
        Array.from({ length: workerCount }, async (_, idx) => {
          const workerLabel = `worker-${idx + 1}`;
          while (true) {
            if (task.cancelled) {
              return;
            }

            let item: RefreshWorkItem | null = null;
            try {
              const next = popReadyWorkItem();
              item = next.item;
              if (!item) {
                if (queue.length === 0) {
                  return;
                }
                await sleep(next.waitMs);
                continue;
              }

              if (finalizedNames.has(item.name)) {
                continue;
              }

              const outcome = await fetchOneName(item.name, item.attempt, workerLabel);
              if (outcome.status === 'retry') {
                requeueWorkItem(item, workerLabel, outcome.retryAfterMs);
              }
            } catch (err) {
              workerCrashCount += 1;
              logger.error(
                `[Prices] ${source} ${workerLabel} crashed on ${item?.name ?? 'unknown item'}; switching item to another worker:`,
                (err as Error).message,
              );
              if (item && !finalizedNames.has(item.name)) {
                if (item.attempt < maxAttempts) {
                  requeueWorkItem(item, workerLabel);
                } else {
                  finalizeName(item.name, null, item.attempt, null, 'error');
                }
              }
            }
          }
        }),
      );

      if (task.cancelled) {
        logger.info(`[Prices] ${source} refresh cancelled for ${steamId}`);
        return;
      }
    } else {
      for (const name of namesToRefresh) {
        if (task.cancelled) {
          logger.info(`[Prices] ${source} refresh cancelled for ${steamId}`);
          return;
        }

        await fetchOneName(name, 1, 'worker-1');

        const cooldownAfterRequestMs = getSourceCooldownRemainingMs(source);
        if (cooldownAfterRequestMs > 0) {
          const fetched = priceRefreshProgressBySteamId.get(steamId)?.fetched ?? 0;
          logger.warn(
            `[Prices] ${source} refresh paused by cooldown after ${fetched}/${namesToRefresh.length} items (${Math.ceil(cooldownAfterRequestMs / 1000)}s remaining).`,
          );
          return;
        }
      }
    }

    if (scope === 'missing') {
      logger.info(
        `[Prices] ${source} missing scope summary: resolved ${resolvedNames}, unresolved ${unresolvedNames}, attempted ${namesToRefresh.length}.`,
      );
    }

    logger.info(
      `[Prices] ${source} refresh outcome: ${foundCount} fresh, ${staleKeptCount} stale-kept, ${noPriceCount} no-price, ${retryScheduledCount} retries, ${workerCrashCount} worker crashes.`,
    );

    // Recalculate total value for the selected source only (sticker values
    // included — same basis as the dashboard total the snapshot is compared to)
    const recomputed = computeSourceTotal(rawItems, source);
    totalValue = recomputed.totalValue;
    pricedItems = recomputed.pricedItems;

    const completedAt = new Date();
    markPriceRefreshCompleted(steamId, source, completedAt);
    lastRefresh = completedAt;

    if (pricedItems === 0) {
      logger.warn(
        `[Prices] ${source} refresh produced no priced items for ${steamId}. Keeping previous profile summary/history.`,
      );
      return;
    }

    // Per-source daily snapshot (steam/csfloat/skinport each get their own
    // history line, so the 24h change works for every source).
    const changeInfo = historyService.get24hChange(steamId, totalValue, source);
    if (changeInfo.hasData && changeInfo.yesterdayValue && totalValue < changeInfo.yesterdayValue * 0.2) {
      logger.warn(`[Prices] SKIPPING ${source} SNAPSHOT: value too low compared to yesterday`);
    } else {
      historyService.saveSnapshot(steamId, totalValue, rawItems.length, source);
    }

    if (source !== 'steam') {
      logger.info(
        `[Prices] ${source} refresh complete (scope: ${scope}). Priced items: ${pricedItems}/${rawItems.length}. Total: €${totalValue.toFixed(2)}`,
      );
      return;
    }

    // Profile summary (the profile-card total) stays steam-based.
    updateProfileSummary(steamId, rawItems.length, totalValue);
    lastRefresh = new Date();
    logger.info(`[Prices] ${source} refresh complete (scope: ${scope}). Total: €${totalValue.toFixed(2)}`);
  } finally {
    const currentTask = activePriceRefreshes.get(steamId);
    if (currentTask === task) {
      activePriceRefreshes.delete(steamId);
    }

    const progress = priceRefreshProgressBySteamId.get(steamId);
    if (progress?.taskId === task.id) {
      priceRefreshProgressBySteamId.delete(steamId);
    }
  }
}
