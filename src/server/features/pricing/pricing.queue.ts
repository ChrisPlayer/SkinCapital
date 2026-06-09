import PQueueModule from 'p-queue';

// p-queue is ESM-only; tsx may double-wrap the default export
const PQueue = typeof PQueueModule === 'function' ? PQueueModule : (PQueueModule as unknown as { default: typeof PQueueModule }).default;

// Direct-mode Steam throttle (no proxy): one request at a time, spaced out so we
// stay well under Steam's ~20 req/min and never get rate-limited. Patient by
// design — a big inventory may take a while, but every item is checked.
// STEAM_DIRECT_INTERVAL_MS (fallback to legacy STEAM_QUEUE_INTERVAL_MS) = spacing.
const STEAM_DIRECT_INTERVAL_MS = parseInt(
  process.env.STEAM_DIRECT_INTERVAL_MS || process.env.STEAM_QUEUE_INTERVAL_MS || '3500',
  10,
);

const CSFLOAT_QUEUE_CONCURRENCY = parseInt(process.env.CSFLOAT_QUEUE_CONCURRENCY || '1', 10);
const CSFLOAT_QUEUE_INTERVAL_MS = parseInt(process.env.CSFLOAT_QUEUE_INTERVAL_MS || '1500', 10);
const CSFLOAT_QUEUE_INTERVAL_CAP = parseInt(process.env.CSFLOAT_QUEUE_INTERVAL_CAP || '1', 10);

export const steamQueue = new PQueue({
  concurrency: 1,
  interval: Math.max(1000, STEAM_DIRECT_INTERVAL_MS),
  intervalCap: 1,
});

export const csfloatQueue = new PQueue({
  concurrency: Math.max(1, CSFLOAT_QUEUE_CONCURRENCY),
  interval: Math.max(100, CSFLOAT_QUEUE_INTERVAL_MS),
  intervalCap: Math.max(1, CSFLOAT_QUEUE_INTERVAL_CAP),
});
