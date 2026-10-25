import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tag } from './Tag';
import { TONE, type Tone } from './tone';

describe('Tag', () => {
  it('shows its text in every tone', () => {
    for (const tone of Object.keys(TONE) as Tone[]) {
      const { unmount } = render(<Tag tone={tone}>{`Saved for later (${tone})`}</Tag>);
      expect(screen.getByText(`Saved for later (${tone})`)).toBeInTheDocument();
      unmount();
    }
  });
});
