import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { csrfGuard } from './security.ts';

describe('local app origins', () => {
  it.each(['http://localhost:3000', 'http://127.0.0.1:3000'])('allows writes from %s', (origin) => {
    const next = vi.fn();
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    csrfGuard(
      { method: 'POST', get: () => origin } as unknown as Request,
      res as unknown as Response,
      next,
    );
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects an unrelated website origin', () => {
    const next = vi.fn();
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    csrfGuard(
      { method: 'POST', get: () => 'https://unrelated.example' } as unknown as Request,
      res as unknown as Response,
      next,
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('uses the configured local server port', async () => {
    vi.stubEnv('PORT', '47831');
    vi.resetModules();
    try {
      const { csrfGuard: guard } = await import('./security.ts');
      const next = vi.fn();
      guard({ method: 'POST', get: () => 'http://127.0.0.1:47831' } as unknown as Request, {} as Response, next);
      expect(next).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('honors an explicit origin allowlist', async () => {
    vi.stubEnv('ALLOWED_ORIGINS', 'https://inventory.example.com');
    vi.resetModules();
    try {
      const { csrfGuard: guard } = await import('./security.ts');
      const next = vi.fn();
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      guard({ method: 'POST', get: () => 'http://127.0.0.1:3000' } as unknown as Request, res as unknown as Response, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
