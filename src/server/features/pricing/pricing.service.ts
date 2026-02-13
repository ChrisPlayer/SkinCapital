import axios from 'axios';
import { steamQueue } from './pricing.queue.ts';
import { insertPrice, getCachedPriceRows } from '../../db/queries/prices.ts';
import { logger } from '../../lib/logger.ts';
import type { Price } from '../../../shared/types/inventory.ts';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseSteamPrice(priceStr: string): number {
  let cleaned = priceStr
    .replace(/[€$£]/g, '')
    .replace(/\s/g, '')
    .trim();

  if (cleaned.includes(',') && cleaned.includes('.')) {
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      cleaned = cleaned.replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  }

  return parseFloat(cleaned) || 0;
}

async function getSteamMarketPrice(marketHashName: string): Promise<number | null> {
  return steamQueue.add(async () => {
    try {
      const url = `https://steamcommunity.com/market/priceoverview/?appid=730&market_hash_name=${encodeURIComponent(marketHashName)}&currency=3`;

      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (response.data?.success && response.data?.lowest_price) {
        const price = parseSteamPrice(response.data.lowest_price);
        logger.debug(`[Price] Steam: ${marketHashName} = \u20ac${price.toFixed(2)}`);
        return price;
      }

      return null;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number }; message?: string };
      if (axiosErr.response?.status === 429) {
        logger.warn('[Price] Steam rate limited, waiting 60s...');
        await sleep(60000);
        return null;
      }
      if (axiosErr.response?.status !== 500) {
        logger.error(`[Price] Steam error for ${marketHashName}:`, axiosErr.message);
      }
      return null;
    }
  }) as Promise<number | null>;
}

export function getCachedPrices(marketHashName: string): Price {
  const prices: Price = { steam: null, average: null, timestamp: null };

  const rows = getCachedPriceRows(marketHashName);
  for (const row of rows) {
    if (row.source === 'steam' && prices.steam === null) {
      prices.steam = row.price_eur;
      prices.timestamp = row.timestamp;
    }
  }

  prices.average = prices.steam;
  return prices;
}

export async function getPrices(marketHashName: string, force = false): Promise<Price> {
  const cached = getCachedPrices(marketHashName);

  if (!force && cached.average && cached.timestamp) {
    let cacheTime: Date;
    try {
      cacheTime = new Date(cached.timestamp + (cached.timestamp.includes('Z') ? '' : 'Z'));
    } catch {
      cacheTime = new Date();
    }

    const ageHours = (Date.now() - cacheTime.getTime()) / (1000 * 60 * 60);
    if (ageHours < 20) {
      return cached;
    }
    logger.debug(`[Price] Cache stale for ${marketHashName} (${ageHours.toFixed(1)}h old). Refreshing...`);
  }

  const steamPrice = await getSteamMarketPrice(marketHashName);

  if (steamPrice !== null) {
    insertPrice(marketHashName, 'steam', steamPrice);
    return { steam: steamPrice, average: steamPrice, timestamp: null };
  }

  if (cached.average) {
    logger.warn(`[Price] Refresh failed for ${marketHashName}, using stale cache.`);
    return cached;
  }

  return { steam: null, average: null, timestamp: null };
}

export async function getStickerPrices(
  stickers: Array<{ name: string }>,
): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  if (!stickers || stickers.length === 0) return prices;

  for (const sticker of stickers) {
    if (sticker.name && !prices[sticker.name]) {
      const p = await getPrices(sticker.name);
      if (p.average) {
        prices[sticker.name] = p.average;
      }
    }
  }
  return prices;
}
