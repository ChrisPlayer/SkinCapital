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
         username = COALESCE(NULLIF(excluded.username, 'Unknown'), profiles.username),
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
      `SELECT
        p.id, p.steam_id, p.username, p.persona_name, p.avatar_url,
        COALESCE(s.item_count, p.item_count, 0) as item_count,
        COALESCE(s.total_value, p.total_value, 0) as total_value,
        p.last_refresh, p.created_at
       FROM profiles p
       LEFT JOIN (
         SELECT
           i.steam_id,
           COUNT(*) as item_count,
           SUM(COALESCE(lp.price_eur, 0)) as total_value
         FROM items i
         LEFT JOIN (
           SELECT p1.market_hash_name, p1.price_eur
           FROM prices p1
           INNER JOIN (
             SELECT market_hash_name, MAX(timestamp) as max_ts
             FROM prices WHERE source = 'steam' GROUP BY market_hash_name
           ) p2 ON p1.market_hash_name = p2.market_hash_name AND p1.timestamp = p2.max_ts
           WHERE p1.source = 'steam'
         ) lp ON lp.market_hash_name = i.market_hash_name
         GROUP BY i.steam_id
       ) s ON s.steam_id = p.steam_id
       ORDER BY CASE WHEN p.last_refresh IS NULL THEN 1 ELSE 0 END, p.last_refresh DESC`,
    )
    .all() as ProfileRow[];
}

export function getProfileBySteamId(steamId: string): ProfileRow | undefined {
  const sqlite = getSqlite();
  return sqlite
    .prepare(
      `SELECT
        p.id, p.steam_id, p.username, p.persona_name, p.avatar_url,
        COALESCE(s.item_count, p.item_count, 0) as item_count,
        COALESCE(s.total_value, p.total_value, 0) as total_value,
        p.last_refresh, p.created_at
       FROM profiles p
       LEFT JOIN (
         SELECT
           i.steam_id,
           COUNT(*) as item_count,
           SUM(COALESCE(lp.price_eur, 0)) as total_value
         FROM items i
         LEFT JOIN (
           SELECT p1.market_hash_name, p1.price_eur
           FROM prices p1
           INNER JOIN (
             SELECT market_hash_name, MAX(timestamp) as max_ts
             FROM prices WHERE source = 'steam' GROUP BY market_hash_name
           ) p2 ON p1.market_hash_name = p2.market_hash_name AND p1.timestamp = p2.max_ts
           WHERE p1.source = 'steam'
         ) lp ON lp.market_hash_name = i.market_hash_name
         GROUP BY i.steam_id
       ) s ON s.steam_id = p.steam_id
       WHERE p.steam_id = ?`,
    )
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
