import { Router } from 'express';
import { z } from 'zod';
import { listAlerts, listAllAlerts, createAlert, deleteAlert, type PriceAlertRow } from '../../db/queries/alerts.ts';
import { getCachedPrices } from '../pricing/pricing.service.ts';
import { isAllProfiles } from '../../../shared/constants/profiles.ts';
import type { PriceAlert } from '../../../shared/types/api.ts';

const router = Router();

// NOTE: writes are NOT behind Steam login — consistent with this LAN/personal
// tool (reads are public, minimal friction). They ARE protected by the CSRF
// Origin guard + rate limiter mounted in app.ts.

function rowToAlert(row: PriceAlertRow): PriceAlert {
  return {
    id: row.id,
    steamId: row.steam_id,
    marketHashName: row.market_hash_name,
    direction: row.direction,
    thresholdEur: row.threshold_eur,
    triggeredAt: row.triggered_at,
    createdAt: row.created_at,
    currentPrice: getCachedPrices(row.market_hash_name).steam,
  };
}

router.get('/alerts', (req, res) => {
  const steamId = req.query.steamId as string;
  if (!steamId) {
    return res.status(400).json({ error: 'steamId query parameter required' });
  }
  res.json((isAllProfiles(steamId) ? listAllAlerts() : listAlerts(steamId)).map(rowToAlert));
});

const createAlertSchema = z.object({
  steamId: z.string().min(1),
  marketHashName: z.string().min(1),
  direction: z.enum(['above', 'below']),
  thresholdEur: z.number().positive().finite().max(1000000),
});

router.post('/alerts', (req, res) => {
  const parsed = createAlertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'steamId, marketHashName, direction and thresholdEur (> 0) required' });
  }

  const { steamId, marketHashName, direction, thresholdEur } = parsed.data;
  if (isAllProfiles(steamId)) {
    return res.status(400).json({ error: 'Alerts are per-profile; pick a specific account' });
  }
  const row = createAlert(steamId, marketHashName, direction, thresholdEur);
  res.status(201).json(rowToAlert(row));
});

router.delete('/alerts/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: 'Invalid alert id' });
  }
  const steamId = req.query.steamId as string;
  if (!steamId) {
    return res.status(400).json({ error: 'steamId query parameter required' });
  }
  deleteAlert(id, steamId);
  res.json({ ok: true });
});

export default router;
