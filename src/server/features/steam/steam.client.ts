import SteamUser from 'steam-user';
import SteamCommunity from 'steamcommunity';
import GlobalOffensive from 'globaloffensive';
import SteamTotp from 'steam-totp';
import { logger } from '../../lib/logger.ts';

let steamUser: SteamUser | null = null;
let community: SteamCommunity | null = null;
let csgoClient: GlobalOffensive | null = null;
let _isLoggedIn = false;
let _isConnectedToGC = false;

function init() {
  steamUser = new SteamUser({
    autoRelogin: true,
    enablePicsCache: true,
  });

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
    steamUser!.gamesPlayed([730]);
  });

  steamUser.on('error', (err: Error) => {
    logger.error('[Steam] Login error:', err.message);
    _isLoggedIn = false;
  });

  steamUser.on('disconnected', (_eresult: number, msg: string) => {
    logger.info('[Steam] Disconnected:', msg);
    _isLoggedIn = false;
    _isConnectedToGC = false;
  });

  steamUser.on('webSession', (_sessionId: string, cookies: string[]) => {
    logger.info('[Steam] Web session established');
    community!.setCookies(cookies);
  });

  csgoClient.on('connectedToGC', () => {
    logger.info('[CS2] Connected to Game Coordinator');
    _isConnectedToGC = true;
  });

  csgoClient.on('disconnectedFromGC', (reason: number) => {
    logger.info('[CS2] Disconnected from Game Coordinator:', reason);
    _isConnectedToGC = false;
  });

  csgoClient.on('error', (err: Error) => {
    logger.error('[CS2] GC Error:', err);
  });
}

function login(
  username: string,
  password: string,
  sharedSecret: string | null,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!steamUser) {
      init();
    }

    const loginOptions: { accountName: string; password: string; twoFactorCode?: string } = {
      accountName: username,
      password: password,
      twoFactorCode: sharedSecret ? SteamTotp.generateAuthCode(sharedSecret) : undefined,
    };

    logger.info('[Steam] Attempting login...');

    const loginTimeout = setTimeout(() => {
      reject(new Error('Login timeout after 30 seconds'));
    }, 30000);

    const gcTimeout = setTimeout(() => {
      if (_isLoggedIn && !_isConnectedToGC) {
        logger.warn('[CS2] GC connection timeout, continuing without GC');
        resolve();
      }
    }, 60000);

    steamUser!.once('loggedOn', () => {
      clearTimeout(loginTimeout);
    });

    steamUser!.once('error', (err: Error) => {
      clearTimeout(loginTimeout);
      clearTimeout(gcTimeout);
      reject(err);
    });

    csgoClient!.once('connectedToGC', () => {
      clearTimeout(gcTimeout);
      logger.info('[CS2] Ready to fetch inventory');
      resolve();
    });

    steamUser!.logOn(loginOptions);
  });
}

function logout() {
  if (steamUser) {
    steamUser.logOff();
    _isLoggedIn = false;
    _isConnectedToGC = false;
    logger.info('[Steam] Logged out');
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

    const timeout = setTimeout(() => resolve(false), timeoutMs);

    csgoClient!.once('connectedToGC', () => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
}

export const steamClient = {
  init,
  login,
  logout,
  getStatus,
  waitForGC,
  get steamUser() { return steamUser; },
  get community() { return community; },
  get csgoClient() { return csgoClient; },
  get isLoggedIn() { return _isLoggedIn; },
  get isConnectedToGC() { return _isConnectedToGC; },
};
