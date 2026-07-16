import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DATA_DIR } from './paths.ts';

/*
 * Production needs a stable SESSION_SECRET (cookie signing, and
 * pricing.config derives the proxy-encryption key from it). Self-hosted
 * installs (portable pack, Docker) should not have to invent one: when none
 * is provided, generate it once and persist it under DATA_DIR so restarts
 * keep sessions and stored proxies valid. An explicit env value always wins.
 *
 * Imported for its side effect; must come before any module that reads
 * process.env.SESSION_SECRET at import time.
 */
if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
  const secretFile = path.join(DATA_DIR, '.session-secret');
  if (!fs.existsSync(secretFile)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  }
  process.env.SESSION_SECRET = fs.readFileSync(secretFile, 'utf8').trim();
}
