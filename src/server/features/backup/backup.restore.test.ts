import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { initDb, closeDb, getSqlite } from '../../db/client.ts';
import { runBackup, restoreBackup } from './backup.service.ts';
import { deleteProfileCascade, profileExists } from '../../db/queries/profiles.ts';

// Restore is the single most destructive operation in the app — round-trip it
// against a real (in-memory) DB. BACKUP_DIR points at a temp dir so no real
// backup files are touched.
let tmpDir: string;

function count(table: string, steamId?: string): number {
  const sqlite = getSqlite();
  const row = steamId
    ? sqlite.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE steam_id = ?`).get(steamId)
    : sqlite.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get();
  return (row as { c: number }).c;
}

function seed() {
  const sqlite = getSqlite();
  sqlite.prepare(`INSERT INTO profiles (steam_id, username) VALUES ('S1', 'alice')`).run();
  sqlite.prepare(`INSERT INTO profiles (steam_id, username) VALUES ('S2', 'bob')`).run();
  const item = sqlite.prepare(`INSERT INTO items (steam_id, market_hash_name) VALUES (?, ?)`);
  item.run('S1', 'AK');
  item.run('S1', 'M4');
  item.run('S2', 'AWP');
  sqlite
    .prepare(`INSERT INTO purchases (steam_id, market_hash_name, buy_price_eur) VALUES ('S1', 'AK', 5)`)
    .run();
  sqlite
    .prepare(
      `INSERT INTO price_alerts (steam_id, market_hash_name, direction, threshold_eur) VALUES ('S1', 'AK', 'above', 20)`,
    )
    .run();
  const hist = sqlite.prepare(
    `INSERT INTO history (steam_id, source, total_value, item_count, timestamp) VALUES (?, 'steam', ?, ?, ?)`,
  );
  hist.run('S1', 100, 2, '2026-07-01');
  hist.run('S2', 50, 1, '2026-07-01');
  sqlite.prepare(`INSERT INTO settings (key, value) VALUES ('marker', 'original')`).run();
  sqlite
    .prepare(`INSERT INTO prices (market_hash_name, source, price_eur, timestamp) VALUES ('AK', 'steam', 10, '2026-07-01 00:00:00')`)
    .run();
}

beforeAll(() => {
  process.env.DB_PATH = ':memory:';
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-backup-test-'));
  process.env.BACKUP_DIR = tmpDir;
  initDb();
  seed();
});

afterAll(() => {
  closeDb();
  delete process.env.BACKUP_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('restoreBackup', () => {
  it('round-trips: backup → mutate → restore brings every table back', () => {
    const backup = runBackup();

    // Mutate everything the backup covers.
    const sqlite = getSqlite();
    sqlite.prepare(`DELETE FROM items WHERE steam_id = 'S1'`).run();
    sqlite.prepare(`DELETE FROM purchases`).run();
    sqlite.prepare(`UPDATE settings SET value = 'mutated' WHERE key = 'marker'`).run();

    const result = restoreBackup(backup.file);

    expect(result.tables.items).toBe(3);
    expect(result.tables.profiles).toBe(2);
    expect(count('items', 'S1')).toBe(2);
    expect(count('purchases')).toBe(1);
    const marker = sqlite.prepare(`SELECT value FROM settings WHERE key = 'marker'`).get() as {
      value: string;
    };
    expect(marker.value).toBe('original');
  });

  it('rejects a file name outside its own enumeration', () => {
    expect(() => restoreBackup('../../etc/passwd')).toThrow('Unknown backup file');
    expect(() => restoreBackup('nope.json')).toThrow('Unknown backup file');
  });

  it('rejects an unsupported payload format', () => {
    const bad = path.join(tmpDir, 'backup-bad.json');
    fs.writeFileSync(bad, JSON.stringify({ version: 99 }));
    expect(() => restoreBackup('backup-bad.json')).toThrow('Unsupported backup format');
    fs.unlinkSync(bad);
  });

  it('ignores columns that no longer exist in the live schema (old backups)', () => {
    const drifted = path.join(tmpDir, 'backup-drift.json');
    fs.writeFileSync(
      drifted,
      JSON.stringify({
        version: 1,
        when: '2026-01-01T00:00:00.000Z',
        tables: {
          profiles: [{ steam_id: 'OLD', username: 'legacy', ghost_column: 'dropped-in-a-migration' }],
          items: [],
          purchases: [],
          price_alerts: [],
          history: [],
          settings: [],
          latest_prices: [{ market_hash_name: 'AK', source: 'steam', price_eur: 11, timestamp: '2026-01-01 00:00:00' }],
        },
      }),
    );
    const result = restoreBackup('backup-drift.json');
    expect(result.tables.profiles).toBe(1);
    expect(profileExists('OLD')).toBe(true);
    // latest_prices are MERGED into the kept time-series, not replacing it.
    expect(count('prices')).toBeGreaterThanOrEqual(2);
    fs.unlinkSync(drifted);
  });
});

describe('deleteProfileCascade', () => {
  it('deletes the profile and every referencing row, leaves others intact', () => {
    // State restored by the drift test: OLD profile only. Re-seed S1/S2 data.
    const sqlite = getSqlite();
    sqlite.prepare(`INSERT OR IGNORE INTO profiles (steam_id, username) VALUES ('S1', 'alice')`).run();
    sqlite.prepare(`INSERT OR IGNORE INTO profiles (steam_id, username) VALUES ('S2', 'bob')`).run();
    sqlite.prepare(`INSERT INTO items (steam_id, market_hash_name) VALUES ('S1', 'AK')`).run();
    sqlite.prepare(`INSERT INTO items (steam_id, market_hash_name) VALUES ('S2', 'AWP')`).run();
    sqlite
      .prepare(`INSERT INTO purchases (steam_id, market_hash_name, buy_price_eur) VALUES ('S1', 'AK', 5)`)
      .run();
    sqlite
      .prepare(
        `INSERT INTO price_alerts (steam_id, market_hash_name, direction, threshold_eur) VALUES ('S1', 'AK', 'below', 1)`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO history (steam_id, source, total_value, item_count, timestamp) VALUES ('S1', 'steam', 10, 1, '2026-07-02')`,
      )
      .run();

    expect(deleteProfileCascade('S1')).toBe(true);

    expect(profileExists('S1')).toBe(false);
    expect(count('items', 'S1')).toBe(0);
    expect(count('purchases', 'S1')).toBe(0);
    expect(count('price_alerts', 'S1')).toBe(0);
    expect(count('history', 'S1')).toBe(0);
    // The other profile is untouched.
    expect(profileExists('S2')).toBe(true);
    expect(count('items', 'S2')).toBe(1);
  });

  it('returns false when the profile does not exist', () => {
    expect(deleteProfileCascade('S1')).toBe(false);
    expect(deleteProfileCascade('GHOST')).toBe(false);
  });
});
