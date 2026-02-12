import { Router } from 'express';
import { getDashboardData, refresh, isRefreshInProgress, getLastRefresh } from './inventory.service.ts';
import { requireAuth } from '../auth/auth.middleware.ts';
import { logger } from '../../lib/logger.ts';

const router = Router();

router.get('/dashboard', requireAuth, (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const data = getDashboardData(days);
    res.json(data);
  } catch (err) {
    logger.error('[Dashboard] Error:', err);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

router.post('/inventory/refresh', requireAuth, (_req, res) => {
  try {
    refresh().catch((err) => logger.error('[Dashboard] Refresh error:', err));
    res.status(202).json({ message: 'Refresh started' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/inventory/status', requireAuth, (_req, res) => {
  res.json({
    isRefreshing: isRefreshInProgress(),
    lastRefresh: getLastRefresh()?.toISOString() ?? null,
  });
});

export default router;
