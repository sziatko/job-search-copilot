import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IconPerson } from '../icons';
import { ComingSoon } from './ComingSoon';

describe('ComingSoon', () => {
  it('says what is coming, and lists it', () => {
    render(
      <ComingSoon
        icon={IconPerson}
        title="Profile — coming soon"
        description="Where your profile will live."
        items={['Editable profile', 'Resume variants']}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Profile — coming soon' })).toBeInTheDocument();
    expect(screen.getByText('Where your profile will live.')).toBeInTheDocument();
    expect(screen.getByText('· Resume variants')).toBeInTheDocument();
  });
});
