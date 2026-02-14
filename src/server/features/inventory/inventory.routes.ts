import { Router } from 'express';
import {
  getDashboardData,
  refresh,
  refreshPrices,
  isRefreshInProgress,
  isInventoryRefreshInProgress,
  isPriceRefreshInProgress,
  getRefreshProgress,
  getPriceRefreshProgress,
  getLastRefresh,
} from './inventory.service.ts';
import { requireSteamConnection } from '../auth/auth.middleware.ts';
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

router.post('/inventory/refresh', requireSteamConnection, (req, res) => {
  try {
    if (isRefreshInProgress()) {
      return res.status(409).json({ error: 'Inventory refresh already in progress' });
    }

    const steamId = req.session.steamId;
    if (!steamId) {
      return res.status(400).json({ error: 'No active Steam session' });
    }
    refresh(steamId).catch((err) => logger.error('[Dashboard] Refresh error:', err));
    res.status(202).json({ message: 'Refresh started', steamId });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/prices/refresh', (req, res) => {
  try {
    const steamId = req.query.steamId as string;
    if (!steamId) {
      return res.status(400).json({ error: 'steamId query parameter required' });
    }
    if (isPriceRefreshInProgress(steamId)) {
      return res.status(409).json({ error: 'Price refresh already in progress' });
    }

    refreshPrices(steamId).catch((err) => logger.error('[Prices] Refresh error:', err));
    res.status(202).json({ message: 'Price refresh started', steamId });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/inventory/status', (req, res) => {
  const steamId = (req.query.steamId as string | undefined) || undefined;
  const inventoryRefreshing = isInventoryRefreshInProgress(steamId);
  const priceRefreshing = isPriceRefreshInProgress(steamId);
  const progress = inventoryRefreshing
    ? getRefreshProgress(steamId)
    : priceRefreshing
      ? getPriceRefreshProgress(steamId)
      : null;

  res.json({
    isRefreshing: inventoryRefreshing || priceRefreshing,
    lastRefresh: getLastRefresh()?.toISOString() ?? null,
    progress,
  });
});

export default router;
