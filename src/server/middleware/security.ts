import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import type { RequestHandler } from 'express';

export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: [
        "'self'",
        'data:',
        'https://community.akamai.steamstatic.com',
        'https://raw.githubusercontent.com',
      ],
      connectSrc: ["'self'"],
    },
  },
}) as RequestHandler;

export const corsMiddleware = cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
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
