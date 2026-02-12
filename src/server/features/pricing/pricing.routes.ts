import { Router } from 'express';
import { getCachedPrices } from './pricing.service.ts';
import { getItem24hChange } from '../history/history.service.ts';
import { requireAuth } from '../auth/auth.middleware.ts';

const router = Router();

router.get('/prices/:marketHashName', requireAuth, (req, res) => {
  try {
    const name = decodeURIComponent(req.params.marketHashName as string);
    const prices = getCachedPrices(name);
    const changeInfo = getItem24hChange(name, prices.average || 0);

    res.json({
      name,
      price: prices.average,
      rawPrice: prices,
      change: changeInfo,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch price' });
  }
});

export default router;
