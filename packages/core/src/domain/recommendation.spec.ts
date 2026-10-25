import { describe, expect, it } from 'vitest';
import { parseRecommendation } from './recommendation';

describe('parseRecommendation', () => {
  it.each(['APPLY', 'APPLY_WITH_CAVEATS', 'SKIP'])('accepts %s', (input) => {
    expect(parseRecommendation(input)).toBe(input);
  });

  it.each(['ПОДАВАТИСЯ', 'apply', ' SKIP ', 'MAYBE', 'toString'])('rejects %j', (input) => {
    expect(() => parseRecommendation(input)).toThrow(/Unknown recommendation/);
  });
});
