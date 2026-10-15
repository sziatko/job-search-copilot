import { describe, expect, it } from 'vitest';
import { deriveRecommendationFromScore, parseRecommendation } from './recommendation';

describe('parseRecommendation', () => {
  it.each(['APPLY', 'APPLY_WITH_CAVEATS', 'SKIP'])('accepts %s', (input) => {
    expect(parseRecommendation(input)).toBe(input);
  });

  it.each(['ПОДАВАТИСЯ', 'apply', ' SKIP ', 'MAYBE', 'toString'])('rejects %j', (input) => {
    expect(() => parseRecommendation(input)).toThrow(/Unknown recommendation/);
  });
});

describe('deriveRecommendationFromScore', () => {
  it.each([
    [100, 'APPLY'],
    [70, 'APPLY'],
    [69, 'APPLY_WITH_CAVEATS'],
    [50, 'APPLY_WITH_CAVEATS'],
    [49, 'SKIP'],
    [0, 'SKIP'],
  ])('maps %d -> %s', (score, expected) => {
    expect(deriveRecommendationFromScore(score)).toBe(expected);
  });
});
