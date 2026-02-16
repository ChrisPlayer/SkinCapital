import { Router } from 'express';
import { getCachedPrices } from './pricing.service.ts';
import { getItem24hChange } from '../history/history.service.ts';

const router = Router();

router.get('/prices/:marketHashName', (req, res) => {
  try {
    const name = decodeURIComponent(req.params.marketHashName as string);
    const source = req.query.source === 'csfloat' ? 'csfloat' : 'steam';
    const prices = getCachedPrices(name);
    const selectedPrice = source === 'csfloat' ? prices.csfloat : prices.steam;
    const changeInfo = getItem24hChange(name, selectedPrice || 0);

    res.json({
      name,
      price: selectedPrice,
      rawPrice: prices,
      change: changeInfo,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch price' });
  }
});

export default router;
