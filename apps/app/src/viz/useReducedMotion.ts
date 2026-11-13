import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia(QUERY).matches;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia(QUERY);
    const on = () => {
      setReduced(m.matches);
    };
    m.addEventListener('change', on);
    return () => {
      m.removeEventListener('change', on);
    };
  }, []);
  return reduced;
}
