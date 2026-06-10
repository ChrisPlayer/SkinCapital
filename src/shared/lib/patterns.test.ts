import { describe, it, expect } from 'vitest';
import { detectPatterns, hasNotableTier } from './patterns.ts';

describe('detectPatterns — low float', () => {
  it('flags a near-zero Factory New float', () => {
    const tags = detectPatterns({
      marketHashName: 'AK-47 | Redline (Factory New)',
      floatValue: 0.0005,
      paintSeed: 12,
    });
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatchObject({ kind: 'fnlow', key: 'patterns.nearzero', tier: 'cyan' });
    expect(tags[0].rank).toBe('0.0005');
  });

  it('flags a very low (but not near-zero) FN float', () => {
    const tags = detectPatterns({
      marketHashName: 'AWP | Asiimov (Factory New)',
      floatValue: 0.004,
      paintSeed: 1,
    });
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatchObject({ kind: 'fnlow', key: 'patterns.fnlow', tier: 'neutral' });
  });

  it('does not flag a normal FN float', () => {
    const tags = detectPatterns({
      marketHashName: 'AK-47 | Redline (Factory New)',
      floatValue: 0.05,
      paintSeed: 12,
    });
    expect(tags).toHaveLength(0);
  });

  it('does not flag a low float when the wear suffix is not Factory New', () => {
    const tags = detectPatterns({
      marketHashName: 'AK-47 | Redline (Field-Tested)',
      floatValue: 0.005,
      paintSeed: 12,
    });
    expect(tags).toHaveLength(0);
  });

  it('uses the float band when no wear suffix is present', () => {
    const tags = detectPatterns({
      marketHashName: 'AK-47 | Redline',
      floatValue: 0.005,
      paintSeed: 12,
    });
    expect(tags).toHaveLength(1);
    expect(tags[0].kind).toBe('fnlow');
  });

  it('ignores a null float', () => {
    const tags = detectPatterns({
      marketHashName: 'AK-47 | Redline (Factory New)',
      floatValue: null,
      paintSeed: 12,
    });
    expect(tags).toHaveLength(0);
  });
});

describe('detectPatterns — Case Hardened blue gem', () => {
  it('flags a top-tier AK-47 seed as gold', () => {
    const tags = detectPatterns({
      marketHashName: 'AK-47 | Case Hardened (Field-Tested)',
      floatValue: 0.25,
      paintSeed: 661,
    });
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatchObject({ kind: 'bluegem', tier: 'gold', rank: '#661' });
  });

  it('flags a notable AK-47 seed as cyan', () => {
    const tags = detectPatterns({
      marketHashName: 'StatTrak™ AK-47 | Case Hardened (Minimal Wear)',
      floatValue: 0.1,
      paintSeed: 179,
    });
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatchObject({ kind: 'bluegem', tier: 'cyan' });
  });

  it('handles the ★ knife prefix', () => {
    const tags = detectPatterns({
      marketHashName: '★ Karambit | Case Hardened (Factory New)',
      floatValue: 0.2,
      paintSeed: 387,
    });
    expect(tags.some((t) => t.kind === 'bluegem' && t.tier === 'gold')).toBe(true);
  });

  it('does not flag an unknown seed', () => {
    const tags = detectPatterns({
      marketHashName: 'AK-47 | Case Hardened (Field-Tested)',
      floatValue: 0.25,
      paintSeed: 99999,
    });
    expect(tags.some((t) => t.kind === 'bluegem')).toBe(false);
  });

  it('does not flag Case Hardened with a null seed', () => {
    const tags = detectPatterns({
      marketHashName: 'AK-47 | Case Hardened (Field-Tested)',
      floatValue: 0.25,
      paintSeed: null,
    });
    expect(tags.some((t) => t.kind === 'bluegem')).toBe(false);
  });

  it('does not flag a non-Case-Hardened skin even on a known seed', () => {
    const tags = detectPatterns({
      marketHashName: 'AK-47 | Redline (Field-Tested)',
      floatValue: 0.25,
      paintSeed: 661,
    });
    expect(tags.some((t) => t.kind === 'bluegem')).toBe(false);
  });
});

describe('hasNotableTier', () => {
  it('is true for gold/cyan tags', () => {
    expect(hasNotableTier(detectPatterns({ marketHashName: 'AK-47 | Case Hardened (FT)', floatValue: 0.25, paintSeed: 661 }))).toBe(true);
  });
  it('is false for neutral-only tags', () => {
    const tags = detectPatterns({ marketHashName: 'AWP | Asiimov (Factory New)', floatValue: 0.004, paintSeed: 1 });
    expect(hasNotableTier(tags)).toBe(false);
  });
  it('is false for no tags', () => {
    expect(hasNotableTier([])).toBe(false);
  });
});
