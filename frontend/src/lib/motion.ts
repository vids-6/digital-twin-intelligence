import { useEffect, useState } from 'react';

const Q = '(prefers-reduced-motion: reduce)';
export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.(Q).matches;

export function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const mq = window.matchMedia(Q);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Animate a number toward its target (used for the few oversized readouts). Skips animation under reduced motion. */
export function useTween(target: number, ms = 600) {
  const reduced = useReducedMotion();
  const [v, setV] = useState(target);
  useEffect(() => {
    if (reduced || v === target) { setV(target); return; }
    const from = v, t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setV(from + (target - from) * e);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, reduced]);
  return v;
}

/** Re-render on an interval so relative times ("2m ago") stay current. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => !document.hidden && setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}
