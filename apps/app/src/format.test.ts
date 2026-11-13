import { describe, expect, it } from 'vitest';
import { formatCompact, formatMs, formatNumber, formatPct, formatRps, formatUsd } from './format';

describe('pt-BR formatting (NFR-8)', () => {
  it('formats money', () => {
    expect(formatUsd(7.592)).toBe('US$ 7,59');
    expect(formatUsd(1234.5)).toBe('US$ 1.234,50');
  });

  it('formats req/s', () => {
    expect(formatRps(16_666.7)).toBe('16.667 req/s');
    expect(formatRps(0.2)).toBe('0,2 req/s');
    expect(formatRps(400)).toBe('400 req/s');
  });

  it('formats milliseconds', () => {
    expect(formatMs(333.33)).toBe('333 ms');
    expect(formatMs(1.25)).toBe('1,3 ms');
  });

  it('formats percentages', () => {
    expect(formatPct(0.976)).toBe('97,6%');
    expect(formatPct(41.667, 0)).toBe('4.167%');
  });

  it('formats plain numbers', () => {
    expect(formatNumber(1_000_000)).toBe('1.000.000');
  });

  it('formats compact numbers without forced decimals', () => {
    expect(formatCompact(1)).toBe('1');
    expect(formatCompact(0.01)).toBe('0,01');
    expect(formatCompact(1000)).toBe('1.000');
  });
});
