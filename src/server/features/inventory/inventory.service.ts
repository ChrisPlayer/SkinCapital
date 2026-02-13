import { getAllInventory } from '../steam/steam.inventory.ts';
import { steamClient } from '../steam/steam.client.ts';
import { initialize as initSchema } from '../steam/steam.schema.ts';
import { getCachedPrices, getPrices } from '../pricing/pricing.service.ts';
import * as historyService from '../history/history.service.ts';
import { insertItemsBatch, clearItemsByProfile, getItemsByProfile } from '../../db/queries/items.ts';
import { updateProfileSummary } from '../../db/queries/profiles.ts';
import { getAllLatestPrices, getAllPreviousPrices, getLatestPriceWindow } from '../../db/queries/prices.ts';
import { getItemRarity } from '../../../shared/constants/rarity.ts';
import { getWearLevel } from '../../../shared/constants/wear.ts';
import { logger } from '../../lib/logger.ts';
import type { ItemGroup, StorageUnit, Sticker } from '../../../shared/types/inventory.ts';
import type { DashboardData, DailyHistoryEntry } from '../../../shared/types/api.ts';

let lastRefresh: Date | null = null;
let isRefreshing = false;

const STEAM_CDN = 'https://community.akamai.steamstatic.com/economy/image/';

export function getLastRefresh() {
  return lastRefresh;
}

export function isRefreshInProgress() {
  return isRefreshing;
}

export async function refresh(steamId: string) {
  if (isRefreshing) {
    logger.info('[Inventory] Refresh already in progress, skipping');
    return { skipped: true };
  }

  isRefreshing = true;
  const startTime = Date.now();

  try {
    logger.info(`[Inventory] Starting full refresh for ${steamId}...`);
    await initSchema();

    const items = await getAllInventory();

    clearItemsByProfile(steamId);
    insertItemsBatch(items, steamId);

    const uniqueNames = [...new Set(items.map((i) => i.marketHashName))];
    logger.info(`[Inventory] Fetching prices for ${uniqueNames.length} unique items...`);

    let totalValue = 0;
    for (const name of uniqueNames) {
      try {
        const prices = await getPrices(name);
        const itemCount = items.filter((i) => i.marketHashName === name).length;
        if (prices.average) {
          totalValue += prices.average * itemCount;
        }
      } catch (err) {
        logger.error(`[Inventory] Price fetch error for ${name}:`, (err as Error).message);
      }
    }

    const changeInfo = historyService.get24hChange(steamId, totalValue);

    if (changeInfo.hasData && changeInfo.yesterdayValue && totalValue < changeInfo.yesterdayValue * 0.2) {
      logger.warn(`[History] SKIPPING SNAPSHOT: Calculated value \u20ac${totalValue.toFixed(2)} is suspiciously low compared to yesterday (\u20ac${changeInfo.yesterdayValue.toFixed(2)}). Preserving history.`);
    } else {
      historyService.saveSnapshot(steamId, totalValue, items.length);
    }

    updateProfileSummary(steamId, items.length, totalValue);

    // Auto-disconnect Steam after inventory refresh
    steamClient.logout();
    logger.info('[Inventory] Steam session disconnected after refresh');

    lastRefresh = new Date();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`[Inventory] Refresh complete in ${duration}s. Total value: \u20ac${totalValue.toFixed(2)}`);

    return { success: true, itemCount: items.length, totalValue, duration: parseFloat(duration) };
  } catch (err) {
    logger.error('[Inventory] Refresh failed:', err);
    return { success: false, error: (err as Error).message };
  } finally {
    isRefreshing = false;
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
    const rarity = getItemRarity(name);
    const floatVal = data.items[0]?.floatValue ?? null;
    const wear = getWearLevel(floatVal);

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

export async function fetchMissingPrices(steamId: string) {
  const rawItems = getItemsByProfile(steamId);
  if (rawItems.length === 0) {
    logger.info('[Inventory] No items in DB for this profile, skipping missing price check');
    return;
  }

  const uniqueNames = [...new Set(rawItems.map((i) => i.marketHashName))];
  const latestPrices = getAllLatestPrices();
  const priceMap = new Map(latestPrices.map((p) => [p.market_hash_name, p.price_eur]));

  const missingNames = uniqueNames.filter((name) => !priceMap.has(name) || priceMap.get(name) === null);

  if (missingNames.length === 0) {
    logger.info('[Inventory] All items have prices, nothing to fetch');
    return;
  }

  logger.info(`[Inventory] Found ${missingNames.length} items without prices, fetching...`);

  let totalValue = 0;
  for (const name of missingNames) {
    try {
      await getPrices(name);
    } catch (err) {
      logger.error(`[Inventory] Missing price fetch error for ${name}:`, (err as Error).message);
    }
  }

  // Recalculate total value with all prices
  const updatedPrices = getAllLatestPrices();
  const updatedPriceMap = new Map(updatedPrices.map((p) => [p.market_hash_name, p.price_eur]));
  for (const item of rawItems) {
    const price = updatedPriceMap.get(item.marketHashName);
    if (price) totalValue += price;
  }

  updateProfileSummary(steamId, rawItems.length, totalValue);
  logger.info(`[Inventory] Missing prices fetched. Updated total: €${totalValue.toFixed(2)}`);
}

export function getDashboardData(steamId: string, days: number = 30): DashboardData {
  const rawItems = getItemsByProfile(steamId);

  // Build price map from all latest prices
  const latestPrices = getAllLatestPrices();
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
          priceMap.set(s.name, cached.average);
        }
      }
    }
  }

  // Previous prices for change detection
  const previousPriceMap = getAllPreviousPrices();

  // All items grouped
  const allGrouped = groupItems(rawItems, priceMap, previousPriceMap);
  const totalValue = allGrouped.reduce((sum, g) => sum + g.total, 0);

  // Main inventory
  const mainRaw = rawItems.filter((i) => !i.casketId);
  const mainGrouped = groupItems(mainRaw, priceMap, previousPriceMap);
  const mainTotal = mainGrouped.reduce((sum, g) => sum + g.total, 0);

  // Storage units
  const casketIds = [...new Set(rawItems.map((i) => i.casketId).filter(Boolean))] as string[];
  const storageUnits: StorageUnit[] = [];

  for (const casketId of casketIds) {
    const casketItems = rawItems.filter((i) => i.casketId === casketId);
    const casketGrouped = groupItems(casketItems, priceMap, previousPriceMap);
    const casketTotal = casketGrouped.reduce((sum, g) => sum + g.total, 0);

    // Find the storage unit item itself to get its image
    const casketItem = rawItems.find((i) => i.assetId === casketId);
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
  const priceWindow = getLatestPriceWindow();

  return {
    items: allGrouped,
    mainInventory: { items: mainGrouped, total: mainTotal, count: mainRaw.length },
    storageUnits,
    totalItems: rawItems.length,
    uniqueItems: allGrouped.length,
    totalValue,
    change24h,
    historyData,
    dailyHistory,
    priceWindow,
  };
}

export async function refreshPrices(steamId: string) {
  const rawItems = getItemsByProfile(steamId);
  if (rawItems.length === 0) {
    logger.info('[Prices] No items in DB for this profile, skipping price refresh');
    return;
  }

  const uniqueNames = [...new Set(rawItems.map((i) => i.marketHashName))];
  logger.info(`[Prices] Refreshing prices for ${uniqueNames.length} unique items...`);

  let totalValue = 0;
  for (const name of uniqueNames) {
    try {
      await getPrices(name, true);
    } catch (err) {
      logger.error(`[Prices] Price fetch error for ${name}:`, (err as Error).message);
    }
  }

  // Recalculate total value
  const updatedPrices = getAllLatestPrices();
  const updatedPriceMap = new Map(updatedPrices.map((p) => [p.market_hash_name, p.price_eur]));
  for (const item of rawItems) {
    const price = updatedPriceMap.get(item.marketHashName);
    if (price) totalValue += price;
  }

  const changeInfo = historyService.get24hChange(steamId, totalValue);

  if (changeInfo.hasData && changeInfo.yesterdayValue && totalValue < changeInfo.yesterdayValue * 0.2) {
    logger.warn(`[Prices] SKIPPING SNAPSHOT: value too low compared to yesterday`);
  } else {
    historyService.saveSnapshot(steamId, totalValue, rawItems.length);
  }

  updateProfileSummary(steamId, rawItems.length, totalValue);
  lastRefresh = new Date();
  logger.info(`[Prices] Price refresh complete. Total: €${totalValue.toFixed(2)}`);
}
