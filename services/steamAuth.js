const SteamUser = require('steam-user');
const SteamCommunity = require('steamcommunity');
const GlobalOffensive = require('globaloffensive');
const SteamTotp = require('steam-totp');

// Singleton instances
let steamUser = null;
let community = null;
let csgoClient = null;
let isLoggedIn = false;
let isConnectedToGC = false;

/**
 * Initialize Steam client and Game Coordinator
 */
function init() {
    steamUser = new SteamUser({
        autoRelogin: true,
        enablePicsCache: true
    });

    community = new SteamCommunity();
    csgoClient = new GlobalOffensive(steamUser);

    setupEventHandlers();

    return { steamUser, community, csgoClient };
}

/**
 * Setup Steam and CSGO event handlers
 */
function setupEventHandlers() {
    // Steam User Events
    steamUser.on('loggedOn', () => {
        console.log('[Steam] Successfully logged on to Steam');
        isLoggedIn = true;

        // Start CS2 (AppID 730) to connect to Game Coordinator
        steamUser.gamesPlayed([730]);
    });

    steamUser.on('error', (err) => {
        console.error('[Steam] Login error:', err.message);
        isLoggedIn = false;
    });

    steamUser.on('disconnected', (eresult, msg) => {
        console.log('[Steam] Disconnected:', msg);
        isLoggedIn = false;
        isConnectedToGC = false;
    });

    steamUser.on('webSession', (sessionId, cookies) => {
        console.log('[Steam] Web session established');
        community.setCookies(cookies);
    });

    // CS2 Game Coordinator Events
    csgoClient.on('connectedToGC', () => {
        console.log('[CS2] Connected to Game Coordinator');
        isConnectedToGC = true;
    });

    csgoClient.on('disconnectedFromGC', (reason) => {
        console.log('[CS2] Disconnected from Game Coordinator:', reason);
        isConnectedToGC = false;
    });

    csgoClient.on('error', (err) => {
        console.error('[CS2] GC Error:', err);
    });
}

/**
 * Login to Steam with credentials
 * @param {string} username - Steam username
 * @param {string} password - Steam password
 * @param {string} sharedSecret - Steam Guard shared secret for 2FA
 * @returns {Promise<void>}
 */
function login(username, password, sharedSecret) {
    return new Promise((resolve, reject) => {
        if (!steamUser) {
            init();
        }

        const loginOptions = {
            accountName: username,
            password: password,
            twoFactorCode: sharedSecret ? SteamTotp.generateAuthCode(sharedSecret) : undefined
        };

        console.log('[Steam] Attempting login...');

        // Setup one-time handlers for this login attempt
        const loginTimeout = setTimeout(() => {
            reject(new Error('Login timeout after 30 seconds'));
        }, 30000);

        const gcTimeout = setTimeout(() => {
            if (isLoggedIn && !isConnectedToGC) {
                console.warn('[CS2] GC connection timeout, continuing without GC');
                clearTimeout(gcTimeout);
                resolve();
            }
        }, 60000);

        steamUser.once('loggedOn', () => {
            clearTimeout(loginTimeout);
        });

        steamUser.once('error', (err) => {
            clearTimeout(loginTimeout);
            clearTimeout(gcTimeout);
            reject(err);
        });

        csgoClient.once('connectedToGC', () => {
            clearTimeout(gcTimeout);
            console.log('[CS2] Ready to fetch inventory');
            resolve();
        });

        steamUser.logOn(loginOptions);
    });
}

/**
 * Logout from Steam
 */
function logout() {
    if (steamUser) {
        steamUser.logOff();
        isLoggedIn = false;
        isConnectedToGC = false;
        console.log('[Steam] Logged out');
    }
}

/**
 * Get current connection status
 * @returns {Object} Connection status
 */
function getStatus() {
    return {
        isLoggedIn,
        isConnectedToGC,
        steamId: steamUser?.steamID?.getSteamID64() || null
    };
}

/**
 * Wait for GC connection with timeout
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<boolean>}
 */
function waitForGC(timeoutMs = 30000) {
    return new Promise((resolve) => {
        if (isConnectedToGC) {
            resolve(true);
            return;
        }

        const timeout = setTimeout(() => {
            resolve(false);
        }, timeoutMs);

        csgoClient.once('connectedToGC', () => {
            clearTimeout(timeout);
            resolve(true);
        });
    });
}

module.exports = {
    init,
    login,
    logout,
    getStatus,
    waitForGC,
    get steamUser() { return steamUser; },
    get community() { return community; },
    get csgoClient() { return csgoClient; },
    get isLoggedIn() { return isLoggedIn; },
    get isConnectedToGC() { return isConnectedToGC; }
};
