import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { routeTree } from '@/router';
import { buildApplicationHandlers } from '@/test/msw/handlers';
import { mswServer } from '@/test/msw/server';
import type { ApplicationListItem } from './types';

function application(overrides: Partial<ApplicationListItem> = {}): ApplicationListItem {
  return {
    id: 1,
    appliedAt: '2026-08-01T00:00:00.000Z',
    status: 'APPLIED',
    statusUpdatedAt: null,
    salaryInListing: null,
    usedTailoredResume: false,
    userComment: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    estimatedVacancyId: 1,
    company: 'Acme',
    title: 'Backend Engineer',
    applyUrl: 'https://example.com/1',
    matchScore: 80,
    recommendation: 'APPLY',
    estimationComment: 'Strong match.',
    ...overrides,
  };
}

function renderTracker(path = '/tracker') {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router })),
  );
}

describe('ApplicationsPage / useApplications', () => {
  it('lists applications and filters the search by company OR role', async () => {
    mswServer.use(
      ...buildApplicationHandlers([
        application({ id: 1, company: 'Acme', title: 'Backend Engineer' }),
        application({ id: 2, company: 'Beta Corp', title: 'Frontend Lead' }),
      ]),
    );
    renderTracker();
    await screen.findByText('Acme');
    expect(screen.getByText('Beta Corp')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText(/search company or role/i), 'lead');

    await waitFor(() => expect(screen.queryByText('Acme')).not.toBeInTheDocument());
    expect(screen.getByText('Beta Corp')).toBeInTheDocument();
  });

  it('orders rows by applied date, newest first', async () => {
    mswServer.use(
      ...buildApplicationHandlers([
        application({ id: 1, company: 'Older Co', appliedAt: '2026-08-01T00:00:00.000Z' }),
        application({ id: 2, company: 'Newest Co', appliedAt: '2026-09-10T00:00:00.000Z' }),
        application({ id: 3, company: 'Middle Co', appliedAt: '2026-08-20T00:00:00.000Z' }),
      ]),
    );
    renderTracker();
    await screen.findByText('Newest Co');
    const order = screen.getAllByText(/(Older|Newest|Middle) Co/).map((el) => el.textContent);
    expect(order).toEqual(['Newest Co', 'Middle Co', 'Older Co']);
  });

  it('filters by status', async () => {
    mswServer.use(
      ...buildApplicationHandlers([
        application({ id: 1, company: 'Acme', status: 'APPLIED' }),
        application({ id: 2, company: 'Beta Corp', status: 'REJECTED' }),
      ]),
    );
    renderTracker();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Status'), 'REJECTED');

    await waitFor(() => expect(screen.queryByText('Acme')).not.toBeInTheDocument());
    expect(screen.getByText('Beta Corp')).toBeInTheDocument();
  });

  it('shows a stats strip counting the whole (unfiltered) log', async () => {
    mswServer.use(
      ...buildApplicationHandlers([
        application({ id: 1, status: 'APPLIED' }),
        application({ id: 2, status: 'REJECTED' }),
        application({ id: 3, status: 'REJECTED' }),
        application({ id: 4, status: 'OFFER' }),
      ]),
    );
    renderTracker();
    const totalLabel = await screen.findByText('Total');
    const strip = totalLabel.parentElement?.parentElement as HTMLElement;
    const s = within(strip);
    expect(s.getByText('Offer')).toBeInTheDocument(); // non-zero, so shown
    expect(s.queryByText('Interview')).not.toBeInTheDocument(); // zero, not shown
    // Total + Applied + Rejected (always) + Offer (non-zero) = 4 cells.
    expect(strip.querySelectorAll('.text-lg')).toHaveLength(4);
  });

  it('optimistically changes a status and keeps it on success', async () => {
    mswServer.use(...buildApplicationHandlers([application({ id: 1, status: 'APPLIED' })]));
    renderTracker();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    const rowSelect = within(screen.getByRole('table')).getByRole('combobox');
    await user.selectOptions(rowSelect, 'INTERVIEW');

    await waitFor(() => expect((rowSelect as HTMLSelectElement).value).toBe('INTERVIEW'));
  });

  it('rolls the status back and shows a row error when the save fails', async () => {
    mswServer.use(
      http.get('http://localhost:3000/api/v1/applications', () =>
        HttpResponse.json({ items: [application({ id: 1, status: 'APPLIED' })], total: 1 }),
      ),
      http.patch('http://localhost:3000/api/v1/applications/:id/status', () =>
        HttpResponse.json(null, { status: 500 }),
      ),
    );
    renderTracker();
    await screen.findByText('Acme');

    const user = userEvent.setup();
    const rowSelect = within(screen.getByRole('table')).getByRole('combobox');
    await user.selectOptions(rowSelect, 'INTERVIEW');

    await screen.findByText(/failed to save|HTTP 500/i);
    expect((rowSelect as HTMLSelectElement).value).toBe('APPLIED');
  });

  it('shows a friendly error when the list response has the wrong shape', async () => {
    mswServer.use(
      http.get('http://localhost:3000/api/v1/applications', () =>
        HttpResponse.json({ items: 'not-an-array' }),
      ),
    );
    renderTracker();
    expect(await screen.findByText(/unexpected format/i)).toBeInTheDocument();
  });
});
