import { Router } from 'express';
import { getDashboardData, refresh, isRefreshInProgress, getLastRefresh } from './inventory.service.ts';
import { requireAuth } from '../auth/auth.middleware.ts';
import { steamClient } from '../steam/steam.client.ts';
import { logger } from '../../lib/logger.ts';

const router = Router();

router.get('/dashboard', (req, res) => {
  try {
    const steamId = req.query.steamId as string;
    if (!steamId) {
      return res.status(400).json({ error: 'steamId query parameter required' });
    }
    const days = parseInt(req.query.days as string) || 30;
    const data = getDashboardData(steamId, days);
    res.json(data);
  } catch (err) {
    logger.error('[Dashboard] Error:', err);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

router.post('/inventory/refresh', requireAuth, (_req, res) => {
  try {
    const steamId = steamClient.steamUser?.steamID?.getSteamID64();
    if (!steamId) {
      return res.status(400).json({ error: 'No active Steam session' });
    }
    refresh(steamId).catch((err) => logger.error('[Dashboard] Refresh error:', err));
    res.status(202).json({ message: 'Refresh started', steamId });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/inventory/status', (_req, res) => {
  res.json({
    isRefreshing: isRefreshInProgress(),
    lastRefresh: getLastRefresh()?.toISOString() ?? null,
  });
});

export default router;
