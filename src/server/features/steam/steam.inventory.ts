import { steamClient } from './steam.client.ts';
import { resolveItem } from './steam.schema.ts';
import { logger } from '../../lib/logger.ts';
import type { InsertItem } from '../../db/queries/items.ts';
import type SteamCommunity from 'steamcommunity';

const iconCache = new Map<string, string>();

interface CasketInfo {
  casketId: string;
  name: string;
  itemCount: number;
}

export interface StorageUnitFetchSummary {
  totalUnits: number;
  nonEmptyUnits: number;
  emptyUnits: number;
  loadedUnits: number;
}

export interface StorageUnitItemsResult {
  items: InsertItem[];
  summary: StorageUnitFetchSummary;
}

export interface InventoryFetchResult {
  items: InsertItem[];
  storageSummary: StorageUnitFetchSummary;
}

interface GCInventoryItem {
  id?: string | number;
  casket_id?: string | number;
  def_index?: number;
  custom_name?: string;
  casket_contained_item_count?: number;
}

function extractStorageUnitsFromInventory(inventory: GCInventoryItem[] | undefined): CasketInfo[] {
  if (!inventory || inventory.length === 0) {
    return [];
  }

  const caskets: CasketInfo[] = [];
  for (const item of inventory) {
    if (item.def_index === 1201) {
      caskets.push({
        casketId: String(item.id),
        name: item.custom_name || 'Storage Unit',
        itemCount: item.casket_contained_item_count || 0,
      });
    }
  }

  return caskets;
}

export async function getStorageUnits(): Promise<CasketInfo[]> {
  const csgoClient = steamClient.csgoClient;
  if (!csgoClient) return [];

  if (!steamClient.isConnectedToGC) {
    logger.info('[Inventory] Not connected to GC, waiting...');
    const connected = await steamClient.waitForGC(5000);
    if (!connected) {
      logger.warn('[Inventory] GC connection timeout. Skipping Storage Units refresh.');
      return [];
    }
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Storage Units request timeout')), 30000);

    try {
      const resolveFromInventory = (attempt = 0) => {
        const inventory = csgoClient.inventory as GCInventoryItem[] | undefined;
        if ((inventory && inventory.length > 0) || attempt >= 6) {
          const caskets = extractStorageUnitsFromInventory(inventory);
          logger.info(`[Inventory] Found ${caskets.length} Storage Units`);
          resolve(caskets);
          return;
        }

        // GC can deliver profile callback slightly before inventory cache is populated.
        setTimeout(() => resolveFromInventory(attempt + 1), 400);
      };

      csgoClient.requestPlayersProfile(
        steamClient.steamUser!.steamID!,
        (...args: unknown[]) => {
          clearTimeout(timeout);

          // Some globaloffensive versions send (profile) instead of (err, profile).
          const firstArg = args[0];
          if (firstArg instanceof Error) {
            reject(firstArg);
            return;
          }

          resolveFromInventory();
        },
      );
    } catch (err) {
      clearTimeout(timeout);
      reject(err);
    }
  });
}

export async function loadStorageUnit(casketId: string): Promise<InsertItem[]> {
  const csgoClient = steamClient.csgoClient;
  if (!csgoClient) throw new Error('GC not connected');

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      logger.warn(`[Inventory] Casket ${casketId} load timeout, skipping`);
      reject(new Error('Timeout'));
    }, 30000);

    try {
      csgoClient.getCasketContents(casketId, (err: Error | null, items: unknown[]) => {
        clearTimeout(timeout);
        if (err) {
          logger.error(`[Inventory] Error loading casket ${casketId}:`, err);
          reject(err);
          return;
        }

        const parsedItems: InsertItem[] = (items as Array<{ id?: string | number; [key: string]: unknown }>).map((item) => {
          const resolved = resolveItem(item as Parameters<typeof resolveItem>[0]);
          return {
            marketHashName: resolved.marketHashName,
            assetId: item.id?.toString() ?? null,
            casketId,
            casketName: null,
            floatValue: resolved.floatValue,
            paintSeed: resolved.paintSeed,
            stickers: resolved.stickers,
            iconUrl: iconCache.get(resolved.marketHashName) || null,
            schemaImage: resolved.imageUrl || null,
          };
        });

        logger.info(`[Inventory] Loaded ${parsedItems.length} items from casket ${casketId}`);
        resolve(parsedItems);
      });
    } catch (err) {
      clearTimeout(timeout);
      reject(err);
    }
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getAllStorageUnitItems(): Promise<StorageUnitItemsResult> {
  const caskets = await getStorageUnits();
  const allItems: InsertItem[] = [];
  let loadedUnits = 0;

  const nonEmpty = caskets.filter((c) => c.itemCount > 0);
  const skipped = caskets.length - nonEmpty.length;
  if (skipped > 0) logger.info(`[Inventory] Skipping ${skipped} empty Storage Units`);
  logger.info(`[Inventory] Loading ${nonEmpty.length} non-empty Storage Units...`);

  for (const casket of nonEmpty) {
    let retries = 3;
    let loaded = false;

    while (retries > 0 && !loaded) {
      await sleep(1500);

      try {
        const items = await loadStorageUnit(casket.casketId);
        items.forEach((i) => (i.casketName = casket.name));
        allItems.push(...items);
        loadedUnits++;
        loaded = true;
      } catch (err) {
        logger.error(`[Inventory] Failed to load casket ${casket.casketId} (Attempt ${4 - retries}/3):`, (err as Error).message);
        retries--;
        if (retries > 0) {
          logger.info(`[Inventory] Retrying casket ${casket.casketId} in 5 seconds...`);
          await sleep(5000);
        } else {
          logger.error(`[Inventory] Casket ${casket.casketId} failed after 3 attempts. Skipping.`);
        }
      }
    }
  }

  logger.info(`[Inventory] Total items from Storage Units: ${allItems.length}`);
  return {
    items: allItems,
    summary: {
      totalUnits: caskets.length,
      nonEmptyUnits: nonEmpty.length,
      emptyUnits: skipped,
      loadedUnits,
    },
  };
}

export async function getMainInventory(): Promise<InsertItem[]> {
  const community = steamClient.community as SteamCommunity | null;
  const steamId = steamClient.steamUser?.steamID;

  if (!steamId || !community) {
    logger.warn('[Inventory] No Steam ID available for main inventory');
    return [];
  }

  return new Promise((resolve) => {
    community.getUserInventoryContents(steamId, 730, 2, true, (err: Error | null, inventory: Array<{ market_hash_name: string; assetid: string; icon_url: string }>) => {
      if (err) {
        logger.error('[Inventory] Main inventory error:', err.message);
        resolve([]);
        return;
      }

      const items: InsertItem[] = inventory.map((item) => {
        if (item.icon_url) {
          iconCache.set(item.market_hash_name, item.icon_url);
        }
        return {
          marketHashName: item.market_hash_name,
          assetId: item.assetid,
          casketId: null,
          casketName: null,
          floatValue: null,
          paintSeed: null,
          iconUrl: item.icon_url || null,
          stickers: null,
          schemaImage: null,
        };
      });

      logger.info(`[Inventory] Main inventory: ${items.length} items (${iconCache.size} icons cached)`);
      resolve(items);
    });
  });
}

export async function getAllInventory(): Promise<InventoryFetchResult> {
  const mainItems = await getMainInventory();
  const storageResult = await getAllStorageUnitItems();
  const storageItems = storageResult.items;

  for (const item of storageItems) {
    if (!item.iconUrl && iconCache.has(item.marketHashName)) {
      item.iconUrl = iconCache.get(item.marketHashName)!;
    }
  }

  const allItems: InsertItem[] = [...storageItems];
  const existingAssetIds = new Set(storageItems.map((i) => i.assetId).filter(Boolean));

  for (const item of mainItems) {
    if (!item.assetId || !existingAssetIds.has(item.assetId)) {
      allItems.push(item);
    }
  }

  return {
    items: allItems,
    storageSummary: storageResult.summary,
  };
}
