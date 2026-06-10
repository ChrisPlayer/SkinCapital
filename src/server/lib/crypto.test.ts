import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from './crypto.ts';

describe('crypto (AES-256-GCM)', () => {
  const secret = 'a'.repeat(64);

  it('round-trips plaintext', () => {
    const plaintext = JSON.stringify(['http://user:p%40ss@proxy.geonode.io:9000']);
    expect(decrypt(encrypt(plaintext, secret), secret)).toBe(plaintext);
  });

  it('throws on a wrong key', () => {
    const cipher = encrypt('secret', secret);
    expect(() => decrypt(cipher, 'b'.repeat(64))).toThrow();
  });

  it('throws on tampered ciphertext', () => {
    const cipher = encrypt('secret', secret);
    const parts = cipher.split(':');
    parts[3] = parts[3].slice(0, -1) + (parts[3].endsWith('a') ? 'b' : 'a');
    expect(() => decrypt(parts.join(':'), secret)).toThrow();
  });

  it('rejects malformed ciphertext', () => {
    expect(() => decrypt('not-valid', secret)).toThrow();
  });
});
