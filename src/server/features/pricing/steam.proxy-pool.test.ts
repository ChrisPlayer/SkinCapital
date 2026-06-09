import { describe, it, expect } from 'vitest';
import { parseProxyUrl } from './steam.proxy-pool.ts';

describe('parseProxyUrl', () => {
  it('parses raw host:port:user:pass (Geonode format)', () => {
    expect(parseProxyUrl('proxy.geonode.io:9000:user1:pass1')).toMatchObject({
      host: 'proxy.geonode.io',
      port: 9000,
      auth: { username: 'user1', password: 'pass1' },
    });
  });

  it('parses http URL with auth', () => {
    expect(parseProxyUrl('http://u:p@host:8080')).toMatchObject({
      host: 'host',
      port: 8080,
      auth: { username: 'u', password: 'p' },
    });
  });

  it('parses bare host:port without auth', () => {
    const p = parseProxyUrl('1.2.3.4:3128');
    expect(p).toMatchObject({ host: '1.2.3.4', port: 3128 });
    expect(p?.auth).toBeUndefined();
  });

  it('returns null for garbage / out-of-range port', () => {
    expect(parseProxyUrl('not a proxy')).toBeNull();
    expect(parseProxyUrl('host:99999')).toBeNull();
  });
});
