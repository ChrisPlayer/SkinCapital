import { Router } from 'express';
import { getAllProfiles, getProfileBySteamId } from '../../db/queries/profiles.ts';
import type { Profile } from '../../../shared/types/api.ts';

const router = Router();

function toProfile(row: {
  id: number;
  steam_id: string;
  username: string;
  avatar_url: string | null;
  item_count: number;
  total_value: number;
  last_refresh: string | null;
}): Profile {
  return {
    id: row.id,
    steamId: row.steam_id,
    username: row.username,
    avatarUrl: row.avatar_url,
    itemCount: row.item_count,
    totalValue: row.total_value,
    lastRefresh: row.last_refresh,
  };
}

router.get('/profiles', (_req, res) => {
  try {
    const rows = getAllProfiles();
    res.json(rows.map(toProfile));
  } catch {
    res.status(500).json({ error: 'Failed to fetch profiles' });
  }
});

router.get('/profiles/:steamId', (req, res) => {
  try {
    const row = getProfileBySteamId(req.params.steamId);
    if (!row) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.json(toProfile(row));
  } catch {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

export default router;
