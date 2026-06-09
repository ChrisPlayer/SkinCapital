/**
 * Runtime pricing configuration (settable from the web UI, persisted in the DB).
 * The DB value overrides the .env defaults. Proxies (which contain credentials)
 * are stored ENCRYPTED at rest (AES-256-GCM, key derived from SESSION_SECRET).
 * On change, registered listeners run (used to rebuild the Steam proxy pool).
 */
import { getSetting, setSetting, deleteSetting } from '../../db/queries/settings.ts';
import { encrypt, decrypt } from '../../lib/crypto.ts';
import { logger } from '../../lib/logger.ts';

export type PricingMode = 'auto' | 'proxy' | 'direct';
export type ResolvedPricingMode = 'proxy' | 'direct';

export interface PricingConfig {
  mode: PricingMode;
  proxies: string[];
}

const SETTINGS_KEY = 'pricing';
const CRYPTO_SECRET = process.env.SESSION_SECRET || '';

const ENV_PROXIES = (process.env.STEAM_PROXIES || '')
  .split(/[\n,]/)
  .map((s) => s.trim())
  .filter(Boolean);

const ENV_MODE: PricingMode = (() => {
  const m = (process.env.STEAM_PRICING_MODE || 'auto').toLowerCase();
  return m === 'proxy' || m === 'direct' ? m : 'auto';
})();

let config: PricingConfig = { mode: ENV_MODE, proxies: ENV_PROXIES };
let loaded = false;
const listeners: Array<() => void> = [];

function notify(): void {
  for (const cb of listeners) {
    try {
      cb();
    } catch (err) {
      logger.warn('[Pricing] config listener error:', (err as Error).message);
    }
  }
}

/** Load persisted config from the DB (call once after initDb). Falls back to env. */
export function loadPricingConfig(): void {
  try {
    const raw = getSetting(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { mode?: string; proxies?: unknown; proxiesEnc?: string };
      const mode: PricingMode =
        parsed.mode === 'proxy' || parsed.mode === 'direct' || parsed.mode === 'auto' ? parsed.mode : ENV_MODE;

      let proxies: string[] = ENV_PROXIES;
      if (typeof parsed.proxiesEnc === 'string' && CRYPTO_SECRET) {
        try {
          const decoded = JSON.parse(decrypt(parsed.proxiesEnc, CRYPTO_SECRET));
          if (Array.isArray(decoded)) proxies = decoded.filter(Boolean);
        } catch {
          logger.warn('[Pricing] Could not decrypt stored proxies (SESSION_SECRET changed?); falling back to .env.');
        }
      } else if (Array.isArray(parsed.proxies)) {
        proxies = (parsed.proxies as unknown[]).map(String).filter(Boolean);
      }

      config = { mode, proxies };
    }
  } catch (err) {
    logger.warn('[Pricing] Failed to load pricing settings, using env defaults:', (err as Error).message);
  }
  loaded = true;
  logger.info(`[Pricing] Config: mode=${config.mode} (resolved ${getResolvedMode()}), proxies=${config.proxies.length}`);
}

export function getPricingConfig(): PricingConfig {
  if (!loaded) loadPricingConfig();
  return config;
}

export function getResolvedMode(): ResolvedPricingMode {
  const c = getPricingConfig();
  if (c.mode === 'proxy') return 'proxy';
  if (c.mode === 'direct') return 'direct';
  return c.proxies.length > 0 ? 'proxy' : 'direct'; // auto
}

export function getConfiguredProxies(): string[] {
  return getPricingConfig().proxies;
}

/** Persist (proxies encrypted) + apply new config, then notify listeners. */
export function setPricingConfig(next: { mode?: PricingMode; proxies?: string[] }): PricingConfig {
  const current = getPricingConfig();
  config = {
    mode: next.mode ?? current.mode,
    proxies: next.proxies ? next.proxies.map((p) => p.trim()).filter(Boolean) : current.proxies,
  };

  const stored: { mode: PricingMode; proxiesEnc?: string; proxies?: string[] } = { mode: config.mode };
  if (CRYPTO_SECRET) {
    stored.proxiesEnc = encrypt(JSON.stringify(config.proxies), CRYPTO_SECRET);
  } else {
    stored.proxies = config.proxies;
    logger.warn('[Pricing] SESSION_SECRET not set — storing proxies UNENCRYPTED.');
  }
  setSetting(SETTINGS_KEY, JSON.stringify(stored));

  logger.info(`[Pricing] Config updated: mode=${config.mode} (resolved ${getResolvedMode()}), proxies=${config.proxies.length}`);
  notify();
  return config;
}

/** Forget the DB override and revert to the .env defaults. */
export function clearPricingConfig(): PricingConfig {
  deleteSetting(SETTINGS_KEY);
  config = { mode: ENV_MODE, proxies: ENV_PROXIES };
  logger.info('[Pricing] Config reset to .env defaults.');
  notify();
  return config;
}

export function onPricingConfigChange(cb: () => void): void {
  listeners.push(cb);
}
