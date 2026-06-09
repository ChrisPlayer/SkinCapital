import { Router } from 'express';
import { getHistory } from './history.service.ts';

const router = Router();

router.get('/history', (req, res) => {
  try {
    const steamId = req.query.steamId as string;
    if (!steamId) {
      return res.status(400).json({ error: 'steamId query parameter required' });
    }
    const days = parseInt(req.query.days as string) || 30;
    const source = req.query.source === 'csfloat' ? 'csfloat' : req.query.source === 'skinport' ? 'skinport' : 'steam';
    const data = getHistory(steamId, days, source);
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

export default router;
