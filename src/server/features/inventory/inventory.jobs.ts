import cron from 'node-cron';

type ScheduledTask = ReturnType<typeof cron.schedule>;
import { refreshPrices } from './inventory.service.ts';
import { getAllProfiles } from '../../db/queries/profiles.ts';
import { cleanupOldData } from '../../db/client.ts';
import { getSetting, setSetting } from '../../db/queries/settings.ts';
import { runBackup, isBackupRunning } from '../backup/backup.service.ts';
import { logger } from '../../lib/logger.ts';

// User-configurable daily price reload (from the Settings page). It only
// re-prices items ALREADY in the DB — no Steam login involved; new items
// require the user to log in and refresh the inventory themselves.
export interface PriceRefreshSchedule {
  enabled: boolean;
  hour: number; // 0-23, server local time
  minute: number; // 0-59
}

const SCHEDULE_KEY = 'price_refresh_schedule';
const DEFAULT_SCHEDULE: PriceRefreshSchedule = { enabled: true, hour: 12, minute: 0 };
// Fixed registry name: node-cron keys its global task map by options.name.
const DAILY_TASK_NAME = 'daily-price-reload';
// node-cron >=4 exposes destroy(), which stops the task AND removes it from the
// global registry — re-saving the schedule N times leaves exactly one task.

let dailyTask: ScheduledTask | null = null;
let dailyRunInProgress = false;

/**
 * True while the daily multi-profile price reload is anywhere in its run —
 * including BETWEEN two profiles, where isPriceRefreshInProgress() is briefly
 * false. Destructive operations (profile delete, backup restore) check this.
 */
export function isDailyRefreshRunning(): boolean {
  return dailyRunInProgress;
}

export function getPriceRefreshSchedule(): PriceRefreshSchedule {
  try {
    const raw = getSetting(SCHEDULE_KEY);
    if (!raw) return DEFAULT_SCHEDULE;
    const parsed = JSON.parse(raw) as Partial<PriceRefreshSchedule>;
    const hour = Number(parsed.hour);
    const minute = Number(parsed.minute);
    return {
      enabled: parsed.enabled !== false,
      hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_SCHEDULE.hour,
      minute: Number.isInteger(minute) && minute >= 0 && minute <= 59 ? minute : DEFAULT_SCHEDULE.minute,
    };
  } catch {
    return DEFAULT_SCHEDULE;
  }
}

export function setPriceRefreshSchedule(schedule: PriceRefreshSchedule): PriceRefreshSchedule {
  setSetting(SCHEDULE_KEY, JSON.stringify(schedule));
  applyPriceRefreshSchedule();
  return getPriceRefreshSchedule();
}

/**
 * Re-price everything already in the DB for every profile (steam + skinport).
 * Returns `started`: false when a run was already in progress and this trigger
 * was skipped. The work itself runs detached in the background.
 */
export function runDailyPriceRefresh(): boolean {
  if (dailyRunInProgress) {
    logger.warn('[Cron] Daily price refresh already running, skipping this trigger');
    return false;
  }
  dailyRunInProgress = true;
  void (async () => {
    try {
      const profiles = getAllProfiles();
      logger.info(`[Cron] Daily price reload starting for ${profiles.length} profile(s)`);
      for (const profile of profiles) {
        if (profile.item_count === 0) continue;
        try {
          await refreshPrices(profile.steam_id, 'steam', 'all');
        } catch (err) {
          logger.error(`[Cron] Daily steam reload failed for ${profile.steam_id}:`, (err as Error).message);
        }
        try {
          // Skinport is a cached bulk lookup — cheap, and keeps its history line daily.
          await refreshPrices(profile.steam_id, 'skinport', 'all');
        } catch (err) {
          logger.error(`[Cron] Daily skinport reload failed for ${profile.steam_id}:`, (err as Error).message);
        }
      }
      logger.info('[Cron] Daily price reload finished');
    } catch (err) {
      logger.error('[Cron] Daily price reload failed:', (err as Error).message);
    } finally {
      dailyRunInProgress = false;
    }
  })();
  return true;
}

export function applyPriceRefreshSchedule() {
  if (dailyTask) {
    dailyTask.destroy();
    dailyTask = null;
  }
  const schedule = getPriceRefreshSchedule();
  if (!schedule.enabled) {
    logger.info('[Cron] Daily price reload disabled');
    return;
  }
  dailyTask = cron.schedule(
    `${schedule.minute} ${schedule.hour} * * *`,
    () => {
      runDailyPriceRefresh();
    },
    { name: DAILY_TASK_NAME },
  );
  const hh = String(schedule.hour).padStart(2, '0');
  const mm = String(schedule.minute).padStart(2, '0');
  logger.info(`[Cron] Daily price reload scheduled at ${hh}:${mm} (server local time)`);
}

// ── Daily automatic backup (anti data-loss) ──
// Independent of the price reload: runs at a fixed hour so the two never overlap
// in practice, and is gated on the `backup_enabled` setting (default ON). The
// backup service itself also guards against concurrent runs.
const BACKUP_ENABLED_KEY = 'backup_enabled';
const BACKUP_TASK_NAME = 'daily-backup';
// 03:00 local — well clear of the default 12:00 price reload.
const BACKUP_HOUR = 3;
const BACKUP_MINUTE = 0;

export function isBackupEnabled(): boolean {
  // Default ON: only an explicit 'false' disables it.
  return getSetting(BACKUP_ENABLED_KEY) !== 'false';
}

export function setBackupEnabled(enabled: boolean): boolean {
  setSetting(BACKUP_ENABLED_KEY, enabled ? 'true' : 'false');
  return isBackupEnabled();
}

export type DailyBackupResult = 'ok' | 'skipped' | 'failed';

/**
 * Run a backup now. 'skipped' when one was already in progress (no overlap),
 * 'failed' when the write threw (disk full…) — distinct so the UI can tell
 * "already running" from an actual failure. Synchronous and quick.
 */
export function runDailyBackup(): DailyBackupResult {
  if (isBackupRunning()) {
    logger.warn('[Cron] Backup already running, skipping this trigger');
    return 'skipped';
  }
  try {
    runBackup();
    return 'ok';
  } catch (err) {
    logger.error('[Cron] Daily backup failed:', (err as Error).message);
    return 'failed';
  }
}

let backupTask: ScheduledTask | null = null;

function applyBackupSchedule() {
  if (backupTask) {
    backupTask.destroy();
    backupTask = null;
  }
  backupTask = cron.schedule(
    `${BACKUP_MINUTE} ${BACKUP_HOUR} * * *`,
    () => {
      if (!isBackupEnabled()) return;
      runDailyBackup();
    },
    { name: BACKUP_TASK_NAME },
  );
  const hh = String(BACKUP_HOUR).padStart(2, '0');
  const mm = String(BACKUP_MINUTE).padStart(2, '0');
  logger.info(`[Cron] Daily backup scheduled at ${hh}:${mm} (server local time)`);
}

export function setupCronJobs(cleanupIntervalMinutes: number) {
  // Housekeeping only — the price refresh itself runs on the user-configured
  // daily schedule below (it used to run every N minutes).
  const interval = Math.max(10, cleanupIntervalMinutes);
  cron.schedule(`*/${interval} * * * *`, () => {
    try {
      cleanupOldData();
    } catch (err) {
      logger.warn('[Cron] cleanup failed:', (err as Error).message);
    }
  });

  applyPriceRefreshSchedule();
  applyBackupSchedule();
}
