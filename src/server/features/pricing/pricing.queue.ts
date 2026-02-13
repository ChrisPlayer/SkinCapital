import PQueueModule from 'p-queue';

// p-queue is ESM-only; tsx may double-wrap the default export
const PQueue = typeof PQueueModule === 'function' ? PQueueModule : (PQueueModule as unknown as { default: typeof PQueueModule }).default;

export const steamQueue = new PQueue({ concurrency: 1, interval: 3500, intervalCap: 1 });
