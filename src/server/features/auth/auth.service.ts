import { encrypt, decrypt } from '../../lib/crypto.ts';

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-fallback-secret-change-me';

export function encryptCredential(value: string): string {
  return encrypt(value, SESSION_SECRET);
}

export function decryptCredential(encrypted: string): string {
  return decrypt(encrypted, SESSION_SECRET);
}
