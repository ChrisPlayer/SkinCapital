import session from 'express-session';
import crypto from 'crypto';

// In production a stable secret is mandatory (a random per-boot fallback would
// silently invalidate every session on restart and weakens cookie signing).
if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error('SESSION_SECRET must be set (>=32 chars) in production');
}

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

export const sessionMiddleware = session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: 'cs2tracker_session',
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'strict',
  },
});

// Augment session types.
// SECURITY: the session must never be able to hold a password or 2FA secret —
// only the transient username (deleted at login finalization) and the steamId.
declare module 'express-session' {
  interface SessionData {
    credentials?: {
      username: string;
    };
    needsSteamGuard?: boolean;
    steamId?: string;
    error?: string;
  }
}
