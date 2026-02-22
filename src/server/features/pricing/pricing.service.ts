import axios from 'axios';
import { csfloatQueue } from './pricing.queue.ts';
import {
  acquireSteamProxyWorker,
  ensureSteamProxyPool,
  getSteamCooldownRemainingMs,
  getSteamProxyPoolStats,
  getSteamProxyConfig,
  markSteamDirectWorkersRateLimited,
  markSteamWorkerNetworkFailure,
  markSteamWorkerProxyRejected,
  markSteamWorkerRateLimited,
  markSteamWorkerSuccess,
  releaseSteamProxyWorker,
  type SteamProxyWorker,
} from './steam.proxy-pool.ts';
import { insertPrice, getCachedPriceRows } from '../../db/queries/prices.ts';
import { logger } from '../../lib/logger.ts';
import type { Price } from '../../../shared/types/inventory.ts';

export type PriceSource = 'steam' | 'csfloat';
export type PriceFetchReason = 'fresh' | 'no_price' | 'no_worker' | 'rate_limited' | 'exhausted' | 'error';
type SourceTimestamps = Record<PriceSource, string | null>;
type CachedPriceState = Price & { sourceTimestamps: SourceTimestamps };
export interface FreshPriceRefreshResult {
  freshPrice: number | null;
  stalePrice: number | null;
  reason: PriceFetchReason;
  cooldownMs: number;
}
export interface SteamWorkerPoolSnapshot {
  totalWorkers: number;
  proxyWorkers: number;
  directWorkers: number;
  readyWorkers: number;
  busyWorkers: number;
  coolingWorkers: number;
}
interface SteamFetchResult {
  price: number | null;
  reason: PriceFetchReason;
  cooldownMs: number;
}

const inFlightSteamPrices = new Map<string, Promise<number | null>>();
const inFlightSteamPriceResults = new Map<string, Promise<SteamFetchResult>>();
const inFlightCsfloatPrices = new Map<string, Promise<number | null>>();

const PRICE_CACHE_TTL_HOURS = parseFloat(process.env.PRICE_CACHE_TTL_HOURS || '20');
const CSFLOAT_ENABLED = (process.env.CSFLOAT_ENABLED || 'true').toLowerCase() !== 'false';
const CSFLOAT_USD_TO_EUR = parseFloat(process.env.CSFLOAT_USD_TO_EUR || '0.92');
const CSFLOAT_TIMEOUT_MS = parseInt(process.env.CSFLOAT_TIMEOUT_MS || '10000', 10);
const CSFLOAT_API_KEY = (process.env.CSFLOAT_API_KEY || '').trim();
const STEAM_RATE_LIMIT_COOLDOWN_MS = parseInt(process.env.STEAM_RATE_LIMIT_COOLDOWN_MS || '60000', 10);
const STEAM_PROXY_REQUEST_ATTEMPTS = Math.max(
  1,
  parseInt(process.env.STEAM_PROXY_REQUEST_ATTEMPTS || '4', 10),
);
const CSFLOAT_RATE_LIMIT_COOLDOWN_MS = Math.max(
  60000,
  parseInt(process.env.CSFLOAT_RATE_LIMIT_COOLDOWN_MS || '60000', 10),
);
const CSFLOAT_RATE_LIMIT_MAX_COOLDOWN_MS = Math.max(
  CSFLOAT_RATE_LIMIT_COOLDOWN_MS,
  parseInt(process.env.CSFLOAT_RATE_LIMIT_MAX_COOLDOWN_MS || '300000', 10),
);
const CSFLOAT_FORBIDDEN_COOLDOWN_MS = parseInt(process.env.CSFLOAT_FORBIDDEN_COOLDOWN_MS || '300000', 10);

let steamOverviewFallbackNoticeUntil = 0;
let steamNoWorkerLogWindowUntil = 0;
let steamNoWorkerMissesInWindow = 0;
let csfloatRateLimitedUntil = 0;
let csfloatForbiddenUntil = 0;
let csfloatForbiddenLogged = false;
let csfloatRateLimitStreak = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(retryAfterHeader: unknown): number | null {
  if (typeof retryAfterHeader === 'number' && Number.isFinite(retryAfterHeader) && retryAfterHeader > 0) {
    return retryAfterHeader * 1000;
  }
  if (typeof retryAfterHeader !== 'string') {
    return null;
  }

  const asSeconds = Number(retryAfterHeader);
  if (Number.isFinite(asSeconds) && asSeconds > 0) {
    return asSeconds * 1000;
  }

  const asDate = Date.parse(retryAfterHeader);
  if (Number.isNaN(asDate)) {
    return null;
  }

  const delta = asDate - Date.now();
  return delta > 0 ? delta : null;
}

function computeCsfloatRateLimitCooldownMs(retryAfterMs: number | null): number {
  const baseCooldown = Math.max(CSFLOAT_RATE_LIMIT_COOLDOWN_MS, retryAfterMs ?? 0);
  const backoffMultiplier = 2 ** Math.min(csfloatRateLimitStreak, 4);
  return Math.min(baseCooldown * backoffMultiplier, CSFLOAT_RATE_LIMIT_MAX_COOLDOWN_MS);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeSteamCooldownMs(retryAfterMs: number | null): number {
  return Math.max(STEAM_RATE_LIMIT_COOLDOWN_MS, retryAfterMs ?? 0);
}

function parseSteamPrice(priceStr: string): number {
  let cleaned = priceStr
    .replace(/[€$£]/g, '')
    .replace(/\s/g, '')
    .trim();

  if (cleaned.includes(',') && cleaned.includes('.')) {
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      cleaned = cleaned.replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  }

  return parseFloat(cleaned) || 0;
}

function parseSteamRenderPrice(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;

  const data = payload as {
    lowest_sell_order?: unknown;
    listinginfo?: Record<string, unknown>;
  };

  const lowestSellOrder = Number(data.lowest_sell_order);
  if (Number.isFinite(lowestSellOrder) && lowestSellOrder > 0) {
    return round2(lowestSellOrder / 100);
  }

  if (!data.listinginfo || typeof data.listinginfo !== 'object') {
    return null;
  }

  let bestTotalCents = Number.POSITIVE_INFINITY;
  for (const rawListing of Object.values(data.listinginfo)) {
    if (!rawListing || typeof rawListing !== 'object') continue;
    const listing = rawListing as {
      converted_price?: unknown;
      converted_fee?: unknown;
    };
    const convertedPrice = Number(listing.converted_price);
    const convertedFee = Number(listing.converted_fee);
    if (!Number.isFinite(convertedPrice) || !Number.isFinite(convertedFee)) continue;
    const totalCents = convertedPrice + convertedFee;
    if (totalCents > 0 && totalCents < bestTotalCents) {
      bestTotalCents = totalCents;
    }
  }

  if (!Number.isFinite(bestTotalCents)) {
    return null;
  }
  return round2(bestTotalCents / 100);
}

function isSteamRetryableStatus(status: number | undefined): boolean {
  if (!status) return true;
  if (status === 429) return true;
  if (status >= 500) return true;
  return false;
}

function isSteamProxyRejectedStatus(status: number | undefined): boolean {
  return status === 403 || status === 407;
}

async function getSteamMarketPriceFromRender(
  marketHashName: string,
  worker: SteamProxyWorker,
): Promise<number | null> {
  const url = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}/render/`;
  const response = await axios.get(url, {
    timeout: 15000,
    proxy: getSteamProxyConfig(worker),
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    params: {
      query: '',
      start: 0,
      count: 20,
      currency: 3,
      language: 'english',
    },
  });

  const price = parseSteamRenderPrice(response.data);
  if (price !== null) {
    logger.debug(`[Price] Steam(render:${worker.id}): ${marketHashName} = €${price.toFixed(2)}`);
  } else {
    logger.debug(`[Price] Steam render(${worker.id}): no price data for ${marketHashName}`);
  }
  return price;
}

async function getSteamMarketPriceDetailed(marketHashName: string): Promise<SteamFetchResult> {
  await ensureSteamProxyPool();
  let sawRateLimit = false;
  let sawHardError = false;

  for (let attempt = 1; attempt <= STEAM_PROXY_REQUEST_ATTEMPTS; attempt++) {
    const worker = await acquireSteamProxyWorker();
    if (!worker) {
      steamNoWorkerMissesInWindow += 1;
      const now = Date.now();
      if (now >= steamNoWorkerLogWindowUntil) {
        const cooldownSec = Math.ceil(getSteamCooldownRemainingMs() / 1000);
        logger.warn(
          `[Price] No Steam worker available for ${marketHashName} (misses ${steamNoWorkerMissesInWindow}/5s, next-ready ${cooldownSec}s).`,
        );
        steamNoWorkerMissesInWindow = 0;
        steamNoWorkerLogWindowUntil = now + 5000;
      }
      return {
        price: null,
        reason: 'no_worker',
        cooldownMs: getSteamCooldownRemainingMs(),
      };
    }

    let overviewRateLimited = false;
    let overviewAttempted = false;
    let retryableFailure = false;
    let workerRejected = false;

    try {
      try {
        if (Date.now() >= worker.overviewDisabledUntil) {
          overviewAttempted = true;
          const url = `https://steamcommunity.com/market/priceoverview/?appid=730&market_hash_name=${encodeURIComponent(marketHashName)}&currency=3`;

          const response = await axios.get(url, {
            timeout: 15000,
            proxy: getSteamProxyConfig(worker),
            headers: {
              Accept: 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
          });

          if (response.data?.success && response.data?.lowest_price) {
            const price = parseSteamPrice(response.data.lowest_price);
            markSteamWorkerSuccess(worker);
            logger.debug(`[Price] Steam(${worker.id}): ${marketHashName} = \u20ac${price.toFixed(2)}`);
            return {
              price,
              reason: 'fresh',
              cooldownMs: 0,
            };
          }
          logger.debug(
            `[Price] Steam overview(${worker.id}): no data for ${marketHashName} (success=${response.data?.success}, has_price=${!!response.data?.lowest_price})`,
          );
        }
      } catch (err: unknown) {
        const axiosErr = err as {
          response?: { status?: number; headers?: Record<string, string | number | undefined> };
          message?: string;
        };
        const status = axiosErr.response?.status;
        if (status === 429) {
          overviewRateLimited = true;
          sawRateLimit = true;
          const retryAfterMs = parseRetryAfterMs(axiosErr.response?.headers?.['retry-after']);
          const cooldownMs = computeSteamCooldownMs(retryAfterMs);
          markSteamWorkerRateLimited(worker, cooldownMs, { overviewOnly: true });
          if (worker.isDirect) {
            markSteamDirectWorkersRateLimited(cooldownMs, { overviewOnly: true });
          }
          logger.warn(
            `[Price] Steam overview rate limited for ${marketHashName} on ${worker.id}, cooldown ${(cooldownMs / 1000).toFixed(0)}s (attempt ${attempt}/${STEAM_PROXY_REQUEST_ATTEMPTS}).`,
          );
          retryableFailure = true;
        } else if (isSteamProxyRejectedStatus(status)) {
          markSteamWorkerProxyRejected(worker);
          workerRejected = true;
          retryableFailure = true;
          logger.debug(`[Price] Steam overview proxy rejected (${status}) for ${marketHashName} via ${worker.id}`);
        } else if (isSteamRetryableStatus(status)) {
          markSteamWorkerNetworkFailure(worker);
          retryableFailure = true;
        } else {
          sawHardError = true;
          logger.error(`[Price] Steam overview error for ${marketHashName} via ${worker.id}:`, axiosErr.message);
        }
      }

      if (!workerRejected) {
        try {
          const fallbackPrice = await getSteamMarketPriceFromRender(marketHashName, worker);
          if (fallbackPrice !== null) {
            if (overviewRateLimited && Date.now() >= steamOverviewFallbackNoticeUntil) {
              logger.warn('[Price] Steam priceoverview is rate-limited. Using listings render fallback.');
              steamOverviewFallbackNoticeUntil = Date.now() + 30000;
            }
            markSteamWorkerSuccess(worker);
            return {
              price: fallbackPrice,
              reason: 'fresh',
              cooldownMs: 0,
            };
          }
          if (!overviewAttempted) {
            retryableFailure = true;
          }
          if (!retryableFailure) {
            markSteamWorkerSuccess(worker);
            logger.debug(`[Price] Steam: no price from any endpoint for ${marketHashName}`);
            return {
              price: null,
              reason: sawHardError ? 'error' : 'no_price',
              cooldownMs: getSteamCooldownRemainingMs(),
            };
          }
        } catch (err: unknown) {
          const axiosErr = err as {
            response?: { status?: number; headers?: Record<string, string | number | undefined> };
            message?: string;
          };
          const status = axiosErr.response?.status;
          if (status === 429) {
            sawRateLimit = true;
            const retryAfterMs = parseRetryAfterMs(axiosErr.response?.headers?.['retry-after']);
            const cooldownMs = computeSteamCooldownMs(retryAfterMs);
            markSteamWorkerRateLimited(worker, cooldownMs);
            if (worker.isDirect) {
              markSteamDirectWorkersRateLimited(cooldownMs);
            }
            retryableFailure = true;
            logger.warn(
              `[Price] Steam render rate limited for ${marketHashName} on ${worker.id}, cooldown ${(cooldownMs / 1000).toFixed(0)}s (attempt ${attempt}/${STEAM_PROXY_REQUEST_ATTEMPTS}).`,
            );
          } else if (isSteamProxyRejectedStatus(status)) {
            markSteamWorkerProxyRejected(worker);
            retryableFailure = true;
            logger.debug(`[Price] Steam render proxy rejected (${status}) for ${marketHashName} via ${worker.id}`);
          } else if (isSteamRetryableStatus(status)) {
            markSteamWorkerNetworkFailure(worker);
            retryableFailure = true;
          } else {
            sawHardError = true;
            logger.error(`[Price] Steam render error for ${marketHashName} via ${worker.id}:`, axiosErr.message);
          }
        }
      }
    } finally {
      releaseSteamProxyWorker(worker);
    }

    if (!retryableFailure) {
      return {
        price: null,
        reason: sawHardError ? 'error' : 'no_price',
        cooldownMs: getSteamCooldownRemainingMs(),
      };
    }
  }

  const cooldownRemainingMs = getSteamCooldownRemainingMs();
  logger.warn(
    `[Price] Steam: exhausted proxy retries for ${marketHashName} after ${STEAM_PROXY_REQUEST_ATTEMPTS} attempts (cooldown ${Math.ceil(cooldownRemainingMs / 1000)}s).`,
  );
  return {
    price: null,
    reason: sawRateLimit || cooldownRemainingMs > 0 ? 'rate_limited' : 'exhausted',
    cooldownMs: cooldownRemainingMs,
  };
}

async function getSteamMarketPrice(marketHashName: string): Promise<number | null> {
  const detailed = await getSteamMarketPriceDetailed(marketHashName);
  return detailed.price;
}

const WEAR_PATTERN = /\((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/;

function isCsfloatPriceable(marketHashName: string): boolean {
  return WEAR_PATTERN.test(marketHashName);
}

async function getCsfloatMarketPrice(marketHashName: string): Promise<number | null> {
  if (!CSFLOAT_ENABLED) return null;
  if (!isCsfloatPriceable(marketHashName)) return null;
  if (Date.now() < csfloatRateLimitedUntil) {
    await sleep(Math.max(0, csfloatRateLimitedUntil - Date.now()));
  }
  if (Date.now() < csfloatForbiddenUntil) return null;

  return csfloatQueue.add(async () => {
    const authHeaders: Array<Record<string, string>> = CSFLOAT_API_KEY
      ? CSFLOAT_API_KEY.toLowerCase().startsWith('bearer ')
        ? [{ Authorization: CSFLOAT_API_KEY }, { Authorization: CSFLOAT_API_KEY.slice(7).trim() }]
        : [{ Authorization: CSFLOAT_API_KEY }, { Authorization: `Bearer ${CSFLOAT_API_KEY}` }]
      : [{}];

    let lastErr: unknown = null;
    try {
      for (let i = 0; i < authHeaders.length; i++) {
        const authHeader = authHeaders[i];
        try {
          const response = await axios.get('https://csfloat.com/api/v1/listings', {
            timeout: CSFLOAT_TIMEOUT_MS,
            headers: {
              Accept: 'application/json',
              ...authHeader,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            params: {
              market_hash_name: marketHashName,
              type: 'buy_now',
              sort_by: 'lowest_price',
              limit: 5,
            },
          });

          const listings = Array.isArray(response.data)
            ? response.data
            : Array.isArray(response.data?.data)
              ? response.data.data
              : [];

          const listingPricesCents = listings
            .map((listing: { price?: unknown }) => Number(listing.price))
            .filter((value: number) => Number.isFinite(value) && value > 0);

          // Any successful response resets the rate-limit streak.
          csfloatRateLimitStreak = 0;
          if (listingPricesCents.length === 0) {
            return null;
          }

          const lowestUsdCents = Math.min(...listingPricesCents);
          const eurPrice = round2((lowestUsdCents / 100) * CSFLOAT_USD_TO_EUR);
          logger.debug(`[Price] CSFloat: ${marketHashName} = \u20ac${eurPrice.toFixed(2)}`);
          return eurPrice;
        } catch (err: unknown) {
          const axiosErr = err as { response?: { status?: number }; message?: string };
          lastErr = err;
          // Try the next auth format on unauthorized/forbidden.
          if ((axiosErr.response?.status === 401 || axiosErr.response?.status === 403) && i < authHeaders.length - 1) {
            continue;
          }
          throw err;
        }
      }

      return null;
    } catch (err: unknown) {
      const axiosErr = (err ?? lastErr) as {
        response?: { status?: number; headers?: Record<string, string | number | undefined> };
        message?: string;
      };
      if (axiosErr.response?.status === 429) {
        const retryAfterMs = parseRetryAfterMs(axiosErr.response?.headers?.['retry-after']);
        const cooldownMs = computeCsfloatRateLimitCooldownMs(retryAfterMs);
        csfloatRateLimitedUntil = Date.now() + cooldownMs;
        csfloatRateLimitStreak += 1;
        logger.warn(
          `[Price] CSFloat rate limited, cooldown ${(cooldownMs / 1000).toFixed(0)}s (streak ${csfloatRateLimitStreak}).`,
        );
        return null;
      }
      if (axiosErr.response?.status === 401 || axiosErr.response?.status === 403) {
        csfloatForbiddenUntil = Date.now() + CSFLOAT_FORBIDDEN_COOLDOWN_MS;
        if (!csfloatForbiddenLogged) {
          const hint = CSFLOAT_API_KEY
            ? 'Check CSFLOAT_API_KEY validity/format.'
            : 'Set CSFLOAT_API_KEY in .env.';
          logger.warn(`[Price] CSFloat unauthorized/forbidden (401/403). ${hint}`);
          logger.warn(`[Price] CSFloat cooldown ${(CSFLOAT_FORBIDDEN_COOLDOWN_MS / 1000).toFixed(0)}s to avoid request spam.`);
          csfloatForbiddenLogged = true;
        }
        return null;
      }
      logger.warn(`[Price] CSFloat error for ${marketHashName}: ${axiosErr.message || 'unknown error'}`);
      return null;
    }
  }) as Promise<number | null>;
}

async function getSteamMarketPriceDedup(marketHashName: string): Promise<number | null> {
  const existing = inFlightSteamPrices.get(marketHashName);
  if (existing) {
    return existing;
  }

  const request = getSteamMarketPrice(marketHashName)
    .finally(() => {
      inFlightSteamPrices.delete(marketHashName);
    });

  inFlightSteamPrices.set(marketHashName, request);
  return request;
}

async function getSteamMarketPriceDedupDetailed(marketHashName: string): Promise<SteamFetchResult> {
  const existing = inFlightSteamPriceResults.get(marketHashName);
  if (existing) {
    return existing;
  }

  const request = getSteamMarketPriceDetailed(marketHashName)
    .finally(() => {
      inFlightSteamPriceResults.delete(marketHashName);
    });

  inFlightSteamPriceResults.set(marketHashName, request);
  return request;
}

async function getCsfloatMarketPriceDedup(marketHashName: string): Promise<number | null> {
  const existing = inFlightCsfloatPrices.get(marketHashName);
  if (existing) {
    return existing;
  }

  const request = getCsfloatMarketPrice(marketHashName)
    .finally(() => {
      inFlightCsfloatPrices.delete(marketHashName);
    });

  inFlightCsfloatPrices.set(marketHashName, request);
  return request;
}

function getCachedPriceState(marketHashName: string): CachedPriceState {
  const prices: CachedPriceState = {
    steam: null,
    csfloat: null,
    average: null,
    timestamp: null,
    sourceTimestamps: { steam: null, csfloat: null },
  };

  const rows = getCachedPriceRows(marketHashName);
  for (const row of rows) {
    if (prices.timestamp === null) {
      prices.timestamp = row.timestamp;
    }
    if (row.source === 'steam' && prices.steam === null) {
      prices.steam = row.price_eur;
      prices.sourceTimestamps.steam = row.timestamp;
    }
    if (row.source === 'csfloat' && prices.csfloat === null) {
      prices.csfloat = row.price_eur;
      prices.sourceTimestamps.csfloat = row.timestamp;
    }
  }

  prices.average = prices.steam ?? prices.csfloat;
  return prices;
}

export function getCachedPrices(marketHashName: string): Price {
  const cached = getCachedPriceState(marketHashName);
  return {
    steam: cached.steam,
    csfloat: cached.csfloat,
    average: cached.average,
    timestamp: cached.timestamp,
  };
}

function getPriceForSource(prices: Price, source: PriceSource): number | null {
  return source === 'csfloat' ? prices.csfloat : prices.steam;
}

async function fetchPriceBySource(marketHashName: string, source: PriceSource): Promise<number | null> {
  if (source === 'csfloat') {
    return getCsfloatMarketPriceDedup(marketHashName);
  }
  return getSteamMarketPriceDedup(marketHashName);
}

async function fetchPriceBySourceDetailed(
  marketHashName: string,
  source: PriceSource,
): Promise<{ price: number | null; reason: PriceFetchReason; cooldownMs: number }> {
  if (source === 'csfloat') {
    const price = await getCsfloatMarketPriceDedup(marketHashName);
    const cooldownMs = getSourceCooldownRemainingMs('csfloat');
    return {
      price,
      reason: price !== null ? 'fresh' : 'no_price',
      cooldownMs,
    };
  }

  const steam = await getSteamMarketPriceDedupDetailed(marketHashName);
  return {
    price: steam.price,
    reason: steam.price !== null ? 'fresh' : steam.reason,
    cooldownMs: steam.cooldownMs,
  };
}

export async function refreshPriceWithoutStaleFallback(
  marketHashName: string,
  source: PriceSource,
): Promise<FreshPriceRefreshResult> {
  const cachedState = getCachedPriceState(marketHashName);
  const { sourceTimestamps, ...cached } = cachedState;
  void sourceTimestamps;
  const staleSourcePrice = getPriceForSource(cached, source);

  const fetched = await fetchPriceBySourceDetailed(marketHashName, source);
  if (fetched.price !== null) {
    insertPrice(marketHashName, source, fetched.price);
    return {
      freshPrice: fetched.price,
      stalePrice: staleSourcePrice,
      reason: 'fresh',
      cooldownMs: 0,
    };
  }

  return {
    freshPrice: null,
    stalePrice: staleSourcePrice,
    reason: fetched.reason,
    cooldownMs: fetched.cooldownMs,
  };
}

export function getSourceCooldownRemainingMs(source: PriceSource): number {
  if (source === 'steam') {
    return getSteamCooldownRemainingMs();
  }

  const now = Date.now();
  const rateLimitedMs = Math.max(0, csfloatRateLimitedUntil - now);
  const forbiddenMs = Math.max(0, csfloatForbiddenUntil - now);
  return Math.max(rateLimitedMs, forbiddenMs);
}

export async function getSteamWorkerPoolSnapshot(): Promise<SteamWorkerPoolSnapshot> {
  await ensureSteamProxyPool();
  return getSteamProxyPoolStats();
}

export async function getPrices(
  marketHashName: string,
  force = false,
  source: PriceSource = 'steam',
): Promise<Price> {
  const cachedState = getCachedPriceState(marketHashName);
  const { sourceTimestamps, ...cached } = cachedState;
  const cachedSourcePrice = getPriceForSource(cached, source);
  const cachedSourceTimestamp = sourceTimestamps[source];

  if (!force && cachedSourcePrice !== null && cachedSourceTimestamp) {
    let cacheTime: Date;
    try {
      cacheTime = new Date(cachedSourceTimestamp + (cachedSourceTimestamp.includes('Z') ? '' : 'Z'));
    } catch {
      cacheTime = new Date();
    }

    const ageHours = (Date.now() - cacheTime.getTime()) / (1000 * 60 * 60);
    if (ageHours < PRICE_CACHE_TTL_HOURS) {
      return { ...cached, average: cachedSourcePrice };
    }
    logger.debug(
      `[Price] Cache stale for ${marketHashName}/${source} (${ageHours.toFixed(1)}h old). Refreshing...`,
    );
  }

  const freshPrice = await fetchPriceBySource(marketHashName, source);
  if (freshPrice !== null) {
    insertPrice(marketHashName, source, freshPrice);
    return {
      ...cached,
      steam: source === 'steam' ? freshPrice : cached.steam,
      csfloat: source === 'csfloat' ? freshPrice : cached.csfloat,
      average: freshPrice,
      timestamp: null,
    };
  }

  if (cachedSourcePrice !== null) {
    logger.warn(`[Price] Refresh failed for ${marketHashName}/${source}, using stale cache.`);
    return { ...cached, average: cachedSourcePrice };
  }

  return { ...cached, average: null };
}

export async function getStickerPrices(
  stickers: Array<{ name: string }>,
  source: PriceSource = 'steam',
): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  if (!stickers || stickers.length === 0) return prices;

  for (const sticker of stickers) {
    if (sticker.name && !prices[sticker.name]) {
      const p = await getPrices(sticker.name, false, source);
      if (p.average) {
        prices[sticker.name] = p.average;
      }
    }
  }
  return prices;
}
