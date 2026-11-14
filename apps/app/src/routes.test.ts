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

  it('parses the study screen of a problem (study-mode FR-1)', () => {
    expect(parseHash('#/problems/url-shortener/study')).toEqual({
      screen: 'study',
      problemId: 'url-shortener',
    });
    expect(parseHash('#/problems/url-shortener/study/x')).toEqual({ screen: 'not-found' });
    expect(parseHash('#/problems/../study')).toEqual({ screen: 'not-found' });
  });

  it('rejects anything else, including path-like ids', () => {
    expect(parseHash('#/problems/../etc')).toEqual({ screen: 'not-found' });
    expect(parseHash('#/admin')).toEqual({ screen: 'not-found' });
  });

  it('round-trips hrefs', () => {
    const r = { screen: 'problem', problemId: 'ticketing' } as const;
    expect(parseHash(hrefOf(r))).toEqual(r);
    const study = { screen: 'study', problemId: 'ticketing' } as const;
    expect(hrefOf(study)).toBe('#/problems/ticketing/study');
    expect(parseHash(hrefOf(study))).toEqual(study);
  });
});
