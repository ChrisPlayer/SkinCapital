import { getAllInventory } from '../steam/steam.inventory.ts';
import { steamClient } from '../steam/steam.client.ts';
import { initialize as initSchema } from '../steam/steam.schema.ts';
import {
  getCachedPrices,
  getPrices,
  getSourceCooldownRemainingMs,
  type PriceSource,
} from '../pricing/pricing.service.ts';
import * as historyService from '../history/history.service.ts';
import { insertItemsBatch, clearItemsByProfile, getItemsByProfile } from '../../db/queries/items.ts';
import { updateProfileSummary } from '../../db/queries/profiles.ts';
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
import type { DashboardData, DailyHistoryEntry } from '../../../shared/types/api.ts';
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
const lastPriceRefreshBySteamId = new Map<string, { steam: Date | null; csfloat: Date | null }>();
const missingPriceChecksByProfileSource = new Map<string, Map<string, number>>();
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

function markPriceRefreshCompleted(steamId: string, source: PriceSource, at: Date) {
  const current = lastPriceRefreshBySteamId.get(steamId) ?? { steam: null, csfloat: null };
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

export function getLastRefresh(steamId?: string, source?: PriceSource) {
  if (steamId) {
    if (source) {
      const bySource = lastPriceRefreshBySteamId.get(steamId)?.[source] ?? null;
      if (bySource) return bySource;
      if (source === 'csfloat') return null;
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

export async function refresh(steamId: string) {
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

    clearItemsByProfile(steamId);
    insertItemsBatch(items, steamId);

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
    for (const name of uniqueNames) {
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
    }

    const changeInfo = historyService.get24hChange(steamId, totalValue);

    if (changeInfo.hasData && changeInfo.yesterdayValue && totalValue < changeInfo.yesterdayValue * 0.2) {
      logger.warn(`[History] SKIPPING SNAPSHOT: Calculated value \u20ac${totalValue.toFixed(2)} is suspiciously low compared to yesterday (\u20ac${changeInfo.yesterdayValue.toFixed(2)}). Preserving history.`);
    } else {
      historyService.saveSnapshot(steamId, totalValue, items.length);
    }

    updateProfileSummary(steamId, items.length, totalValue);

    const completedAt = new Date();
    lastInventoryRefreshBySteamId.set(steamId, completedAt);
    lastRefresh = completedAt;
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`[Inventory] Refresh complete in ${duration}s. Total value: \u20ac${totalValue.toFixed(2)}`);

    return { success: true, itemCount: items.length, totalValue, duration: parseFloat(duration) };
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
    });
  }

  result.sort((a, b) => b.total - a.total);
  return result;
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
          priceMap.set(s.name, priceSource === 'csfloat' ? cached.csfloat : cached.steam);
        }
      }
    }
  }

  // Previous prices for change detection
  const previousPriceMap = getAllPreviousPricesBySource(priceSource);

  // All items grouped
  const allGrouped = groupItems(rawItems, priceMap, previousPriceMap);
  const totalValue = allGrouped.reduce((sum, g) => sum + g.total, 0);
  const missingPrices = allGrouped.reduce(
    (acc, group) => {
      if (group.price === null) {
        acc.uniqueCount += 1;
        acc.itemCount += group.quantity;
      }
      return acc;
    },
    { itemCount: 0, uniqueCount: 0 },
  );

  // Main inventory
  const mainRaw = rawItems.filter((i) => !i.casketId);
  const mainGrouped = groupItems(mainRaw, priceMap, previousPriceMap);
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

  // History
  const historyData = historyService.getHistory(steamId, days);
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

  const change24h = historyService.get24hChange(steamId, totalValue);
  const priceWindow = getLatestPriceWindowBySource(priceSource);

  return {
    items: allGrouped,
    mainInventory: { items: mainGrouped, total: mainTotal, count: mainRaw.length },
    storageUnits,
    emptyStorageUnits: storageSummary?.emptyUnits ?? 0,
    totalItems: rawItems.length,
    uniqueItems: allGrouped.length,
    totalValue,
    missingPrices,
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

    if (namesToRefresh.length === 0) {
      const completedAt = new Date();
      markPriceRefreshCompleted(steamId, source, completedAt);
      lastRefresh = completedAt;
      logger.info(`[Prices] ${source} refresh skipped: no items match scope ${scope} for ${steamId}`);
      return;
    }

    const initialCooldownMs = getSourceCooldownRemainingMs(source);
    if (initialCooldownMs > 0) {
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
    for (const name of namesToRefresh) {
      if (task.cancelled) {
        logger.info(`[Prices] ${source} refresh cancelled for ${steamId}`);
        return;
      }

      let fetchedSourcePrice: number | null = null;
      try {
        const prices = await getPrices(name, false, source);
        fetchedSourcePrice = source === 'csfloat' ? prices.csfloat : prices.steam;
      } catch (err) {
        logger.error(`[Prices] ${source} price fetch error for ${name}:`, (err as Error).message);
      } finally {
        const progress = priceRefreshProgressBySteamId.get(steamId);
        if (progress && progress.taskId === task.id) {
          priceRefreshProgressBySteamId.set(steamId, {
            taskId: progress.taskId,
            fetched: progress.fetched + 1,
            total: progress.total,
            source,
          });
        }
      }

      const cooldownAfterRequestMs = getSourceCooldownRemainingMs(source);
      if (cooldownAfterRequestMs > 0) {
        const fetched = priceRefreshProgressBySteamId.get(steamId)?.fetched ?? 0;
        logger.warn(
          `[Prices] ${source} refresh paused by cooldown after ${fetched}/${namesToRefresh.length} items (${Math.ceil(cooldownAfterRequestMs / 1000)}s remaining).`,
        );
        return;
      }

      processedCount += 1;
      if (fetchedSourcePrice !== null) {
        foundCount += 1;
        logger.info(
          `[Prices] ${source} price found: ${name} = \u20ac${fetchedSourcePrice.toFixed(2)}`,
        );
      } else {
        logger.debug(`[Prices] No ${source} price for: ${name}`);
      }

      if (processedCount % 25 === 0 || processedCount === namesToRefresh.length) {
        logger.info(`[Prices] Progress: ${processedCount}/${namesToRefresh.length} processed, ${foundCount} prices found`);
      }

      if (scope === 'missing') {
        const now = Date.now();
        if (fetchedSourcePrice === null) {
          markMissingPriceChecked(steamId, source, name, now);
          unresolvedNames += 1;
        } else {
          clearMissingPriceChecked(steamId, source, name);
          resolvedNames += 1;
        }
      }
    }

    if (scope === 'missing') {
      logger.info(
        `[Prices] ${source} missing scope summary: resolved ${resolvedNames}, unresolved ${unresolvedNames}, attempted ${namesToRefresh.length}.`,
      );
    }

    // Recalculate total value for the selected source only
    const updatedPrices = getAllLatestPricesBySource(source);
    const updatedPriceMap = new Map(updatedPrices.map((p) => [p.market_hash_name, p.price_eur]));
    for (const item of rawItems) {
      const price = updatedPriceMap.get(item.marketHashName);
      if (price !== null && price !== undefined) {
        totalValue += price;
        pricedItems += 1;
      }
    }

    const completedAt = new Date();
    markPriceRefreshCompleted(steamId, source, completedAt);
    lastRefresh = completedAt;

    if (pricedItems === 0) {
      logger.warn(
        `[Prices] ${source} refresh produced no priced items for ${steamId}. Keeping previous profile summary/history.`,
      );
      return;
    }

    if (source !== 'steam') {
      logger.info(
        `[Prices] ${source} refresh complete (scope: ${scope}). Priced items: ${pricedItems}/${rawItems.length}. Total: €${totalValue.toFixed(2)}`,
      );
      return;
    }

    const changeInfo = historyService.get24hChange(steamId, totalValue);

    if (changeInfo.hasData && changeInfo.yesterdayValue && totalValue < changeInfo.yesterdayValue * 0.2) {
      logger.warn(`[Prices] SKIPPING SNAPSHOT: value too low compared to yesterday`);
    } else {
      historyService.saveSnapshot(steamId, totalValue, rawItems.length);
    }

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
