import express from 'express';
import path from 'path';
import { helmetMiddleware, corsMiddleware, apiLimiter, csrfGuard } from './middleware/security.ts';
import { sessionMiddleware } from './middleware/session.ts';
import { errorHandler } from './middleware/error-handler.ts';
import authRoutes from './features/auth/auth.routes.ts';
import inventoryRoutes from './features/inventory/inventory.routes.ts';
import pricingRoutes from './features/pricing/pricing.routes.ts';
import historyRoutes from './features/history/history.routes.ts';
import exportRoutes from './features/export/export.routes.ts';
import profilesRoutes from './features/profiles/profiles.routes.ts';
import settingsRoutes from './features/settings/settings.routes.ts';
import purchasesRoutes from './features/purchases/purchases.routes.ts';
import alertsRoutes from './features/alerts/alerts.routes.ts';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  // Core middleware
  app.use(helmetMiddleware);
  app.use(corsMiddleware);
  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: true, limit: '256kb', parameterLimit: 1000 }));
  app.use(sessionMiddleware);

  // CSRF mitigation (Origin check on state-changing requests)
  app.use(csrfGuard);

  // Rate limiting on API routes
  app.use('/api', apiLimiter);

  // API routes
  app.use('/api/auth', authRoutes);
  app.use('/api', profilesRoutes);
  app.use('/api', inventoryRoutes);
  app.use('/api', pricingRoutes);
  app.use('/api', historyRoutes);
  app.use('/api', exportRoutes);
  app.use('/api', settingsRoutes);
  app.use('/api', purchasesRoutes);
  app.use('/api', alertsRoutes);

  // API 404 for unmatched /api routes
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Serve Vite build in production
  if (process.env.NODE_ENV === 'production') {
    const clientDist = path.join(process.cwd(), 'dist', 'client');
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  // Error handling
  app.use(errorHandler);

  return app;
}
