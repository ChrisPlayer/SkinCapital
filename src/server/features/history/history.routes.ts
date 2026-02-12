import { Router } from 'express';
import { getHistory } from './history.service.ts';
import { requireAuth } from '../auth/auth.middleware.ts';

const router = Router();

router.get('/history', requireAuth, (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const data = getHistory(days);
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

export default router;
