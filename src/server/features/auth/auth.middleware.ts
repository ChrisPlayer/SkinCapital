import type { Request, Response, NextFunction } from 'express';
import { steamClient } from '../steam/steam.client.ts';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session.steamId) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated' });
}

export function requireSteamConnection(req: Request, res: Response, next: NextFunction) {
  const sessionSteamId = req.session.steamId;
  const activeSteamId = steamClient.steamUser?.steamID?.getSteamID64();

  if (steamClient.isLoggedIn && sessionSteamId && activeSteamId === sessionSteamId) {
    return next();
  }
  res.status(401).json({ error: 'No active Steam session' });
}
