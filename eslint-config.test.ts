import { describe, expect, it } from 'vitest';
import config, { bannedSyntax } from './eslint.config.js';

describe('eslint config', () => {
  it('bans HTML injection sinks', () => {
    const selectors = bannedSyntax.map((s) => s.selector);
    expect(selectors.some((s) => s.includes('dangerouslySetInnerHTML'))).toBe(true);
    expect(selectors.some((s) => s.includes('innerHTML'))).toBe(true);
  });

  it('bans eval, new Function and any', () => {
    const rules: Record<string, unknown> = {};
    for (const c of config) Object.assign(rules, c.rules);
    expect(rules['no-eval']).toBe('error');
    expect(rules['no-new-func']).toBe('error');
    expect(rules['@typescript-eslint/no-explicit-any']).toBe('error');
  });

  it('keeps the simulation engine free of DOM, React and wall-clock time', () => {
    const engine = config.find((c) => c.files?.includes('packages/sim-engine/src/**/*.ts'));
    expect(engine?.rules?.['no-restricted-globals']).toEqual(
      expect.arrayContaining(['window', 'document', 'Date']),
    );
  });
});
