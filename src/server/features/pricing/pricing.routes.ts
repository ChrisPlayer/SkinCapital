import { Router } from 'express';
import { getCachedPrices } from './pricing.service.ts';
import { getItem24hChange } from '../history/history.service.ts';
import { getItemPriceHistory } from '../../db/queries/history.ts';
import { getPriceMovers, getMarketMovers } from '../../db/queries/prices.ts';

const router = Router();

// Top gainers/losers over a 7/30 day window for one profile + price source.
// Items with fewer than 2 points in the window or an old price under 0.50 EUR
// are ignored (tiny denominators produce absurd percentages).
router.get('/movers', (req, res) => {
  try {
    const steamId = req.query.steamId as string;
    if (!steamId) {
      return res.status(400).json({ error: 'steamId query parameter required' });
    }
    const source = req.query.source === 'csfloat' ? 'csfloat' : req.query.source === 'skinport' ? 'skinport' : 'steam';
    const days = req.query.days === '30' ? 30 : 7;

    const movers = getPriceMovers(steamId, source, days)
      .filter((r) => r.oldPrice >= 0.5)
      .map((r) => ({
        name: r.name,
        oldPrice: r.oldPrice,
        newPrice: r.newPrice,
        changePct: ((r.newPrice - r.oldPrice) / r.oldPrice) * 100,
      }))
      .filter((r) => r.changePct !== 0);

    const gainers = movers
      .filter((m) => m.changePct > 0)
      .sort((a, b) => b.changePct - a.changePct)
      .slice(0, 5);
    const losers = movers
      .filter((m) => m.changePct < 0)
      .sort((a, b) => a.changePct - b.changePct)
      .slice(0, 5);

    res.json({ days, gainers, losers });
  } catch {
    res.status(500).json({ error: 'Failed to compute movers' });
  }
});

// Market-wide top gainers/losers over a 7/30 day window for one price source.
// Same filtering/sorting as /movers but NOT scoped to a profile — covers every
// item the app has ever priced for this source. Top 8 each way.
router.get('/trends', (req, res) => {
  try {
    const source = req.query.source === 'csfloat' ? 'csfloat' : req.query.source === 'skinport' ? 'skinport' : 'steam';
    const days = req.query.days === '30' ? 30 : 7;

    const movers = getMarketMovers(source, days)
      .filter((r) => r.oldPrice >= 0.5)
      .map((r) => ({
        name: r.name,
        oldPrice: r.oldPrice,
        newPrice: r.newPrice,
        changePct: ((r.newPrice - r.oldPrice) / r.oldPrice) * 100,
      }))
      .filter((r) => r.changePct !== 0);

    const gainers = movers
      .filter((m) => m.changePct > 0)
      .sort((a, b) => b.changePct - a.changePct)
      .slice(0, 8);
    const losers = movers
      .filter((m) => m.changePct < 0)
      .sort((a, b) => a.changePct - b.changePct)
      .slice(0, 8);

    res.json({ days, gainers, losers });
  } catch {
    res.status(500).json({ error: 'Failed to compute trends' });
  }
});

router.get('/prices/:marketHashName', (req, res) => {
  try {
    const name = decodeURIComponent(req.params.marketHashName as string);
    const source = req.query.source === 'csfloat' ? 'csfloat' : req.query.source === 'skinport' ? 'skinport' : 'steam';
    const prices = getCachedPrices(name);
    const selectedPrice =
      source === 'csfloat' ? prices.csfloat : source === 'skinport' ? prices.skinport : prices.steam;
    const changeInfo = getItem24hChange(name, selectedPrice || 0, source);
    // 30-day raw price points for the selected source (modal sparkline).
    const history = getItemPriceHistory(name, source, 30).map((r) => ({
      date: r.timestamp,
      price: r.price_eur,
    }));

    res.json({
      name,
      price: selectedPrice,
      rawPrice: prices,
      change: changeInfo,
      history,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch price' });
  }
});

export default router;
