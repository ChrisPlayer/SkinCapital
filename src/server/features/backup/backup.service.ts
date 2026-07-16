import fs from 'fs';
import path from 'path';
import type { Statement } from 'better-sqlite3';
import { getSqlite } from '../../db/client.ts';
import { logger } from '../../lib/logger.ts';
import { DATA_DIR } from '../../lib/paths.ts';
import type { BackupFileInfo } from '../../../shared/types/api.ts';

// Anti data-loss: a timestamped JSON dump of the user-meaningful tables. The
// full prices time-series is deliberately excluded (too big); only the LATEST
// price per (name, source) is kept so a restore still has something to show
// until the next refresh. We keep the last N files and prune the rest.
const MAX_BACKUPS = 14;
const FILE_PREFIX = 'backup-';
const FILE_SUFFIX = '.json';

// Resolved lazily so tests can point it at a temp dir via env before first use.
// Default anchors under DATA_DIR (Docker volume / Windows exe relocation).
function backupDir(): string {
  return process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups');
}

export interface BackupResult {
  file: string;
  sizeBytes: number;
  when: string;
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
  if (!fs.existsSync(backupDir())) return [];
  return fs
    .readdirSync(backupDir())
    .filter((f) => f.startsWith(FILE_PREFIX) && f.endsWith(FILE_SUFFIX))
    .sort(); // timestamp in the name sorts chronologically (oldest first)
}

/** Newest backup file metadata, or null when none exist. */
export function getLatestBackup(): BackupFileInfo | null {
  const files = listBackupFiles();
  if (files.length === 0) return null;
  const newest = files[files.length - 1];
  const full = path.join(backupDir(), newest);
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
  return path.join(backupDir(), files[files.length - 1]);
}

/**
 * Absolute path of ONE retained backup by its bare file name. The name must be
 * a member of our own enumeration (strict prefix/suffix, no separators), so no
 * user-controlled path ever reaches the filesystem — unknown names → null.
 */
export function getBackupPathByName(fileName: string): string | null {
  if (!listBackupFiles().includes(fileName)) return null;
  return path.join(backupDir(), fileName);
}

export function getBackupCount(): number {
  return listBackupFiles().length;
}

/** All retained backups, newest first (settings page list). */
export function listBackups(): BackupFileInfo[] {
  const out: BackupFileInfo[] = [];
  for (const f of listBackupFiles()) {
    try {
      const stat = fs.statSync(path.join(backupDir(), f));
      out.push({ file: f, when: stat.mtime.toISOString(), sizeBytes: stat.size });
    } catch {
      /* pruned between readdir and stat — skip */
    }
  }
  return out.reverse();
}

/** `exclude`: file kept even when it falls past the retention cut (restore target). */
function pruneOldBackups(exclude?: string): void {
  const files = listBackupFiles();
  if (files.length <= MAX_BACKUPS) return;
  const toDelete = files.slice(0, files.length - MAX_BACKUPS).filter((f) => f !== exclude);
  for (const f of toDelete) {
    try {
      fs.unlinkSync(path.join(backupDir(), f));
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
export function runBackup(options?: { prune?: boolean }): BackupResult {
  if (backupInProgress) {
    throw new Error('Backup already in progress');
  }
  backupInProgress = true;
  try {
    fs.mkdirSync(backupDir(), { recursive: true });
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
    const fullPath = path.join(backupDir(), fileName);
    fs.writeFileSync(fullPath, JSON.stringify(payload));

    if (options?.prune !== false) pruneOldBackups();

    const sizeBytes = fs.statSync(fullPath).size;
    logger.info(`[Backup] Wrote ${fileName} (${sizeBytes} bytes)`);
    return { file: fileName, sizeBytes, when };
  } finally {
    backupInProgress = false;
  }
}

// Tables restored verbatim (delete + re-insert). Prices are handled separately:
// the backup only holds the latest price per (name, source), so the live
// time-series is KEPT and the snapshot rows are merged in — wiping it would
// empty the movers/trends windows for no benefit.
const RESTORABLE_TABLES = ['profiles', 'items', 'purchases', 'price_alerts', 'history', 'settings'] as const;

export interface RestoreResult {
  file: string;
  tables: Record<string, number>;
}

interface BackupPayload {
  version?: number;
  tables?: Record<string, Array<Record<string, unknown>>>;
}

/**
 * Replace the live tables with the contents of one retained backup file (name
 * validated against our own enumeration — never a path). A fresh backup of the
 * CURRENT state is written first, so a restore is itself reversible. All table
 * writes happen in ONE transaction. Throws with a human-readable message on
 * any validation failure; the caller maps it to a 4xx.
 */
export function restoreBackup(fileName: string): RestoreResult {
  const fullPath = getBackupPathByName(fileName);
  if (!fullPath) {
    throw new Error('Unknown backup file');
  }
  if (backupInProgress) {
    throw new Error('A backup is currently being written — retry in a moment');
  }

  const payload = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as BackupPayload;
  if (payload.version !== 1 || !payload.tables || typeof payload.tables !== 'object') {
    throw new Error('Unsupported backup format');
  }
  const tables = payload.tables;

  // Safety net FIRST: snapshot what we are about to overwrite. Pruning is
  // DEFERRED until the transaction commits — at steady-state retention the
  // extra file would otherwise evict the oldest backup, which can be the very
  // file being restored (unrecoverable if the transaction then failed).
  runBackup({ prune: false });

  const sqlite = getSqlite();
  const counts: Record<string, number> = {};

  const tx = sqlite.transaction(() => {
    for (const table of RESTORABLE_TABLES) {
      const rows = tables[table];
      if (!Array.isArray(rows)) continue;
      // Only columns that still exist in the live schema are restored, so an
      // old backup keeps working after schema evolutions.
      const liveCols = new Set(
        (sqlite.pragma(`table_info(${table})`) as Array<{ name: string }>).map((c) => c.name),
      );
      sqlite.prepare(`DELETE FROM ${table}`).run();
      // Statements cached per column signature (rows of one table rarely differ).
      const stmtBySignature = new Map<string, Statement>();
      let inserted = 0;
      for (const row of rows) {
        if (row === null || typeof row !== 'object') continue;
        const cols = Object.keys(row).filter((c) => liveCols.has(c));
        if (cols.length === 0) continue;
        const signature = cols.join(',');
        let stmt = stmtBySignature.get(signature);
        if (!stmt) {
          stmt = sqlite.prepare(
            `INSERT INTO ${table} (${signature}) VALUES (${cols.map(() => '?').join(',')})`,
          );
          stmtBySignature.set(signature, stmt);
        }
        stmt.run(...cols.map((c) => row[c] as string | number | null));
        inserted++;
      }
      counts[table] = inserted;
    }

    // Merge the latest-price snapshot back in (skip rows already present).
    const priceRows = tables['latest_prices'];
    if (Array.isArray(priceRows)) {
      const ins = sqlite.prepare(
        `INSERT INTO prices (market_hash_name, source, price_eur, timestamp)
         SELECT ?, ?, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM prices WHERE market_hash_name = ? AND source = ? AND timestamp = ?
         )`,
      );
      let inserted = 0;
      for (const row of priceRows) {
        const name = row.market_hash_name;
        const source = row.source;
        const ts = row.timestamp;
        if (typeof name !== 'string' || typeof source !== 'string' || typeof ts !== 'string') continue;
        const price = typeof row.price_eur === 'number' ? row.price_eur : null;
        const res = ins.run(name, source, price, ts, name, source, ts);
        inserted += res.changes;
      }
      counts['latest_prices'] = inserted;
    }
  });
  tx();

  // Prune now that the restore is committed, keeping the restored file itself
  // alive even if it falls past the retention cut.
  pruneOldBackups(fileName);

  logger.info(
    `[Backup] Restored ${fileName}: ${Object.entries(counts)
      .map(([t, n]) => `${t}=${n}`)
      .join(', ')}`,
  );
  return { file: fileName, tables: counts };
}
