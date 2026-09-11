import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { routeTree } from './router';
import { buildApplicationHandlers } from './test/msw/handlers';
import { mswServer } from './test/msw/server';

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router })),
  );
}

describe('router', () => {
  it('renders the index page with both navigation cards', async () => {
    renderAt('/');
    expect(await screen.findByRole('link', { name: /analyzed vacancies/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /application tracker/i })).toBeInTheDocument();
  });

  it('navigates from the index to /tracker', async () => {
    mswServer.use(...buildApplicationHandlers([]));
    const user = userEvent.setup();
    renderAt('/');
    await user.click(await screen.findByRole('link', { name: /application tracker/i }));
    expect(
      await screen.findByRole('heading', { name: /application tracker/i }),
    ).toBeInTheDocument();
  });
});
