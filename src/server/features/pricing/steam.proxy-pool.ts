import axios, { type AxiosProxyConfig } from 'axios';
import { lookup as dnsLookup } from 'node:dns/promises';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { logger } from '../../lib/logger.ts';
import { getResolvedMode, getConfiguredProxies, onPricingConfigChange } from './pricing.config.ts';

export interface SteamProxyWorker {
  id: string;
  proxy: AxiosProxyConfig | null;
  agent?: HttpsProxyAgent<string>;
  busy: boolean;
  cooldownUntil: number;
  overviewDisabledUntil: number;
  failureStreak: number;
  isDirect: boolean;
}

export interface SteamProxyPoolStats {
  totalWorkers: number;
  proxyWorkers: number;
  directWorkers: number;
  readyWorkers: number;
  busyWorkers: number;
  coolingWorkers: number;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = Number.parseInt(raw || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] || '').trim();
  if (!raw) return fallback;
  const normalized = raw.toLowerCase();
  return normalized !== '0' && normalized !== 'false' && normalized !== 'no';
}

const DEFAULT_PROXY_SOURCES = [
  'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=8000&country=all&ssl=all&anonymity=all',
  'https://api.proxyscrape.com/v2/?request=displayproxies&protocol=https&timeout=8000&country=all&ssl=all&anonymity=all',
  'https://www.proxy-list.download/api/v1/get?type=http',
  'https://www.proxy-list.download/api/v1/get?type=https',
  'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
  'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt',
  'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies_anonymous/http.txt',
  'https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTP_RAW.txt',
  'https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt',
  'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt',
  'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt',
  'https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-https.txt',
  'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
  'https://raw.githubusercontent.com/mmpx12/proxy-list/master/http.txt',
  'https://proxyspace.pro/http.txt',
];

const STEAM_PROXY_WORKERS = Math.max(10, envInt('STEAM_PROXY_WORKERS', envInt('STEAM_QUEUE_CONCURRENCY', 10)));
const STEAM_PROXY_POOL_SIZE = Math.max(
  STEAM_PROXY_WORKERS,
  envInt('STEAM_PROXY_POOL_SIZE', 400),
);
const STEAM_PROXY_FETCH_TIMEOUT_MS = Math.max(
  3000,
  envInt('STEAM_PROXY_FETCH_TIMEOUT_MS', 8000),
);
const STEAM_PROXY_REFRESH_MS = Math.max(
  5 * 60_000,
  envInt('STEAM_PROXY_REFRESH_MS', 1800000),
);
const STEAM_PROXY_ACQUIRE_TIMEOUT_MS = Math.max(
  1000,
  envInt('STEAM_PROXY_ACQUIRE_TIMEOUT_MS', 4000),
);
const STEAM_PROXY_ERROR_COOLDOWN_MS = Math.max(
  1000,
  envInt('STEAM_PROXY_ERROR_COOLDOWN_MS', 5000),
);
const STEAM_PROXY_MAX_ERROR_COOLDOWN_MS = Math.max(
  STEAM_PROXY_ERROR_COOLDOWN_MS,
  envInt('STEAM_PROXY_MAX_ERROR_COOLDOWN_MS', 45000),
);
const STEAM_DIRECT_WORKERS = Math.min(STEAM_PROXY_WORKERS, Math.max(0, envInt('STEAM_DIRECT_WORKERS', 1)));
const STEAM_PROXY_REJECTED_COOLDOWN_MS = Math.max(
  STEAM_PROXY_ERROR_COOLDOWN_MS,
  envInt('STEAM_PROXY_REJECTED_COOLDOWN_MS', 10 * 60_000),
);
const STEAM_PROXY_VERIFY_ENABLED = envBool('STEAM_PROXY_VERIFY_ENABLED', true);
const STEAM_PROXY_VERIFY_TIMEOUT_MS = Math.max(1200, envInt('STEAM_PROXY_VERIFY_TIMEOUT_MS', 2500));
const STEAM_PROXY_VERIFY_CONCURRENCY = Math.max(1, envInt('STEAM_PROXY_VERIFY_CONCURRENCY', 100));
const STEAM_PROXY_VERIFY_SAMPLE_SIZE = Math.max(
  STEAM_PROXY_WORKERS,
  envInt('STEAM_PROXY_VERIFY_SAMPLE_SIZE', Math.min(STEAM_PROXY_POOL_SIZE, Math.max(120, STEAM_PROXY_WORKERS * 20))),
);
const STEAM_PROXY_VERIFY_MAX_PROBES = Math.max(
  STEAM_PROXY_WORKERS,
  envInt('STEAM_PROXY_VERIFY_MAX_PROBES', Math.min(STEAM_PROXY_POOL_SIZE, Math.max(180, STEAM_PROXY_WORKERS * 30))),
);
const STEAM_PROXY_VERIFY_MARKET_HASH_NAME = (
  process.env.STEAM_PROXY_VERIFY_MARKET_HASH_NAME || 'AK-47 | Redline (Field-Tested)'
).trim();
const STEAM_PROXY_VERIFY_URL = (
  process.env.STEAM_PROXY_VERIFY_URL ||
  `https://steamcommunity.com/market/priceoverview/?appid=730&market_hash_name=${encodeURIComponent(STEAM_PROXY_VERIFY_MARKET_HASH_NAME)}&currency=3`
).trim();
const STEAM_FREE_PROXY_SOURCES = (process.env.STEAM_FREE_PROXY_SOURCES || '')
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

// Paid/residential proxies with optional user:pass auth. When set, these are
// used INSTEAD of the scraped free pool and health-verification is skipped
// (paid proxies are trusted). One rotating gateway is fine — it gets replicated
// across the worker count so requests run concurrently with rotating exit IPs.
// Format per entry: [http://][user:pass@]host:port  (comma or newline separated)
export type PricingMode = 'proxy' | 'direct';

// Resolved pricing mode (fast paid proxies vs slow/complete direct). The actual
// config (auto|proxy|direct + the proxy list) lives in pricing.config and is
// settable from the UI; here we just consume the resolved value.
export function getPricingMode(): PricingMode {
  return getResolvedMode();
}

// When the pricing config changes (UI save), rebuild the worker pool now so the
// next price fetch uses the new mode/proxies immediately.
onPricingConfigChange(() => {
  ensureSteamProxyPool(true).catch(() => {
    /* errors are logged inside ensureSteamProxyPool */
  });
});

/** Block loopback / private / link-local hosts to avoid SSRF via the test endpoint. */
function isPrivateHost(host: string): boolean {
  // Normalize IPv4-mapped IPv6 (::ffff:127.0.0.1) so the v4 ranges apply.
  const h = host.toLowerCase().trim().replace(/^::ffff:/, '');
  if (h === 'localhost' || h === '::1' || h.endsWith('.localhost')) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    if (a === 0 || a === 127 || a === 10) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  if (h.startsWith('fd') || h.startsWith('fc') || h.startsWith('fe80')) return true; // IPv6 ULA/link-local
  return false;
}

/** Validate a single proxy entry by making a request through it (returns exit IP). */
export async function testProxy(raw: string): Promise<{ ok: boolean; ip?: string; error?: string }> {
  const cfg = parseProxyUrl(raw);
  if (!cfg) return { ok: false, error: 'Format invalide (attendu host:port:user:pass ou http://user:pass@host:port)' };
  if (isPrivateHost(cfg.host)) return { ok: false, error: 'Hote prive/loopback refuse' };
  // A literal-IP check is not enough: a domain name can resolve to a private
  // address (SSRF via DNS). Resolve every address and reject private ones.
  if (!/^[0-9.]+$/.test(cfg.host) && !cfg.host.includes(':')) {
    try {
      const addrs = await dnsLookup(cfg.host, { all: true });
      if (addrs.some((a) => isPrivateHost(a.address))) {
        return { ok: false, error: 'Hote prive/loopback refuse (resolution DNS)' };
      }
    } catch {
      return { ok: false, error: 'Resolution DNS impossible' };
    }
  }
  try {
    const res = await axios.get('https://api.ipify.org?format=json', {
      httpsAgent: makeAgent(cfg),
      proxy: false,
      timeout: 12000,
    });
    return { ok: true, ip: (res.data as { ip?: string })?.ip };
  } catch (err) {
    const e = err as { response?: { status?: number }; message?: string };
    return { ok: false, error: e.response?.status ? `HTTP ${e.response.status}` : e.message || 'échec' };
  }
}

let workers: SteamProxyWorker[] = [];
let refreshPromise: Promise<void> | null = null;
let lastRefreshAt = 0;
let nextPickIndex = 0;
let lastStatsLogAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function parseProxyText(rawText: string): Array<{ host: string; port: number }> {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const results: Array<{ host: string; port: number }> = [];
  for (const line of lines) {
    const candidate = line.replace(/^https?:\/\//i, '').split('/')[0];
    const [host, portRaw] = candidate.split(':');
    const port = parseInt(portRaw || '', 10);
    if (!host || !Number.isFinite(port) || port < 1 || port > 65535) continue;
    results.push({ host, port });
  }
  return results;
}

/** Parse a full proxy URL (with optional auth) into an AxiosProxyConfig. */
export function parseProxyUrl(raw: string): AxiosProxyConfig | null {
  try {
    let s = raw.trim();
    // Accept the raw "host:port:user:pass" provider format (e.g. Geonode).
    if (!/^[a-z]+:\/\//i.test(s) && !s.includes('@')) {
      const parts = s.split(':');
      if (parts.length === 4) {
        const [host, port, user, pass] = parts;
        s = `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
      }
    }
    const withScheme = /^[a-z]+:\/\//i.test(s) ? s : `http://${s}`;
    const url = new URL(withScheme);
    const port = parseInt(url.port, 10);
    if (!url.hostname || !Number.isFinite(port) || port < 1 || port > 65535) return null;
    const config: AxiosProxyConfig = {
      host: url.hostname,
      port,
      protocol: (url.protocol.replace(':', '') || 'http') as AxiosProxyConfig['protocol'],
    };
    if (url.username || url.password) {
      config.auth = {
        username: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
      };
    }
    return config;
  } catch {
    return null;
  }
}

function proxyToUrl(proxy: AxiosProxyConfig): string {
  const scheme = proxy.protocol || 'http';
  const auth = proxy.auth
    ? `${encodeURIComponent(proxy.auth.username)}:${encodeURIComponent(proxy.auth.password)}@`
    : '';
  return `${scheme}://${auth}${proxy.host}:${proxy.port}`;
}

// Tunnel HTTPS through the proxy via a real CONNECT agent. axios's built-in
// `proxy` option mishandles authenticated HTTPS proxies (HPE_* / ECONNRESET).
function makeAgent(proxy: AxiosProxyConfig | null | undefined): HttpsProxyAgent<string> | undefined {
  if (!proxy) return undefined;
  return new HttpsProxyAgent(proxyToUrl(proxy));
}

async function fetchProxySource(sourceUrl: string): Promise<Array<{ host: string; port: number }>> {
  try {
    const response = await axios.get<string>(sourceUrl, {
      timeout: STEAM_PROXY_FETCH_TIMEOUT_MS,
      responseType: 'text',
      headers: {
        Accept: 'text/plain,*/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    const parsed = parseProxyText(response.data || '');
    logger.debug(`[Price] Proxy source ${sourceUrl} returned ${parsed.length} candidates.`);
    return parsed;
  } catch (err) {
    logger.debug(`[Price] Proxy source unavailable: ${sourceUrl}`);
    logger.debug((err as Error).message);
    return [];
  }
}

async function fetchFreeProxies(): Promise<AxiosProxyConfig[]> {
  const sources = STEAM_FREE_PROXY_SOURCES.length > 0 ? STEAM_FREE_PROXY_SOURCES : DEFAULT_PROXY_SOURCES;
  const settled = await Promise.allSettled(sources.map((source) => fetchProxySource(source)));
  const unique = new Map<string, AxiosProxyConfig>();
  let totalCandidates = 0;

  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    for (const proxy of result.value) {
      totalCandidates += 1;
      const key = `${proxy.host}:${proxy.port}`;
      if (!unique.has(key)) {
        unique.set(key, {
          host: proxy.host,
          port: proxy.port,
          protocol: 'http',
        });
      }
    }
  }

  const deduped = [...unique.values()];
  logger.info(
    `[Price] Steam proxy scrape: ${sources.length} sources, ${totalCandidates} candidates, ${deduped.length} unique.`,
  );
  return shuffle(deduped).slice(0, STEAM_PROXY_POOL_SIZE);
}

function isSteamProxyProbeSuccess(status: number): boolean {
  return status === 200 || status === 429;
}

type ProxyProbeResult = {
  ok: boolean;
  status: number | null;
  error: string | null;
};

async function verifySteamProxy(proxy: AxiosProxyConfig): Promise<ProxyProbeResult> {
  const proxyLabel = `${proxy.host}:${proxy.port}`;
  try {
    const response = await axios.get(STEAM_PROXY_VERIFY_URL, {
      timeout: STEAM_PROXY_VERIFY_TIMEOUT_MS,
      httpsAgent: makeAgent(proxy),
      proxy: false,
      validateStatus: () => true,
      headers: {
        Accept: 'application/json,text/plain,*/*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    const ok = isSteamProxyProbeSuccess(response.status);
    if (!ok) {
      logger.debug(`[Price] Steam proxy rejected during probe ${proxyLabel}: status ${response.status}`);
    }
    return { ok, status: response.status, error: null };
  } catch (err) {
    const errorObj = err as { code?: string; message?: string };
    const message = errorObj?.message || (err instanceof Error ? err.message : String(err));
    const code = (errorObj?.code || '').toString().trim().toUpperCase();
    const normalizedError = code || 'REQUEST_ERROR';
    logger.debug(`[Price] Steam proxy probe failed for ${proxyLabel}: ${message}`);
    return { ok: false, status: null, error: normalizedError };
  }
}

async function verifyProxyPool(proxyPool: AxiosProxyConfig[]): Promise<AxiosProxyConfig[]> {
  if (!STEAM_PROXY_VERIFY_ENABLED || proxyPool.length === 0) {
    return proxyPool;
  }

  const targetProxyWorkers = Math.max(0, STEAM_PROXY_WORKERS - STEAM_DIRECT_WORKERS);
  if (targetProxyWorkers === 0) {
    return [];
  }

  const probeBudget = Math.min(proxyPool.length, Math.max(STEAM_PROXY_VERIFY_SAMPLE_SIZE, STEAM_PROXY_VERIFY_MAX_PROBES));
  const candidates = shuffle(proxyPool).slice(0, probeBudget);
  const verified: AxiosProxyConfig[] = [];
  let cursor = 0;
  const statusCounts = new Map<string, number>();
  const errorCounts = new Map<string, number>();

  const runners = Math.min(STEAM_PROXY_VERIFY_CONCURRENCY, candidates.length);
  await Promise.all(
    Array.from({ length: runners }, async () => {
      while (verified.length < targetProxyWorkers) {
        const idx = cursor;
        cursor += 1;
        if (idx >= candidates.length) {
          return;
        }
        const candidate = candidates[idx];
        const probe = await verifySteamProxy(candidate);
        if (probe.status !== null) {
          const key = `HTTP_${probe.status}`;
          statusCounts.set(key, (statusCounts.get(key) || 0) + 1);
        } else if (probe.error) {
          errorCounts.set(probe.error, (errorCounts.get(probe.error) || 0) + 1);
        }
        if (probe.ok) {
          verified.push(candidate);
        }
      }
    }),
  );

  const selected = verified.slice(0, targetProxyWorkers);
  logger.info(
    `[Price] Steam proxy verification: ${selected.length}/${candidates.length} healthy (target ${targetProxyWorkers}).`,
  );
  const statusSummary = [...statusCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => `${key}:${count}`)
    .join(', ');
  const errorSummary = [...errorCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => `${key}:${count}`)
    .join(', ');
  if (statusSummary || errorSummary) {
    logger.info(
      `[Price] Steam proxy probe breakdown: ${statusSummary || 'no-http-status'}${errorSummary ? ` | errors ${errorSummary}` : ''}.`,
    );
  }
  if (selected.length < targetProxyWorkers) {
    logger.warn(
      `[Price] Steam proxy verification low yield. Missing ${targetProxyWorkers - selected.length} healthy proxies; direct workers will compensate.`,
    );
  }
  return selected;
}

function buildWorkers(proxyPool: AxiosProxyConfig[]): SteamProxyWorker[] {
  const result: SteamProxyWorker[] = [];
  const directWorkersTarget = Math.min(STEAM_DIRECT_WORKERS, STEAM_PROXY_WORKERS);
  const proxyWorkersTarget = Math.max(0, STEAM_PROXY_WORKERS - directWorkersTarget);
  const selected = proxyPool.slice(0, proxyWorkersTarget);

  selected.forEach((proxy, index) => {
    result.push({
      id: `proxy-${index + 1}`,
      proxy,
      agent: makeAgent(proxy),
      busy: false,
      cooldownUntil: 0,
      overviewDisabledUntil: 0,
      failureStreak: 0,
      isDirect: false,
    });
  });

  const directToCreate = Math.max(0, Math.min(directWorkersTarget, STEAM_PROXY_WORKERS - result.length));
  for (let i = 0; i < directToCreate; i++) {
    result.push({
      id: `direct-${i + 1}`,
      proxy: null,
      busy: false,
      cooldownUntil: 0,
      overviewDisabledUntil: 0,
      failureStreak: 0,
      isDirect: true,
    });
  }

  if (result.length === 0) {
    result.push({
      id: 'direct-1',
      proxy: null,
      busy: false,
      cooldownUntil: 0,
      overviewDisabledUntil: 0,
      failureStreak: 0,
      isDirect: true,
    });
  }

  if (result.length < STEAM_PROXY_WORKERS) {
    logger.warn(
      `[Price] Steam worker pool degraded: ${result.length}/${STEAM_PROXY_WORKERS} workers ready (${selected.length} proxy, ${directToCreate} direct).`,
    );
  }

  return result;
}

/** Build workers from configured paid proxies (replicated across the worker count). */
function buildCustomProxyWorkers(): SteamProxyWorker[] {
  const parsed = getConfiguredProxies().map(parseProxyUrl).filter((p): p is AxiosProxyConfig => p !== null);
  if (parsed.length === 0) {
    logger.warn('[Price] Proxies configured but none could be parsed; falling back to direct.');
    return buildWorkers([]);
  }

  const directWorkersTarget = Math.min(STEAM_DIRECT_WORKERS, Math.max(0, STEAM_PROXY_WORKERS - 1));
  const proxyWorkersTarget = Math.max(parsed.length, STEAM_PROXY_WORKERS - directWorkersTarget);
  const result: SteamProxyWorker[] = [];

  for (let i = 0; i < proxyWorkersTarget; i++) {
    const proxy = parsed[i % parsed.length];
    result.push({
      id: `res-${i + 1}`,
      proxy: { ...proxy },
      agent: makeAgent(proxy),
      busy: false,
      cooldownUntil: 0,
      overviewDisabledUntil: 0,
      failureStreak: 0,
      isDirect: false,
    });
  }

  for (let i = 0; i < directWorkersTarget; i++) {
    result.push({
      id: `direct-${i + 1}`,
      proxy: null,
      busy: false,
      cooldownUntil: 0,
      overviewDisabledUntil: 0,
      failureStreak: 0,
      isDirect: true,
    });
  }

  return result;
}

function pickReadyWorker(now: number): SteamProxyWorker | null {
  if (workers.length === 0) return null;

  for (let i = 0; i < workers.length; i++) {
    const idx = (nextPickIndex + i) % workers.length;
    const worker = workers[idx];
    if (!worker.busy && worker.cooldownUntil <= now) {
      nextPickIndex = (idx + 1) % workers.length;
      return worker;
    }
  }
  return null;
}

function getNextReadyDelayMs(now: number): number {
  if (workers.length === 0) return 200;

  let delay = 400;
  for (const worker of workers) {
    if (worker.busy) continue;
    const remaining = Math.max(0, worker.cooldownUntil - now);
    if (remaining < delay) {
      delay = remaining;
    }
  }
  return Math.max(60, delay);
}

function logPoolStats() {
  const now = Date.now();
  if (now - lastStatsLogAt < 60_000) return;
  lastStatsLogAt = now;

  const proxyWorkers = workers.filter((w) => !w.isDirect).length;
  const directWorkers = workers.filter((w) => w.isDirect).length;
  logger.info(
    `[Price] Steam proxy pool ready: ${workers.length} workers (${proxyWorkers} proxy, ${directWorkers} direct).`,
  );
}

export async function ensureSteamProxyPool(force = false): Promise<void> {
  const isStale = Date.now() - lastRefreshAt >= STEAM_PROXY_REFRESH_MS;
  const shouldRefresh = force || workers.length === 0 || isStale;

  if (!shouldRefresh) return;
  if (refreshPromise) {
    await refreshPromise;
    return;
  }

  refreshPromise = (async () => {
    if (getPricingMode() === 'direct') {
      workers = [
        {
          id: 'direct-1',
          proxy: null,
          busy: false,
          cooldownUntil: 0,
          overviewDisabledUntil: 0,
          failureStreak: 0,
          isDirect: true,
        },
      ];
      lastRefreshAt = Date.now();
      nextPickIndex = 0;
      logger.info(
        '[Price] Direct mode (no proxy): single throttled connection over your own IP — slower, but every item is checked and Steam is never rate-limited.',
      );
      return;
    }
    const configuredProxies = getConfiguredProxies();
    if (configuredProxies.length > 0) {
      workers = buildCustomProxyWorkers();
      lastRefreshAt = Date.now();
      nextPickIndex = 0;
      const proxyCount = workers.filter((w) => !w.isDirect).length;
      logger.info(
        `[Price] Residential proxy mode: ${configuredProxies.length} endpoint(s) → ${proxyCount} worker(s), verification skipped.`,
      );
      logPoolStats();
      return;
    }
    const proxyPool = await fetchFreeProxies();
    const verifiedProxyPool = await verifyProxyPool(proxyPool);
    workers = buildWorkers(verifiedProxyPool);
    lastRefreshAt = Date.now();
    nextPickIndex = 0;
    logPoolStats();
  })().finally(() => {
    refreshPromise = null;
  });

  await refreshPromise;
}

export async function acquireSteamProxyWorker(): Promise<SteamProxyWorker | null> {
  await ensureSteamProxyPool();

  const deadline = Date.now() + STEAM_PROXY_ACQUIRE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const now = Date.now();
    const worker = pickReadyWorker(now);
    if (worker) {
      worker.busy = true;
      return worker;
    }
    await sleep(getNextReadyDelayMs(now));
  }

  return null;
}

export function releaseSteamProxyWorker(worker: SteamProxyWorker) {
  worker.busy = false;
}

export function getSteamProxyConfig(worker: SteamProxyWorker): AxiosProxyConfig | false {
  return worker.proxy || false;
}

export function getSteamProxyAgent(worker: SteamProxyWorker): HttpsProxyAgent<string> | undefined {
  return worker.agent;
}

export function markSteamWorkerRateLimited(
  worker: SteamProxyWorker,
  cooldownMs: number,
  options?: { overviewOnly?: boolean },
) {
  const now = Date.now();
  if (options?.overviewOnly) {
    worker.overviewDisabledUntil = Math.max(worker.overviewDisabledUntil, now + cooldownMs);
    return;
  }

  worker.cooldownUntil = Math.max(worker.cooldownUntil, now + cooldownMs);
  worker.overviewDisabledUntil = Math.max(worker.overviewDisabledUntil, worker.cooldownUntil);
}

export function markSteamDirectWorkersRateLimited(cooldownMs: number, options?: { overviewOnly?: boolean }) {
  const now = Date.now();
  for (const worker of workers) {
    if (!worker.isDirect) continue;
    if (options?.overviewOnly) {
      worker.overviewDisabledUntil = Math.max(worker.overviewDisabledUntil, now + cooldownMs);
      continue;
    }
    worker.cooldownUntil = Math.max(worker.cooldownUntil, now + cooldownMs);
    worker.overviewDisabledUntil = Math.max(worker.overviewDisabledUntil, worker.cooldownUntil);
  }
}

export function markSteamWorkerNetworkFailure(worker: SteamProxyWorker) {
  worker.failureStreak += 1;
  const backoffMultiplier = 2 ** Math.min(worker.failureStreak - 1, 4);
  const cooldownMs = Math.min(STEAM_PROXY_ERROR_COOLDOWN_MS * backoffMultiplier, STEAM_PROXY_MAX_ERROR_COOLDOWN_MS);
  worker.cooldownUntil = Math.max(worker.cooldownUntil, Date.now() + cooldownMs);
}

export function markSteamWorkerProxyRejected(worker: SteamProxyWorker) {
  if (worker.isDirect) {
    markSteamWorkerNetworkFailure(worker);
    return;
  }
  worker.failureStreak = Math.max(worker.failureStreak, 3);
  worker.cooldownUntil = Math.max(worker.cooldownUntil, Date.now() + STEAM_PROXY_REJECTED_COOLDOWN_MS);
  worker.overviewDisabledUntil = Math.max(worker.overviewDisabledUntil, worker.cooldownUntil);
}

export function markSteamWorkerSuccess(worker: SteamProxyWorker) {
  worker.failureStreak = 0;
}

export function getSteamCooldownRemainingMs(): number {
  const now = Date.now();
  if (workers.length === 0) return 0;

  let earliestReadyAt = Number.POSITIVE_INFINITY;
  for (const worker of workers) {
    if (!worker.busy && worker.cooldownUntil <= now) {
      return 0;
    }

    const readyAt = worker.busy ? now + 100 : worker.cooldownUntil;
    if (readyAt < earliestReadyAt) {
      earliestReadyAt = readyAt;
    }
  }

  if (!Number.isFinite(earliestReadyAt) || earliestReadyAt <= now) {
    return 0;
  }
  return earliestReadyAt - now;
}

export function getSteamProxyPoolStats(): SteamProxyPoolStats {
  const now = Date.now();
  let proxyWorkers = 0;
  let directWorkers = 0;
  let readyWorkers = 0;
  let busyWorkers = 0;
  let coolingWorkers = 0;

  for (const worker of workers) {
    if (worker.isDirect) {
      directWorkers += 1;
    } else {
      proxyWorkers += 1;
    }

    if (worker.busy) {
      busyWorkers += 1;
    } else if (worker.cooldownUntil > now) {
      coolingWorkers += 1;
    } else {
      readyWorkers += 1;
    }
  }

  return {
    totalWorkers: workers.length,
    proxyWorkers,
    directWorkers,
    readyWorkers,
    busyWorkers,
    coolingWorkers,
  };
}
