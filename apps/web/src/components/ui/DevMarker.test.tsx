import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JscLogo } from '../icons';
import { DevMarker } from './DevMarker';

afterEach(() => vi.unstubAllEnvs());

describe('DevMarker', () => {
  it('marks the dev server: the DEV tab, and the logo named and drawn red', () => {
    vi.stubEnv('MODE', 'development');
    render(
      <>
        <DevMarker />
        <JscLogo />
      </>,
    );
    expect(screen.getByText('DEV · local copy')).toBeInTheDocument();
    const logo = screen.getByRole('img', { name: 'Job Search Copilot (dev)' });
    expect(logo.querySelector('rect')).toHaveAttribute('fill', '#DC3D3D');
  });

  it('shows nothing anywhere else — a build, e2e', () => {
    vi.stubEnv('MODE', 'e2e');
    render(
      <>
        <DevMarker />
        <JscLogo />
      </>,
    );
    expect(screen.queryByText('DEV · local copy')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Job Search Copilot' })).toBeInTheDocument();
  });
});
