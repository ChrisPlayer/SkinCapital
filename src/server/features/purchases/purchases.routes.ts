import { Router } from 'express';
import { z } from 'zod';
import { setPurchase, deletePurchase } from '../../db/queries/purchases.ts';
import { isAllProfiles } from '../../../shared/constants/profiles.ts';

const router = Router();

// NOTE: writes are NOT behind Steam login — consistent with this LAN/personal
// tool (reads are public, minimal friction). They ARE protected by the CSRF
// Origin guard + rate limiter mounted in app.ts.

const purchaseSchema = z.object({
  steamId: z.string().min(1),
  marketHashName: z.string().min(1),
  // > 0 upserts; null/0 removes the purchase price (negatives rejected).
  buyPriceEur: z.number().nonnegative().finite().max(1000000).nullable(),
});

router.put('/purchases', (req, res) => {
  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'steamId, marketHashName and buyPriceEur (>= 0 or null) required' });
  }

  const { steamId, marketHashName, buyPriceEur } = parsed.data;
  if (isAllProfiles(steamId)) {
    return res.status(400).json({ error: 'Purchases are per-profile; pick a specific account' });
  }
  if (buyPriceEur === null || buyPriceEur === 0) {
    deletePurchase(steamId, marketHashName);
  } else {
    setPurchase(steamId, marketHashName, buyPriceEur);
  }
  res.json({ ok: true });
});

router.delete('/purchases', (req, res) => {
  const steamId = req.query.steamId as string;
  const marketHashName = req.query.marketHashName as string;
  if (!steamId || !marketHashName) {
    return res.status(400).json({ error: 'steamId and marketHashName query parameters required' });
  }
  if (isAllProfiles(steamId)) {
    return res.status(400).json({ error: 'Purchases are per-profile; pick a specific account' });
  }
  deletePurchase(steamId, marketHashName);
  res.json({ ok: true });
});

export default router;
