import { describe, expect, it } from 'vitest';
import { hrefOf, parseHash } from './routes';

describe('routes', () => {
  it('parses the four screens', () => {
    expect(parseHash('')).toEqual({ screen: 'home' });
    expect(parseHash('#/')).toEqual({ screen: 'home' });
    expect(parseHash('#/free')).toEqual({ screen: 'free' });
    expect(parseHash('#/problems')).toEqual({ screen: 'problems' });
    expect(parseHash('#/problems/url-shortener')).toEqual({
      screen: 'problem',
      problemId: 'url-shortener',
    });
  });

  it('rejects anything else, including path-like ids', () => {
    expect(parseHash('#/problems/../etc')).toEqual({ screen: 'not-found' });
    expect(parseHash('#/admin')).toEqual({ screen: 'not-found' });
  });

  it('round-trips hrefs', () => {
    const r = { screen: 'problem', problemId: 'ticketing' } as const;
    expect(parseHash(hrefOf(r))).toEqual(r);
  });
});
