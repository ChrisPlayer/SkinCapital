import cron from 'node-cron';
import { refreshPrices } from './inventory.service.ts';
import { getAllProfiles } from '../../db/queries/profiles.ts';
import { logger } from '../../lib/logger.ts';

const PRICE_STALE_HOURS = parseInt(process.env.PRICE_STALE_HOURS || '20', 10);

function shouldRefreshPrices(lastRefresh: string | null): boolean {
  if (!lastRefresh) return true;
  const refreshedAt = new Date(lastRefresh + (lastRefresh.includes('Z') ? '' : 'Z'));
  if (Number.isNaN(refreshedAt.getTime())) return true;
  const ageHours = (Date.now() - refreshedAt.getTime()) / (1000 * 60 * 60);
  return ageHours >= PRICE_STALE_HOURS;
}

export function setupCronJobs(intervalMinutes: number) {
  const schedule = `*/${intervalMinutes} * * * *`;

  cron.schedule(schedule, async () => {
    const profiles = getAllProfiles();
    if (profiles.length === 0) return;

    for (const profile of profiles) {
      if (profile.item_count === 0) continue;
      if (!shouldRefreshPrices(profile.last_refresh)) continue;

      logger.info(`[Cron] Scheduled price refresh for ${profile.steam_id}`);
      try {
        await refreshPrices(profile.steam_id, 'steam');
      } catch (err) {
        logger.error(`[Cron] Price refresh failed for ${profile.steam_id}:`, (err as Error).message);
      }
    }
  });

  logger.info(`[Server] Auto price refresh scheduled every ${intervalMinutes} minutes`);
}
