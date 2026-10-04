import { csfloatQueue, steamQueue } from './pricing.queue.ts';

let resume: Promise<void> | null = null;
let resolveResume: (() => void) | null = null;

/** Inventory extraction and its login own the network ahead of price scans. */
export function setInventoryPriority(active: boolean): void {
  if (active && !resume) {
    resume = new Promise<void>((resolve) => {
      resolveResume = resolve;
    });
    steamQueue.pause();
    csfloatQueue.pause();
  } else if (!active && resume) {
    const release = resolveResume;
    resume = null;
    resolveResume = null;
    release?.();
    steamQueue.start();
    csfloatQueue.start();
  }
}

/** Wait without polling; cancelled scans leave the wait immediately. */
export async function waitForPriceWork(signal?: AbortSignal): Promise<boolean> {
  while (resume && !signal?.aborted) {
    const ready = resume;
    if (!signal) {
      await ready;
      continue;
    }
    await new Promise<void>((resolve) => {
      const done = () => {
        signal.removeEventListener('abort', done);
        resolve();
      };
      signal.addEventListener('abort', done, { once: true });
      void ready.then(done);
    });
  }
  return !signal?.aborted;
}

/** Recheck priority at dispatch, including inventory started in this turn. */
export async function runPriceRequest<T>(request: () => Promise<T>): Promise<T> {
  await Promise.resolve();
  while (resume) await resume;
  return request();
}
