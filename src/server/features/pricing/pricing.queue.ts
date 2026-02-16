import PQueueModule from 'p-queue';

// p-queue is ESM-only; tsx may double-wrap the default export
const PQueue = typeof PQueueModule === 'function' ? PQueueModule : (PQueueModule as unknown as { default: typeof PQueueModule }).default;

const STEAM_QUEUE_CONCURRENCY = parseInt(process.env.STEAM_QUEUE_CONCURRENCY || '1', 10);
const STEAM_QUEUE_INTERVAL_MS = parseInt(process.env.STEAM_QUEUE_INTERVAL_MS || '3500', 10);
const STEAM_QUEUE_INTERVAL_CAP = parseInt(process.env.STEAM_QUEUE_INTERVAL_CAP || '1', 10);

const CSFLOAT_QUEUE_CONCURRENCY = parseInt(process.env.CSFLOAT_QUEUE_CONCURRENCY || '1', 10);
const CSFLOAT_QUEUE_INTERVAL_MS = parseInt(process.env.CSFLOAT_QUEUE_INTERVAL_MS || '1500', 10);
const CSFLOAT_QUEUE_INTERVAL_CAP = parseInt(process.env.CSFLOAT_QUEUE_INTERVAL_CAP || '1', 10);

export const steamQueue = new PQueue({
  concurrency: Math.max(1, STEAM_QUEUE_CONCURRENCY),
  interval: Math.max(250, STEAM_QUEUE_INTERVAL_MS),
  intervalCap: Math.max(1, STEAM_QUEUE_INTERVAL_CAP),
});

export const csfloatQueue = new PQueue({
  concurrency: Math.max(1, CSFLOAT_QUEUE_CONCURRENCY),
  interval: Math.max(100, CSFLOAT_QUEUE_INTERVAL_MS),
  intervalCap: Math.max(1, CSFLOAT_QUEUE_INTERVAL_CAP),
});
