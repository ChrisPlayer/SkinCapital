import * as historyQueries from '../../db/queries/history.ts';
import { getOldAveragePrice } from '../../db/queries/prices.ts';
import { isAllProfiles } from '../../../shared/constants/profiles.ts';
import { logger } from '../../lib/logger.ts';
import type { ChangeInfo, HistoryPoint } from '../../../shared/types/api.ts';

export function saveSnapshot(steamId: string, totalValue: number, itemCount: number, source = 'steam') {
  // The aggregate is computed on the fly from per-profile rows — persisting it
  // would double-count every SUM. Hard guard, not a caller convention.
  if (isAllProfiles(steamId)) return;
  try {
    historyQueries.saveSnapshot(steamId, totalValue, itemCount, source);
    logger.info(`[History] Saved ${source} snapshot for ${steamId}: \u20ac${totalValue.toFixed(2)}, ${itemCount} items`);
  } catch (err) {
    logger.error('[History] Failed to save snapshot:', (err as Error).message);
  }
}

export function getHistory(steamId: string, days: number = 30, source = 'steam'): HistoryPoint[] {
  try {
    const records = isAllProfiles(steamId)
      ? historyQueries.getAggregatedHistory(days, source)
      : historyQueries.getHistory(steamId, days, source);
    return records.map((r) => ({
      date: r.timestamp,
      value: r.total_value,
      itemCount: r.item_count,
    }));
  } catch (err) {
    logger.error('[History] Failed to get history:', (err as Error).message);
    return [];
  }
}

export function get24hChange(steamId: string, currentValue: number, source = 'steam'): ChangeInfo {
  try {
    const yesterday = isAllProfiles(steamId)
      ? historyQueries.getAggregatedYesterdayValue(source)
      : historyQueries.getYesterdayValue(steamId, source);

    if (!yesterday) {
      return { change: 0, percentage: 0, hasData: false };
    }

    const change = currentValue - yesterday.total_value;
    const percentage =
      yesterday.total_value > 0 ? (change / yesterday.total_value) * 100 : 0;

    return {
      change,
      percentage,
      hasData: true,
      yesterdayValue: yesterday.total_value,
    };
  } catch (err) {
    logger.error('[History] Failed to calculate 24h change:', (err as Error).message);
    return { change: 0, percentage: 0, hasData: false };
  }
}

export function getItem24hChange(
  marketHashName: string,
  currentPrice: number,
  source = 'steam',
): ChangeInfo {
  try {
    const oldPrice = getOldAveragePrice(marketHashName, source);

    if (oldPrice !== null && oldPrice > 0) {
      const change = currentPrice - oldPrice;
      const percentage = (change / oldPrice) * 100;
      return { change, percentage, hasData: true };
    }

    return { change: 0, percentage: 0, hasData: false };
  } catch (err) {
    logger.error(`[History] Failed to get item 24h change for ${marketHashName}:`, (err as Error).message);
    return { change: 0, percentage: 0, hasData: false };
  }
}
