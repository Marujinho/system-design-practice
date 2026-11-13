/**
 * Content-Security-Policy (PRD §12 A02). Production (preview) is strict; dev
 * also allows the inline React Refresh preamble and the HMR websocket. Never
 * unsafe-eval.
 */
const base: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'worker-src': ["'self'", 'blob:'],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
};

function render(policy: Record<string, string[]>): string {
  return Object.entries(policy)
    .map(([k, v]) => `${k} ${v.join(' ')}`)
    .join('; ');
}

export function cspProduction(): string {
  return render(base);
}

export function cspDev(port: number): string {
  return render({
    ...base,
    'script-src': ["'self'", "'unsafe-inline'"],
    'connect-src': ["'self'", `ws://127.0.0.1:${port}`, `ws://localhost:${port}`],
  });
}
