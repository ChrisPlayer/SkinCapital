import { Router } from 'express';
import { z } from 'zod';
import { steamClient } from '../steam/steam.client.ts';
import { refresh, refreshPrices } from '../inventory/inventory.service.ts';
import { authLimiter } from '../../middleware/security.ts';
import { upsertProfile } from '../../db/queries/profiles.ts';
import { pushEvent } from '../../lib/events.ts';
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

// Shared completion: set the session, persist the profile, kick off the initial
// refresh. Used by the password path, the Steam Guard code path, and the mobile
// approval poll. No credentials are stored — only the resolved steamId.
async function finalizeLogin(
  req: import('express').Request,
  res: import('express').Response,
  username: string,
) {
  const steamId = steamClient.steamUser!.steamID!.getSteamID64();
  const alreadyFinalized = req.session.steamId === steamId;

  if (!alreadyFinalized) {
    // Fresh session id at privilege change (fixation hygiene). regenerate()
    // also drops the transient credentials/needsSteamGuard flags.
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((err) => (err ? reject(err) : resolve())),
    );
  } else {
    delete req.session.credentials;
    delete req.session.needsSteamGuard;
  }
  req.session.steamId = steamId;

  const personaInfo = await steamClient.getPersonaInfo(steamId);
  const profileRow = upsertProfile(steamId, username, personaInfo?.personaName, personaInfo?.avatarUrl);

  if (!alreadyFinalized) {
    logger.info('[Auth] Login successful');
    pushEvent('logged_in', { steamId, personaName: personaInfo?.personaName ?? null });
    refreshPrices(steamId, 'steam', 'missing').catch((err) => {
      logger.error('[Auth] Missing prices check error:', (err as Error).message);
    });
    refresh(steamId).catch((err) => {
      logger.error('[Auth] Initial refresh error:', (err as Error).message);
    });
  }

  return res.json({ success: true, profile: rowToProfile(profileRow) });
}

router.post('/login', authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const { username, password } = parsed.data;

  try {
    logger.info('[Auth] Login attempt received');

    // Username kept in the in-memory session only so the Guard/mobile step can
    // complete the profile; removed again in finalizeLogin. Password is never stored.
    req.session.credentials = { username };

    const outcome = await steamClient.login(username, password);

    if (outcome.status === 'steamguard') {
      req.session.needsSteamGuard = true;
      return res.status(200).json({
        needsSteamGuard: true,
        canConfirmMobile: outcome.canConfirmMobile,
      });
    }

    return await finalizeLogin(req, res, username);
  } catch (err) {
    const message = (err as Error).message;
    logger.error('[Auth] Login failed:', message);
    // Never leave a half-open/authenticated Steam connection behind a failed
    // login (e.g. finalize error after a successful logOn). EXCEPT when this
    // request was rejected because another login is in flight: logging out
    // here would kill that FIRST attempt (including a pending mobile approval).
    if (!message.includes('already in progress')) {
      steamClient.logout();
    }
    delete req.session.credentials;
    delete req.session.needsSteamGuard;
    delete req.session.steamId;

    let errorMsg = 'Login failed';
    if (message.includes('InvalidPassword')) errorMsg = 'Invalid password';
    else if (message.includes('RateLimitExceeded')) errorMsg = 'Too many attempts, try later';
    else if (message.includes('LoggedInElsewhere'))
      errorMsg = 'Steam is open elsewhere — close Steam/CS2 on your PC and try again';

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
    const username = req.session.credentials?.username || 'Unknown';
    try {
      return await finalizeLogin(req, res, username);
    } catch (finalizeErr) {
      // Steam IS logged in at this point — tear it down rather than leaving an
      // orphaned session. (Wrong-code errors above stay retryable: no logout.)
      steamClient.logout();
      throw finalizeErr;
    }
  } catch (err) {
    const message = (err as Error).message;
    logger.error('[Auth] Steam Guard failed:', message);
    let errorMsg = 'Invalid Steam Guard code';
    if (message.includes('LoggedInElsewhere'))
      errorMsg = 'Steam is open elsewhere — close Steam/CS2 on your PC and try again';
    else if (message.includes('timeout')) errorMsg = 'Steam Guard timeout — try the code again';
    res.status(401).json({ error: errorMsg });
  }
});

// Polled by the client while waiting for the user to approve the login in the
// Steam mobile app (no code typed). Resolves once Steam confirms the session.
router.post('/poll', async (req, res) => {
  try {
    // Only the session that actually initiated this login (and is at the Steam
    // Guard step) may adopt it — a stale steamId from a past login is NOT enough.
    const username = req.session.credentials?.username;
    if (!req.session.needsSteamGuard || !username) {
      return res.json({ pending: true });
    }
    if (!steamClient.isLoggedIn || !steamClient.steamUser?.steamID) {
      return res.json({ pending: true });
    }
    return await finalizeLogin(req, res, username);
  } catch (err) {
    logger.error('[Auth] Poll error:', (err as Error).message);
    return res.json({ pending: true });
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
