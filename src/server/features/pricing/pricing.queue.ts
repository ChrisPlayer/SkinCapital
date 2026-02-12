import PQueue from 'p-queue';

export const steamQueue = new PQueue({ concurrency: 1, interval: 3500, intervalCap: 1 });
