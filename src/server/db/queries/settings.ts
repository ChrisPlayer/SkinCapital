import { getSqlite } from '../client.ts';

export function getSetting(key: string): string | null {
  const sqlite = getSqlite();
  const row = sqlite.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  const sqlite = getSqlite();
  sqlite
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

export function deleteSetting(key: string): void {
  const sqlite = getSqlite();
  sqlite.prepare('DELETE FROM settings WHERE key = ?').run(key);
}
