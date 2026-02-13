import cron from 'node-cron';
import { refresh } from './inventory.service.ts';
import { steamClient } from '../steam/steam.client.ts';
import { logger } from '../../lib/logger.ts';

export function setupCronJobs(intervalMinutes: number) {
  const schedule = `*/${intervalMinutes} * * * *`;

  cron.schedule(schedule, async () => {
    if (!steamClient.isLoggedIn) return;

    const steamId = steamClient.steamUser?.steamID?.getSteamID64();
    if (!steamId) return;

    logger.info(`[Cron] Scheduled refresh triggered for ${steamId}`);
    try {
      await refresh(steamId);
    } catch (err) {
      logger.error('[Cron] Refresh failed:', (err as Error).message);
    }
  });

  logger.info(`[Server] Auto-refresh scheduled every ${intervalMinutes} minutes`);
}
