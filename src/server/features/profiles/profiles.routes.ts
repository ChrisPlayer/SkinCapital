import { Router } from 'express';
import {
  getAllProfiles,
  getProfileBySteamId,
  getOverview,
  deleteProfileCascade,
} from '../../db/queries/profiles.ts';
import {
  isRefreshInProgress,
  isPriceRefreshInProgress,
  clearProfileRuntimeState,
} from '../inventory/inventory.service.ts';
import { isDailyRefreshRunning } from '../inventory/inventory.jobs.ts';
import { logger } from '../../lib/logger.ts';
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

// SQLite datetime('now') is UTC but Z-less ('YYYY-MM-DD HH:MM:SS'); handing it
// raw to the browser makes new Date() parse it as LOCAL time (a 00:30 Paris
// refresh would display yesterday). Normalize to real ISO-8601 UTC.
function toIsoUtc(sqliteDatetime: string | null): string | null {
  if (!sqliteDatetime) return null;
  if (sqliteDatetime.includes('Z') || sqliteDatetime.includes('+')) return sqliteDatetime;
  const ms = Date.parse(`${sqliteDatetime.replace(' ', 'T')}Z`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : sqliteDatetime;
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
    lastRefresh: toIsoUtc(row.last_refresh),
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

// Remove a tracked profile and everything that references it (items, purchases,
// alerts, history) — e.g. a test/typo login that would otherwise pollute the
// multi-account overview forever. Write route: same posture as settings writes
// (CSRF Origin guard + rate limiter, no Steam login). Refused while a refresh
// is running so a live task can't write rows back for a deleted profile.
router.delete('/profiles/:steamId', (req, res) => {
  try {
    const steamId = req.params.steamId;
    if (isRefreshInProgress() || isPriceRefreshInProgress(steamId) || isDailyRefreshRunning()) {
      return res.status(409).json({ error: 'A refresh is in progress — retry once it finishes' });
    }
    const deleted = deleteProfileCascade(steamId);
    if (!deleted) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    clearProfileRuntimeState(steamId);
    logger.info(`[Profiles] Deleted profile ${steamId} (cascade)`);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete profile' });
  }
});

export default router;
