import SteamUser from 'steam-user';
import SteamCommunity from 'steamcommunity';
import GlobalOffensive from 'globaloffensive';
import { LoginSession, EAuthTokenPlatformType, EAuthSessionGuardType } from 'steam-session';
import { logger } from '../../lib/logger.ts';
import { pushEvent } from '../../lib/events.ts';
import { setPhase, getPhaseState } from './steam.status.ts';

let steamUser: SteamUser | null = null;
let community: SteamCommunity | null = null;
let csgoClient: GlobalOffensive | null = null;
// WHY steam-session drives the credentials phase: steam-user's
// logOn({accountName, password}) cancels its internal steam-session polling as
// soon as Steam Guard is required (components/09-logon.js), so approving the
// login in the Steam mobile app would never complete. We authenticate with
// steam-session ourselves (it keeps polling for the phone approval / typed
// code) and then hand steam-user the resulting refresh token.
// Module-level so submitSteamGuardCode() and logout() can reach it.
let _loginSession: LoginSession | null = null;
// In-memory ONLY (dropped at logout/init): lets us take the session back when
// the user's own Steam client kicks us with LoggedInElsewhere right after logon.
let _refreshToken: string | null = null;
let _relogAttempts = 0;
const MAX_RELOG_ATTEMPTS = 3;
// Last-resort mode: the user's PC client is IN-GAME and instantly reclaims the
// game session (LoggedInElsewhere war). Staying logged in WITHOUT gamesPlayed
// avoids the conflict entirely — login + prices work, and the refresh becomes
// a PARTIAL one: the main inventory is replaced while the stored storage-unit
// rows are kept (the GC, hence storage enumeration, is skipped for that login).
let _suppressGamesPlayed = false;
let _isLoggedIn = false;
let _isConnectedToGC = false;
let _steamGuardCallback: ((code: string) => void) | null = null;
let _loginInProgress = false;
let _guardAbandonTimer: NodeJS.Timeout | null = null;

const GUARD_ABANDON_MS = 5 * 60 * 1000;

function clearGuardAbandonTimer() {
  if (_guardAbandonTimer) {
    clearTimeout(_guardAbandonTimer);
    _guardAbandonTimer = null;
  }
}

// If the user abandons the Steam Guard step (closes the tab), don't leave a
// half-open Steam connection waiting forever — tear it down after a grace period.
function armGuardAbandonTimer() {
  clearGuardAbandonTimer();
  _guardAbandonTimer = setTimeout(() => {
    _guardAbandonTimer = null;
    if (_steamGuardCallback && !_isLoggedIn) {
      logger.warn('[Steam] Steam Guard step abandoned — closing the pending connection');
      logout();
    }
  }, GUARD_ABANDON_MS);
}

// Stop any pending steam-session login attempt and drop the session object —
// and with it the refresh token — from memory.
function discardLoginSession() {
  if (_loginSession) {
    try { _loginSession.cancelLoginAttempt(); } catch { /* ignore */ }
    try { _loginSession.removeAllListeners(); } catch { /* ignore */ }
    _loginSession = null;
  }
}

function init() {
  // Tear down any previous client so we never leave an orphaned, auto-relogging
  // Steam session connected in the background.
  if (steamUser) {
    try { steamUser.logOff(); } catch { /* ignore */ }
    try { steamUser.removeAllListeners(); } catch { /* ignore */ }
    try { csgoClient?.removeAllListeners(); } catch { /* ignore */ }
  }
  discardLoginSession();
  _refreshToken = null;
  _relogAttempts = 0;
  _suppressGamesPlayed = false;
  _isLoggedIn = false;
  _isConnectedToGC = false;
  _steamGuardCallback = null;
  clearGuardAbandonTimer();

  // SECURITY: dataDirectory:null → steam-user keeps NOTHING on disk (no sentry /
  // machine-auth / login-key). We never persist any credential anywhere.
  // autoRelogin:true only recovers IN-MEMORY from steam-user's non-fatal
  // disconnects (NoConnection/ServiceUnavailable/TryAnotherCM) during the active
  // fetch window. NOTE: LoggedInElsewhere is FATAL for steam-user (no auto
  // re-login) — it must be handled as a hard failure, not waited out.
  steamUser = new SteamUser({
    autoRelogin: true,
    enablePicsCache: false,
    dataDirectory: null,
  } as ConstructorParameters<typeof SteamUser>[0]);

  community = new SteamCommunity();
  csgoClient = new GlobalOffensive(steamUser);

  setupEventHandlers();
  return { steamUser, community, csgoClient };
}

function setupEventHandlers() {
  if (!steamUser || !csgoClient) return;

  steamUser.on('loggedOn', () => {
    logger.info('[Steam] Successfully logged on to Steam');
    _isLoggedIn = true;
    setPhase(_suppressGamesPlayed ? 'connected' : 'launching_cs2', {
      owner: 'steam',
      steamId: steamUser?.steamID?.getSteamID64() ?? null,
    });
    // The guard step (typed code or mobile approval) is over: stop reporting
    // isAwaitingSteamGuard, disarm the abandon timer, and drop the steam-session
    // object (and with it the refresh token) from memory.
    _steamGuardCallback = null;
    clearGuardAbandonTimer();
    _loginSession = null;
    if (_suppressGamesPlayed) {
      logger.warn('[Steam] Game held by your PC client — staying connected WITHOUT the CS2 GC (storage units skipped this time)');
    } else {
      steamUser!.gamesPlayed([730]);
    }
  });

  steamUser.on('error', (err: Error) => {
    logger.error('[Steam] Login error:', err.message);
    _isLoggedIn = false;
    // The LoggedInElsewhere relog path below keeps the session alive — only a
    // truly fatal error drops the phase back to idle.
    if (!(/LoggedInElsewhere/i.test(err.message) && _refreshToken && _relogAttempts < MAX_RELOG_ATTEMPTS)) {
      setPhase('idle', { owner: 'steam' });
    }
    // Steam open on the user's PC kicks us ~0.5s after logon (LoggedInElsewhere),
    // faster than the client's /auth/poll can observe the logged-in state. We
    // still hold the refresh token in memory — take the session back (bounded,
    // no reset on success, so we can't ping-pong forever with the PC client).
    if (/LoggedInElsewhere/i.test(err.message) && _refreshToken && _relogAttempts < MAX_RELOG_ATTEMPTS) {
      _relogAttempts += 1;
      if (_relogAttempts === MAX_RELOG_ATTEMPTS) {
        // The PC client keeps winning the game session — final attempt connects
        // without claiming CS2 so it can't be kicked again.
        _suppressGamesPlayed = true;
      }
      logger.warn(`[Steam] Kicked by another session — re-logging with the in-memory token (attempt ${_relogAttempts}/${MAX_RELOG_ATTEMPTS}${_suppressGamesPlayed ? ', GC-less' : ''})`);
      setTimeout(() => {
        if (!_refreshToken || _isLoggedIn || !steamUser) return;
        try {
          steamUser.logOn({ refreshToken: _refreshToken } as unknown as Parameters<SteamUser['logOn']>[0]);
        } catch (e) {
          logger.error('[Steam] Re-logon failed:', (e as Error).message);
        }
      }, 2500);
    }
  });

  steamUser.on('disconnected', (_eresult: number, msg: string) => {
    logger.info('[Steam] Disconnected:', msg);
    _isLoggedIn = false;
    _isConnectedToGC = false;
    setPhase('idle', { owner: 'steam' });
  });

  steamUser.on('webSession', (_sessionId: string, cookies: string[]) => {
    logger.info('[Steam] Web session established');
    community!.setCookies(cookies);
  });

  csgoClient.on('connectedToGC', () => {
    logger.info('[CS2] Connected to Game Coordinator');
    _isConnectedToGC = true;
    // Only settle into 'connected' from the CS2 startup phase — never downgrade
    // a fetching_* phase owned by a running refresh.
    if (getPhaseState().phase === 'launching_cs2') {
      setPhase('connected', { owner: 'steam' });
    }
  });

  csgoClient.on('disconnectedFromGC', (reason: number) => {
    logger.info('[CS2] Disconnected from Game Coordinator:', reason);
    _isConnectedToGC = false;
  });

  csgoClient.on('error', (err: Error) => {
    logger.error('[CS2] GC Error:', err.message);
  });
}

export type LoginOutcome = { status: 'ok' } | { status: 'steamguard'; canConfirmMobile: boolean };

function login(username: string, password: string): Promise<LoginOutcome> {
  if (_loginInProgress) {
    return Promise.reject(new Error('A login is already in progress'));
  }
  return new Promise((resolve, reject) => {
    init();
    _loginInProgress = true;
    logger.info('[Steam] Attempting login...');
    setPhase('logging_in', { owner: 'steam' });

    let settled = false;
    // 30s cap for the no-guard path (credentials → authenticated → token logon).
    // When we resolve as 'steamguard' instead, cleanup() clears this timer and
    // the guard-abandon timer takes over.
    const loginTimeout = setTimeout(() => fail(new Error('Login timeout after 30 seconds')), 30000);

    const onLoggedOn = () => succeed();
    const onGC = () => succeed();
    // LoggedInElsewhere is FATAL for steam-user (no auto re-login) — fail fast
    // with an actionable message instead of hanging until the 30s timeout.
    const onError = (err: Error) => fail(err);

    function cleanup() {
      clearTimeout(loginTimeout);
      steamUser?.removeListener('loggedOn', onLoggedOn);
      steamUser?.removeListener('error', onError);
      csgoClient?.removeListener('connectedToGC', onGC);
    }
    function done(outcome: LoginOutcome) {
      if (settled) return;
      settled = true;
      _loginInProgress = false;
      cleanup();
      resolve(outcome);
    }
    function succeed() {
      logger.info('[CS2] Login confirmed');
      done({ status: 'ok' });
    }
    function fail(err: Error) {
      if (settled) return;
      settled = true;
      _loginInProgress = false;
      cleanup();
      // The credentials session is useless after a hard failure — drop it (a
      // resolved 'steamguard' outcome goes through done() and keeps it alive).
      discardLoginSession();
      reject(err);
    }

    steamUser!.once('loggedOn', onLoggedOn);
    steamUser!.on('error', onError);
    csgoClient!.once('connectedToGC', onGC);

    // Phase 1: authenticate the credentials with steam-session.
    const session = new LoginSession(EAuthTokenPlatformType.SteamClient);
    _loginSession = session;
    // steam-session's own polling timeout defaults to 30s — far too short for a
    // phone approval. Align it with our guard-abandon window.
    session.loginTimeout = GUARD_ABANDON_MS;

    session.on('authenticated', () => {
      if (_loginSession !== session) return; // stale session (a new login restarted everything)
      // The guard step is over the moment Steam accepts the approval/code:
      // disarm the abandon timer NOW (not at 'loggedOn') so it can't fire in
      // the 1-3s window between phone approval and the token logon completing.
      clearGuardAbandonTimer();
      _steamGuardCallback = null;
      setPhase('logging_in', { owner: 'steam' });
      // Phase 2: hand steam-user the refresh token. SECURITY: the token only
      // ever lives on the in-memory session object — never logged, never stored.
      logger.info('[Steam] Credentials authenticated — completing logon with refresh token');
      const refreshToken = session.refreshToken;
      _refreshToken = refreshToken ?? null;
      _relogAttempts = 0;
      try {
        if (!refreshToken) throw new Error('No refresh token received from Steam');
        // Local steam.d.ts shim only declares the password shape; steam-user
        // natively supports refresh-token logon (no accountName alongside).
        steamUser!.logOn({ refreshToken } as unknown as Parameters<SteamUser['logOn']>[0]);
      } catch (err) {
        const e = err as Error;
        if (!settled) {
          fail(e);
        } else {
          // Mobile-approval path (login promise already resolved 'steamguard'):
          // don't leave a half-open connection behind.
          logger.error('[Steam] Refresh-token logon failed:', e.message);
          logout();
        }
      }
    });

    session.on('error', (err: Error) => {
      if (_loginSession !== session) return;
      if (!settled) {
        fail(err);
        return;
      }
      logger.error('[Steam] Steam Guard session error:', err.message);
      if (!_isLoggedIn) logout();
    });

    session.on('timeout', () => {
      if (_loginSession !== session) return;
      if (!settled) {
        fail(new Error('Login timeout — Steam Guard approval not received'));
        return;
      }
      if (!_isLoggedIn) {
        logger.warn('[Steam] Steam Guard approval window expired — closing the pending connection');
        logout();
      }
    });

    session
      .startWithCredentials({ accountName: username, password })
      .then((start) => {
        if (settled) return;
        if (!start.actionRequired) {
          // No Steam Guard needed: steam-session polls once, fires
          // 'authenticated' (token logon above), then 'loggedOn'/GC resolves us.
          return;
        }
        const actions = start.validActions ?? [];
        const canConfirmMobile = actions.some((a) => a.type === EAuthSessionGuardType.DeviceConfirmation);
        // DO NOT cancel anything here: steam-session keeps polling on its own,
        // so approving in the Steam mobile app fires 'authenticated' → token
        // logon → _isLoggedIn, which /auth/poll picks up and finalizes.
        // _steamGuardCallback doubles as the isAwaitingSteamGuard() flag and
        // routes a typed code into this same session.
        _steamGuardCallback = (code: string) => {
          session.submitSteamGuardCode(code).catch((err: Error) => {
            logger.error('[Steam] Steam Guard code rejected:', err.message);
          });
        };
        logger.info(`[Steam] Steam Guard required (mobile approval ${canConfirmMobile ? 'available' : 'unavailable'})`);
        armGuardAbandonTimer();
        setPhase('awaiting_steam_guard', { owner: 'steam' });
        done({ status: 'steamguard', canConfirmMobile });
      })
      .catch((err: Error) => fail(err));
  });
}

/** True while a login is waiting for a Steam Guard code or mobile approval. */
function isAwaitingSteamGuard(): boolean {
  return _steamGuardCallback !== null;
}

function submitSteamGuardCode(code: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const session = _loginSession;
    if (!session || !_steamGuardCallback) {
      reject(new Error('No Steam Guard callback pending'));
      return;
    }
    clearGuardAbandonTimer();

    let settled = false;
    const loginTimeout = setTimeout(() => {
      // Steam never answered: keep the guard step retryable instead of telling
      // the user (wrongly) that the code was invalid.
      fail(new Error('Steam Guard timeout — try again'));
    }, 45000);

    const onLoggedOn = () => succeed();
    const onGC = () => succeed();
    // LoggedInElsewhere is fatal for steam-user — surface it instead of hanging.
    const onError = (err: Error) => fail(err);

    function cleanup() {
      clearTimeout(loginTimeout);
      steamUser?.removeListener('loggedOn', onLoggedOn);
      steamUser?.removeListener('error', onError);
      csgoClient?.removeListener('connectedToGC', onGC);
    }
    function succeed() {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    }
    function fail(err: Error) {
      if (settled) return;
      settled = true;
      cleanup();
      // Keep the guard step retryable: _steamGuardCallback stays set and the
      // steam-session attempt is still alive (it accepts a resubmitted code
      // after a wrong one — TwoFactorCodeMismatch/InvalidLoginAuthCode don't
      // cancel its polling). Re-arm the abandon timer so an abandoned retry
      // still gets torn down.
      if (!_isLoggedIn) armGuardAbandonTimer();
      reject(err);
    }

    steamUser!.once('loggedOn', onLoggedOn);
    steamUser!.on('error', onError);
    csgoClient!.once('connectedToGC', onGC);

    logger.info('[Steam] Submitting Steam Guard code...');
    // On success, the session fires 'authenticated' → refresh-token logon (see
    // login()) → 'loggedOn' resolves us. On a wrong code, the rejection maps to
    // a retryable 401 upstream while the session keeps accepting new codes.
    session.submitSteamGuardCode(code).catch((err: Error) => fail(err));
  });
}

function getPersonaInfo(steamId64: string): Promise<{ personaName: string; avatarUrl: string } | null> {
  return new Promise((resolve) => {
    if (!steamUser) return resolve(null);

    steamUser.getPersonas([steamId64], (err: Error | null, personas: Record<string, { player_name?: string; avatar_url_full?: string; avatar_url_medium?: string; avatar_hash?: Buffer }>) => {
      if (err || !personas || !personas[steamId64]) {
        logger.warn('[Steam] Could not fetch persona info:', err?.message || 'no data');
        return resolve(null);
      }

      const p = personas[steamId64];
      const personaName = p.player_name || '';

      let avatarUrl = '';
      if (p.avatar_url_full) {
        avatarUrl = p.avatar_url_full;
      } else if (p.avatar_url_medium) {
        avatarUrl = p.avatar_url_medium;
      } else if (p.avatar_hash) {
        const hash = Buffer.isBuffer(p.avatar_hash) ? p.avatar_hash.toString('hex') : String(p.avatar_hash);
        if (hash && !hash.match(/^0+$/)) {
          avatarUrl = `https://avatars.cloudflare.steamstatic.com/${hash}_full.jpg`;
        }
      }

      logger.info(`[Steam] Persona: ${personaName}, Avatar: ${avatarUrl ? 'yes' : 'none'}`);
      resolve({ personaName, avatarUrl });
    });
  });
}

function logout() {
  const wasLoggedIn = _isLoggedIn;
  // Also abort any pending steam-session login attempt (mobile approval still
  // polling, guard code never submitted, …) and drop the token from memory.
  discardLoginSession();
  _refreshToken = null;
  _relogAttempts = 0;
  _suppressGamesPlayed = false;
  if (steamUser) {
    try { steamUser.logOff(); } catch { /* ignore */ }
    try { steamUser.removeAllListeners(); } catch { /* ignore */ }
    try { csgoClient?.removeAllListeners(); } catch { /* ignore */ }
    _isLoggedIn = false;
    _isConnectedToGC = false;
    _steamGuardCallback = null;
    _loginInProgress = false;
    clearGuardAbandonTimer();
    logger.info('[Steam] Logged out');
  }
  // No-op while a refresh owns the phase (mid-refresh disconnect is expected).
  setPhase('idle', { owner: 'steam' });
  if (wasLoggedIn) {
    pushEvent('logged_out', {});
  }
}

function getStatus() {
  return {
    isLoggedIn: _isLoggedIn,
    isConnectedToGC: _isConnectedToGC,
    steamId: steamUser?.steamID?.getSteamID64() || null,
  };
}

function waitForGC(timeoutMs = 30000): Promise<boolean> {
  return new Promise((resolve) => {
    if (_isConnectedToGC) {
      resolve(true);
      return;
    }
    const onGC = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    const timeout = setTimeout(() => {
      csgoClient?.removeListener('connectedToGC', onGC);
      resolve(false);
    }, timeoutMs);
    csgoClient!.once('connectedToGC', onGC);
  });
}

export const steamClient = {
  init,
  login,
  submitSteamGuardCode,
  isAwaitingSteamGuard,
  getPersonaInfo,
  logout,
  getStatus,
  waitForGC,
  get steamUser() { return steamUser; },
  get community() { return community; },
  get csgoClient() { return csgoClient; },
  get isLoggedIn() { return _isLoggedIn; },
  get isGamesPlayedSuppressed() { return _suppressGamesPlayed; },
  get isConnectedToGC() { return _isConnectedToGC; },
};
