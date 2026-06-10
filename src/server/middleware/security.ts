import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import type { RequestHandler } from 'express';

// Allowed browser origins (CORS + CSRF). Configurable so a LAN host/IP can be
// added without editing code. Default = local dev/prod ports.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Removed: helmet's default forces every subresource to https, which breaks
      // a plain-HTTP LAN deployment (assets fail to load → blank page). When served
      // over real HTTPS, requests are already secure so this is not needed.
      upgradeInsecureRequests: null,
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: [
        "'self'",
        'data:',
        'https://community.akamai.steamstatic.com',
        'https://avatars.cloudflare.steamstatic.com',
        'https://avatars.akamai.steamstatic.com',
        'https://raw.githubusercontent.com',
      ],
      connectSrc: ["'self'"],
    },
  },
}) as RequestHandler;

export const corsMiddleware = cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
}) as RequestHandler;

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later' },
});

// CSRF mitigation: reject state-changing requests whose Origin isn't allow-listed.
// The SPA's own requests carry an allowed Origin; a malicious cross-site POST
// carries the attacker's Origin and is blocked. Requests with no Origin header
// (curl, server-to-server) are allowed — they are not a CSRF vector.
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
export const csrfGuard: RequestHandler = (req, res, next) => {
  if (!MUTATING_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  if (!origin || ALLOWED_ORIGINS.includes(origin)) return next();
  res.status(403).json({ error: 'Cross-origin request blocked' });
};
