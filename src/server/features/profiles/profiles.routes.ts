import { Router } from 'express';
import { getAllProfiles, getProfileBySteamId, getOverview } from '../../db/queries/profiles.ts';
import type { Profile } from '../../../shared/types/api.ts';

const router = Router();

// Mirrors the inventory service's image building: a Steam economy icon hash is
// served through the CDN; otherwise fall back to the schema image (already a
// full URL) when present.
const STEAM_CDN = 'https://community.akamai.steamstatic.com/economy/image/';
function buildImageUrl(iconUrl: string | null, schemaImage: string | null): string | null {
  if (iconUrl) return `${STEAM_CDN}${iconUrl}/200fx200f`;
  if (schemaImage) return schemaImage;
  return null;
}

function toProfile(row: {
  id: number;
  steam_id: string;
  username: string;
  persona_name: string | null;
  avatar_url: string | null;
  item_count: number;
  total_value: number;
  last_refresh: string | null;
}): Profile {
  return {
    id: row.id,
    steamId: row.steam_id,
    username: row.username,
    personaName: row.persona_name,
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

// Aggregate across ALL profiles (combined value, item count, account count and
// the top items by summed steam value). Item prices only — stickers excluded.
router.get('/overview', (_req, res) => {
  try {
    const overview = getOverview();
    res.json({
      totalValue: overview.totalValue,
      totalItems: overview.totalItems,
      profileCount: overview.profileCount,
      topItems: overview.topItems.map((it) => ({
        marketHashName: it.marketHashName,
        totalValue: it.totalValue,
        imageUrl: buildImageUrl(it.iconUrl, it.schemaImage),
      })),
    });
  } catch {
    res.status(500).json({ error: 'Failed to compute overview' });
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
