import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { routeTree } from '@/router';

describe('/profile', () => {
  it('holds no access card: they are on /settings', async () => {
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/profile'] }),
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router })),
    );

    expect(await screen.findByRole('heading', { name: /coming soon/i })).toBeVisible();
    for (const name of ['Passkeys', 'API keys', 'Connected apps']) {
      expect(screen.queryByRole('heading', { name })).not.toBeInTheDocument();
    }
  });
});
