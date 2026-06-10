import { Router } from 'express';
import {
  getDashboardData,
  refresh,
  refreshPrices,
  type PriceRefreshScope,
  isRefreshInProgress,
  isInventoryRefreshInProgress,
  isPriceRefreshInProgress,
  getActivePriceRefreshSource,
  cancelPriceRefresh,
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
    const source = req.query.source === 'csfloat' ? 'csfloat' : req.query.source === 'skinport' ? 'skinport' : 'steam';
    const data = getDashboardData(steamId, days, source);
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
    const force = req.query.force === '1' || req.query.force === 'true';
    refresh(steamId, force).catch((err) => logger.error('[Dashboard] Refresh error:', err));
    res.status(202).json({ message: 'Refresh started', steamId, force });
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
    const source = req.query.source === 'csfloat' ? 'csfloat' : req.query.source === 'skinport' ? 'skinport' : 'steam';
    const scopeParam = req.query.scope as string | undefined;
    const scope: PriceRefreshScope =
      scopeParam === 'all' || scopeParam === 'missing' || scopeParam === 'stale_or_missing'
        ? scopeParam
        : 'stale_or_missing';
    if (isPriceRefreshInProgress(steamId) && getActivePriceRefreshSource(steamId) === source) {
      return res.status(409).json({ error: 'Price refresh already in progress' });
    }

    refreshPrices(steamId, source, scope).catch((err) => logger.error('[Prices] Refresh error:', err));
    res.status(202).json({ message: 'Price refresh started', steamId, source, scope });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/prices/cancel', (req, res) => {
  try {
    const steamId = req.query.steamId as string;
    if (!steamId) {
      return res.status(400).json({ error: 'steamId query parameter required' });
    }
    const cancelled = cancelPriceRefresh(steamId);
    res.status(200).json({ cancelled });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/inventory/status', (req, res) => {
  const steamId = (req.query.steamId as string | undefined) || undefined;
  const requestedSource = req.query.source === 'csfloat' ? 'csfloat' : req.query.source === 'skinport' ? 'skinport' : 'steam';
  const inventoryRefreshing = isInventoryRefreshInProgress(steamId);
  const priceRefreshing = isPriceRefreshInProgress(steamId);
  const activePriceSource = priceRefreshing && steamId ? getActivePriceRefreshSource(steamId) : null;
  const priceRefreshingForRequestedSource = priceRefreshing && activePriceSource === requestedSource;
  const progress = inventoryRefreshing
    ? getRefreshProgress(steamId)
    : priceRefreshingForRequestedSource
      ? getPriceRefreshProgress(steamId)
      : null;
  const syncType = inventoryRefreshing ? 'inventory' : priceRefreshingForRequestedSource ? 'prices' : null;

  res.json({
    isRefreshing: inventoryRefreshing || priceRefreshingForRequestedSource,
    syncType,
    source: syncType === 'prices' ? activePriceSource : null,
    lastRefresh: getLastRefresh(steamId, requestedSource)?.toISOString() ?? null,
    progress,
  });
});

export default router;
