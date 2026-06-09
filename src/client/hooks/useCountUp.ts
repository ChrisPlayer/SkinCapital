import { useEffect, useRef, useState } from 'react';

// Computed once at module level: users who prefer reduced motion get instant
// snaps instead of animated tickers.
const REDUCED_MOTION =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

/**
 * Animated number ticker: eases the returned value toward `value` over
 * `durationMs` (requestAnimationFrame, cubic ease-out). On first mount it
 * counts up from 0; later changes animate from the currently displayed value.
 * Pair with `tabular-nums` so digits don't jitter horizontally.
 */
export function useCountUp(value: number, durationMs = 700): number {
  const [display, setDisplay] = useState(() => (REDUCED_MOTION ? value : 0));
  const displayRef = useRef(REDUCED_MOTION ? value : 0);

  useEffect(() => {
    if (REDUCED_MOTION || durationMs <= 0) {
      displayRef.current = value;
      setDisplay(value);
      return;
    }
    const from = displayRef.current;
    if (from === value) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = p < 1 ? from + (value - from) * eased : value;
      displayRef.current = next;
      setDisplay(next);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return display;
}
