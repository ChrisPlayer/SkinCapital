import cron from 'node-cron';
import { refreshPrices } from './inventory.service.ts';
import { getAllProfiles } from '../../db/queries/profiles.ts';
import { logger } from '../../lib/logger.ts';

export function setupCronJobs(intervalMinutes: number) {
  const schedule = `*/${intervalMinutes} * * * *`;

  cron.schedule(schedule, async () => {
    const profiles = getAllProfiles();
    if (profiles.length === 0) return;

    for (const profile of profiles) {
      if (profile.item_count === 0) continue;

      logger.info(`[Cron] Scheduled price refresh for ${profile.steam_id}`);
      try {
        await refreshPrices(profile.steam_id);
      } catch (err) {
        logger.error(`[Cron] Price refresh failed for ${profile.steam_id}:`, (err as Error).message);
      }
    }
  });

  logger.info(`[Server] Auto price refresh scheduled every ${intervalMinutes} minutes`);
}
