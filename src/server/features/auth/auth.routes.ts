import { Router } from 'express';
import { z } from 'zod';
import { steamClient } from '../steam/steam.client.ts';
import { refresh } from '../inventory/inventory.service.ts';
import { encryptCredential, decryptCredential } from './auth.service.ts';
import { authLimiter } from '../../middleware/security.ts';
import { logger } from '../../lib/logger.ts';

const router = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  sharedSecret: z.string().optional(),
});

const steamGuardSchema = z.object({
  code: z.string().min(1).max(10),
});

router.post('/login', authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const { username, password, sharedSecret } = parsed.data;

  try {
    logger.info('[Auth] Login attempt for:', username);

    req.session.credentials = {
      username,
      password: encryptCredential(password),
      sharedSecret: sharedSecret ? encryptCredential(sharedSecret) : undefined,
    };

    steamClient.init();
    await steamClient.login(username, password, sharedSecret || null);

    logger.info('[Auth] Login successful');

    // Regenerate session after login
    req.session.regenerate((err) => {
      if (err) logger.error('[Auth] Session regeneration error:', err);
    });

    delete req.session.credentials;

    refresh().catch((err) => {
      logger.error('[Auth] Initial refresh error:', (err as Error).message);
    });

    res.json({ success: true });
  } catch (err) {
    const message = (err as Error).message;
    logger.error('[Auth] Login failed:', message);

    if (message.includes('Steam Guard') || message.includes('SteamGuard')) {
      req.session.needsSteamGuard = true;
      return res.status(200).json({ needsSteamGuard: true, error: 'Steam Guard code required' });
    }

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

  const credentials = req.session.credentials;
  if (!credentials) {
    return res.status(400).json({ error: 'Session expired, please login again' });
  }

  try {
    const password = decryptCredential(credentials.password);
    const code = parsed.data.code.toUpperCase();

    steamClient.steamUser!.once('steamGuard', (_domain: string, callback: (code: string) => void) => {
      callback(code);
    });

    await steamClient.login(credentials.username, password, code);

    delete req.session.credentials;
    delete req.session.needsSteamGuard;

    res.json({ success: true });
  } catch {
    res.status(401).json({ error: 'Invalid Steam Guard code' });
  }
});

router.post('/logout', (_req, res) => {
  logger.info('[Auth] Logging out...');
  steamClient.logout();
  res.json({ success: true });
});

router.get('/status', (_req, res) => {
  res.json(steamClient.getStatus());
});

export default router;
