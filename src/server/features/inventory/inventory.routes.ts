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
  getLastRefreshResult,
} from './inventory.service.ts';
import { requireSteamConnection } from '../auth/auth.middleware.ts';
import { listInventoryEvents } from '../../db/queries/inventory-events.ts';
import { steamClient } from '../steam/steam.client.ts';
import { getPhaseState } from '../steam/steam.status.ts';
import { getProfileLite } from '../../db/queries/profiles.ts';
import { isAllProfiles } from '../../../shared/constants/profiles.ts';
import type { SteamStatusInfo } from '../../../shared/types/api.ts';
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

// Inventory movements (items gained/removed between two refreshes).
router.get('/inventory/events', (req, res) => {
  try {
    const steamId = req.query.steamId as string | undefined;
    if (!steamId) {
      return res.status(400).json({ error: 'steamId query parameter required' });
    }
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const rows = listInventoryEvents(isAllProfiles(steamId) ? null : steamId, limit);
    res.json(
      rows.map((r) => ({
        id: r.id,
        steamId: r.steam_id,
        marketHashName: r.market_hash_name,
        delta: r.delta,
        priceEur: r.price_eur,
        createdAt: r.created_at,
      })),
    );
  } catch (err) {
    logger.error('[Inventory] Events error:', err);
    res.status(500).json({ error: 'Failed to load inventory events' });
  }
});

router.get('/inventory/status', (req, res) => {
  const rawSteamId = (req.query.steamId as string | undefined) || undefined;
  // 'all' behaves as a wildcard: report any in-flight refresh, whatever the account.
  const steamId = isAllProfiles(rawSteamId) ? undefined : rawSteamId;
  const requestedSource = req.query.source === 'csfloat' ? 'csfloat' : req.query.source === 'skinport' ? 'skinport' : 'steam';
  const inventoryRefreshing = isInventoryRefreshInProgress(steamId);
  const priceRefreshing = isPriceRefreshInProgress(steamId);
  const activePriceSource = priceRefreshing ? getActivePriceRefreshSource(steamId) : null;
  const priceRefreshingForRequestedSource = priceRefreshing && activePriceSource === requestedSource;
  const progress = inventoryRefreshing
    ? getRefreshProgress(steamId)
    : priceRefreshingForRequestedSource
      ? getPriceRefreshProgress(steamId)
      : null;
  const syncType = inventoryRefreshing ? 'inventory' : priceRefreshingForRequestedSource ? 'prices' : null;

  // The phase's steamId survives the mid-refresh Steam logout, so the widget
  // keeps showing WHICH account is being worked on until the pipeline ends.
  const phaseState = getPhaseState();
  const clientStatus = steamClient.getStatus();
  const activeSteamId = phaseState.steamId ?? clientStatus.steamId;
  const profileRow = activeSteamId ? getProfileLite(activeSteamId) : undefined;
  const steam: SteamStatusInfo = {
    phase: phaseState.phase,
    phaseSince: phaseState.since,
    phaseDetail: phaseState.detail,
    steamId: activeSteamId,
    profile: profileRow
      ? {
          username: profileRow.username,
          personaName: profileRow.persona_name,
          avatarUrl: profileRow.avatar_url,
        }
      : null,
    isLoggedIn: clientStatus.isLoggedIn,
    isConnectedToGC: clientStatus.isConnectedToGC,
  };

  res.json({
    isRefreshing: inventoryRefreshing || priceRefreshingForRequestedSource,
    syncType,
    source: syncType === 'prices' ? activePriceSource : null,
    lastRefresh: getLastRefresh(steamId, requestedSource)?.toISOString() ?? null,
    progress,
    steam,
    lastRefreshResult: getLastRefreshResult(),
  });
});

export default router;
