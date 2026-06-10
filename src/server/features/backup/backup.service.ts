import fs from 'fs';
import path from 'path';
import { getSqlite } from '../../db/client.ts';
import { logger } from '../../lib/logger.ts';

// Anti data-loss: a timestamped JSON dump of the user-meaningful tables. The
// full prices time-series is deliberately excluded (too big); only the LATEST
// price per (name, source) is kept so a restore still has something to show
// until the next refresh. We keep the last N files and prune the rest.
const BACKUP_DIR = path.join(process.cwd(), 'data', 'backups');
const MAX_BACKUPS = 14;
const FILE_PREFIX = 'backup-';
const FILE_SUFFIX = '.json';

export interface BackupResult {
  file: string;
  sizeBytes: number;
  when: string;
}

export interface BackupFileInfo {
  file: string;
  when: string;
  sizeBytes: number;
}

let backupInProgress = false;

/** True while a backup is being written (used to reject concurrent triggers). */
export function isBackupRunning(): boolean {
  return backupInProgress;
}

// Only files we wrote (strict prefix/suffix) are ever enumerated or served, so a
// stray file in data/backups can't be picked up and there is no user-controlled
// path anywhere.
function listBackupFiles(): string[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith(FILE_PREFIX) && f.endsWith(FILE_SUFFIX))
    .sort(); // timestamp in the name sorts chronologically (oldest first)
}

/** Newest backup file metadata, or null when none exist. */
export function getLatestBackup(): BackupFileInfo | null {
  const files = listBackupFiles();
  if (files.length === 0) return null;
  const newest = files[files.length - 1];
  const full = path.join(BACKUP_DIR, newest);
  try {
    const stat = fs.statSync(full);
    return { file: newest, when: stat.mtime.toISOString(), sizeBytes: stat.size };
  } catch {
    return null;
  }
}

/** Absolute path of the newest backup, or null. No user input is involved. */
export function getLatestBackupPath(): string | null {
  const files = listBackupFiles();
  if (files.length === 0) return null;
  return path.join(BACKUP_DIR, files[files.length - 1]);
}

export function getBackupCount(): number {
  return listBackupFiles().length;
}

function pruneOldBackups(): void {
  const files = listBackupFiles();
  if (files.length <= MAX_BACKUPS) return;
  const toDelete = files.slice(0, files.length - MAX_BACKUPS);
  for (const f of toDelete) {
    try {
      fs.unlinkSync(path.join(BACKUP_DIR, f));
    } catch (err) {
      logger.warn('[Backup] Failed to prune old backup:', (err as Error).message);
    }
  }
}

/**
 * Export the user-meaningful tables to a timestamped JSON file. Excludes the
 * full prices history; keeps only the latest price per (name, source). Throws on
 * failure (the caller decides how to surface it). Guarded against concurrent
 * runs by an in-flight boolean.
 */
export function runBackup(): BackupResult {
  if (backupInProgress) {
    throw new Error('Backup already in progress');
  }
  backupInProgress = true;
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const sqlite = getSqlite();

    const profiles = sqlite.prepare('SELECT * FROM profiles').all();
    const items = sqlite.prepare('SELECT * FROM items').all();
    const purchases = sqlite.prepare('SELECT * FROM purchases').all();
    const priceAlerts = sqlite.prepare('SELECT * FROM price_alerts').all();
    const history = sqlite.prepare('SELECT * FROM history').all();
    const settings = sqlite.prepare('SELECT * FROM settings').all();
    // Latest price per (name, source) only — NOT the full time-series.
    const latestPrices = sqlite
      .prepare(
        `SELECT market_hash_name, source, price_eur, timestamp FROM (
           SELECT market_hash_name, source, price_eur, timestamp,
                  ROW_NUMBER() OVER (PARTITION BY market_hash_name, source ORDER BY timestamp DESC) AS rn
           FROM prices
         ) WHERE rn = 1`,
      )
      .all();

    const when = new Date().toISOString();
    const payload = {
      version: 1,
      when,
      tables: { profiles, items, purchases, price_alerts: priceAlerts, history, settings, latest_prices: latestPrices },
    };

    // Filesystem-safe timestamp (no colons) so the name works on Windows too.
    const stamp = when.replace(/[:.]/g, '-');
    const fileName = `${FILE_PREFIX}${stamp}${FILE_SUFFIX}`;
    const fullPath = path.join(BACKUP_DIR, fileName);
    fs.writeFileSync(fullPath, JSON.stringify(payload));

    pruneOldBackups();

    const sizeBytes = fs.statSync(fullPath).size;
    logger.info(`[Backup] Wrote ${fileName} (${sizeBytes} bytes)`);
    return { file: fileName, sizeBytes, when };
  } finally {
    backupInProgress = false;
  }
}
