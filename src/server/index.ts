import 'dotenv/config';
import { createApp } from './app.ts';
import { initDb, closeDb } from './db/client.ts';
import { setupCronJobs } from './features/inventory/inventory.jobs.ts';
import { steamClient } from './features/steam/steam.client.ts';
import { logger } from './lib/logger.ts';

const PORT = parseInt(process.env.PORT || '3000');
const REFRESH_INTERVAL = parseInt(process.env.REFRESH_INTERVAL || '10');

async function initialize() {
  logger.info('========================================');
  logger.info('  CS2 Inventory Tracker v2.0.0');
  logger.info('  TypeScript + React + Vite');
  logger.info('========================================');
  logger.info('');

  try {
    initDb();
  } catch (err) {
    logger.error('[Server] Database initialization failed:', err);
    process.exit(1);
  }

  setupCronJobs(REFRESH_INTERVAL);

  const app = createApp();

  app.listen(PORT, () => {
    logger.info('');
    logger.info(`[Server] API running at http://localhost:${PORT}`);
    if (process.env.NODE_ENV !== 'production') {
      logger.info(`[Server] Frontend at http://localhost:5173`);
    }
    logger.info('[Server] Press Ctrl+C to stop');
    logger.info('');
  });
}

process.on('SIGINT', () => {
  logger.info('\n[Server] Shutting down...');
  steamClient.logout();
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('\n[Server] Received SIGTERM, shutting down...');
  steamClient.logout();
  closeDb();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error('[Server] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  logger.error('[Server] Unhandled rejection:', reason);
});

initialize().catch((err) => {
  logger.error('[Server] Initialization failed:', err);
  process.exit(1);
});
