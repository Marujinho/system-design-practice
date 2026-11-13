import { describe, expect, it } from 'vitest';
import { cspDev, cspProduction } from './csp';
import config, { DEV_PORT, HOST } from './vite.config';

describe('server configuration (PRD §12 A02)', () => {
  it('binds dev and preview to 127.0.0.1 with a strict port', () => {
    expect(HOST).toBe('127.0.0.1');
    expect(config.server?.host).toBe('127.0.0.1');
    expect(config.preview?.host).toBe('127.0.0.1');
    expect(config.server?.strictPort).toBe(true);
    expect(config.preview?.strictPort).toBe(true);
  });

  it('serves a strict CSP in preview: no unsafe-eval, no unsafe-inline scripts', () => {
    const csp = cspProduction();
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toMatch(/script-src 'self';/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(config.preview?.headers?.['Content-Security-Policy']).toBe(csp);
  });

  it('never allows unsafe-eval, even in dev', () => {
    expect(cspDev(DEV_PORT)).not.toContain('unsafe-eval');
  });

  it('ships no public source maps', () => {
    expect(config.build?.sourcemap).toBe(false);
  });

  it('keeps the reference solutions and the attempts off /@fs', () => {
    expect(config.server?.fs?.deny).toEqual(
      expect.arrayContaining(['**/reference.archsim.json', '**/practice/**']),
    );
  });
});
