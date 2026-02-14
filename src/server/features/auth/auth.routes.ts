import { Router } from 'express';
import { z } from 'zod';
import { steamClient } from '../steam/steam.client.ts';
import { refresh, fetchMissingPrices } from '../inventory/inventory.service.ts';
import { authLimiter } from '../../middleware/security.ts';
import { upsertProfile } from '../../db/queries/profiles.ts';
import { logger } from '../../lib/logger.ts';
import type { Profile } from '../../../shared/types/api.ts';

const router = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const steamGuardSchema = z.object({
  code: z.string().min(1).max(10),
});

function rowToProfile(row: { id: number; steam_id: string; username: string; persona_name: string | null; avatar_url: string | null; item_count: number; total_value: number; last_refresh: string | null }): Profile {
  return {
    id: row.id,
    steamId: row.steam_id,
    username: row.username,
    personaName: row.persona_name,
    avatarUrl: row.avatar_url,
    itemCount: row.item_count,
    totalValue: row.total_value,
    lastRefresh: row.last_refresh,
  };
}

router.post('/login', authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const { username, password } = parsed.data;

  try {
    logger.info('[Auth] Login attempt for:', username);

    req.session.credentials = {
      username,
    };

    steamClient.init();
    await steamClient.login(username, password);

    logger.info('[Auth] Login successful');

    const steamId = steamClient.steamUser!.steamID!.getSteamID64();
    req.session.steamId = steamId;

    // Fetch persona name and avatar from Steam
    const personaInfo = await steamClient.getPersonaInfo(steamId);
    const profileRow = upsertProfile(
      steamId,
      username,
      personaInfo?.personaName,
      personaInfo?.avatarUrl,
    );

    delete req.session.credentials;

    // Check for items without prices first, then do full refresh
    fetchMissingPrices(steamId).catch((err) => {
      logger.error('[Auth] Missing prices check error:', (err as Error).message);
    });

    refresh(steamId).catch((err) => {
      logger.error('[Auth] Initial refresh error:', (err as Error).message);
    });

    res.json({ success: true, profile: rowToProfile(profileRow) });
  } catch (err) {
    const message = (err as Error).message;

    if (message.includes('Steam Guard') || message.includes('SteamGuard')) {
      logger.info('[Auth] Steam Guard code requested');
      req.session.needsSteamGuard = true;
      return res.status(200).json({ needsSteamGuard: true, error: 'Steam Guard code required' });
    }

    logger.error('[Auth] Login failed:', message);
    delete req.session.credentials;
    delete req.session.needsSteamGuard;
    delete req.session.steamId;

    let errorMsg = 'Login failed';
    if (message.includes('InvalidPassword')) errorMsg = 'Invalid password';
    else if (message.includes('RateLimitExceeded')) errorMsg = 'Too many attempts, try later';

    res.status(401).json({ error: errorMsg });
  }
});

router.post('/steamguard', authLimiter, async (req, res) => {
  const parsed = steamGuardSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid code' });
  }

  try {
    const code = parsed.data.code.toUpperCase();
    await steamClient.submitSteamGuardCode(code);

    logger.info('[Auth] Steam Guard login successful');

    const steamId = steamClient.steamUser!.steamID!.getSteamID64();
    req.session.steamId = steamId;
    const username = req.session.credentials?.username || 'Unknown';

    // Fetch persona name and avatar from Steam
    const personaInfo = await steamClient.getPersonaInfo(steamId);
    const profileRow = upsertProfile(
      steamId,
      username,
      personaInfo?.personaName,
      personaInfo?.avatarUrl,
    );

    delete req.session.credentials;
    delete req.session.needsSteamGuard;

    // Check for items without prices first, then do full refresh
    fetchMissingPrices(steamId).catch((err) => {
      logger.error('[Auth] Missing prices check error:', (err as Error).message);
    });

    refresh(steamId).catch((err) => {
      logger.error('[Auth] Initial refresh error:', (err as Error).message);
    });

    res.json({ success: true, profile: rowToProfile(profileRow) });
  } catch (err) {
    logger.error('[Auth] Steam Guard failed:', (err as Error).message);
    res.status(401).json({ error: 'Invalid Steam Guard code' });
  }
});

router.post('/logout', (req, res) => {
  logger.info('[Auth] Logging out...');
  steamClient.logout();
  delete req.session.credentials;
  delete req.session.needsSteamGuard;
  delete req.session.steamId;
  res.json({ success: true });
});

router.get('/status', (req, res) => {
  const sessionSteamId = req.session.steamId || null;
  if (!sessionSteamId) {
    return res.json({
      isLoggedIn: false,
      isConnectedToGC: false,
      steamId: null,
    });
  }

  const activeSteamId = steamClient.steamUser?.steamID?.getSteamID64() || null;
  const ownsActiveSteamSession = !!activeSteamId && activeSteamId === sessionSteamId;

  return res.json({
    isLoggedIn: true,
    isConnectedToGC: ownsActiveSteamSession ? steamClient.isConnectedToGC : false,
    steamId: sessionSteamId,
  });
});

export default router;
