import type { Request, Response, NextFunction } from 'express';
import { steamClient } from '../steam/steam.client.ts';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (steamClient.isLoggedIn) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated' });
}
