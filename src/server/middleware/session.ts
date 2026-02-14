import session from 'express-session';
import crypto from 'crypto';

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

// Augment session types
declare module 'express-session' {
  interface SessionData {
    credentials?: {
      username: string;
      password?: string;
      sharedSecret?: string;
    };
    needsSteamGuard?: boolean;
    steamId?: string;
    error?: string;
  }
}
