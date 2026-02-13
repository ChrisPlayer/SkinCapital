import { getSqlite } from '../client.ts';

export interface ProfileRow {
  id: number;
  steam_id: string;
  username: string;
  persona_name: string | null;
  avatar_url: string | null;
  item_count: number;
  total_value: number;
  last_refresh: string | null;
  created_at: string;
}

export function upsertProfile(
  steamId: string,
  username: string,
  personaName?: string,
  avatarUrl?: string,
): ProfileRow {
  const sqlite = getSqlite();
  sqlite
    .prepare(
      `INSERT INTO profiles (steam_id, username, persona_name, avatar_url)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(steam_id) DO UPDATE SET
         username = excluded.username,
         persona_name = COALESCE(excluded.persona_name, profiles.persona_name),
         avatar_url = COALESCE(excluded.avatar_url, profiles.avatar_url)`,
    )
    .run(steamId, username, personaName || null, avatarUrl || null);

  return sqlite.prepare('SELECT * FROM profiles WHERE steam_id = ?').get(steamId) as ProfileRow;
}

export function getAllProfiles(): ProfileRow[] {
  const sqlite = getSqlite();
  return sqlite
    .prepare(
      `SELECT * FROM profiles
       ORDER BY CASE WHEN last_refresh IS NULL THEN 1 ELSE 0 END, last_refresh DESC`,
    )
    .all() as ProfileRow[];
}

export function getProfileBySteamId(steamId: string): ProfileRow | undefined {
  const sqlite = getSqlite();
  return sqlite
    .prepare('SELECT * FROM profiles WHERE steam_id = ?')
    .get(steamId) as ProfileRow | undefined;
}

export function updateProfileSummary(
  steamId: string,
  itemCount: number,
  totalValue: number,
): void {
  const sqlite = getSqlite();
  sqlite
    .prepare(
      `UPDATE profiles SET item_count = ?, total_value = ?, last_refresh = datetime('now')
       WHERE steam_id = ?`,
    )
    .run(itemCount, totalValue, steamId);
}
