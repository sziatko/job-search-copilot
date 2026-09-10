import { describe, expect, it } from 'vitest';
import { normalizeRecommendation } from './recommendation';

describe('normalizeRecommendation', () => {
  it.each([
    ['APPLY', 'APPLY'],
    ['ПОДАВАТИСЯ', 'APPLY'],
    ['APPLY_WITH_CAVEATS', 'APPLY_WITH_CAVEATS'],
    ['ПОДАВАТИСЯ З ЗАСТЕРЕЖЕННЯМИ', 'APPLY_WITH_CAVEATS'],
    ['SKIP', 'SKIP'],
    ['ПРОПУСТИТИ', 'SKIP'],
  ])('maps %s -> %s', (input, expected) => {
    expect(normalizeRecommendation(input)).toBe(expected);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(normalizeRecommendation('  apply_with_caveats  ')).toBe('APPLY_WITH_CAVEATS');
    expect(normalizeRecommendation('пропустити')).toBe('SKIP');
  });

  it('throws a descriptive error for unknown input', () => {
    expect(() => normalizeRecommendation('MAYBE')).toThrow(/Unknown recommendation "MAYBE"/);
  });
});
