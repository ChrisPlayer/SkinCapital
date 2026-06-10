import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.ts';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  logger.error('[Server] Unhandled error:', err.message);

  res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'Not found' });
}
