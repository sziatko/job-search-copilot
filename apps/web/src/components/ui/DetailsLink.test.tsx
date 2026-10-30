import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DetailsLink } from './DetailsLink';

function renderLink(newTab?: boolean) {
  const rootRoute = createRootRoute({ component: () => <DetailsLink id={7} newTab={newTab} /> });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  // A root-only tree: the app's registered router types do not describe it.
  render(<RouterProvider router={router as never} />);
}

describe('DetailsLink', () => {
  it("links to the vacancy's page, in place", async () => {
    renderLink();
    const link = await screen.findByRole('link', { name: 'Open vacancy details' });
    expect(link).toHaveAttribute('href', '/vacancies/7');
    expect(link).not.toHaveAttribute('target');
  });

  it('opens a new tab from a modal', async () => {
    renderLink(true);
    const link = await screen.findByRole('link', { name: 'Open vacancy details' });
    expect(link).toHaveAttribute('target', '_blank');
  });
});
