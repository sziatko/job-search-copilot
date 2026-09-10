import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { buildHandlers } from '@/test/msw/handlers';
import { mswServer } from '@/test/msw/server';
import type { EstimatedVacancyListItem } from './types';
import { useVacancies } from './useVacancies';

// Fresh client per render so tests don't share cache; retries off so a mocked
// failure surfaces immediately instead of after backoff.
function withQueryClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

function vacancy(overrides: Partial<EstimatedVacancyListItem> = {}): EstimatedVacancyListItem {
  return {
    id: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    company: 'Acme',
    title: 'Backend Engineer',
    applyUrl: 'https://example.com/1',
    matchScore: 80,
    recommendation: 'APPLY',
    estimationComment: 'Strong match.',
    userAction: 'NOT_REVIEWED',
    userActionUpdatedAt: null,
    ...overrides,
  };
}

async function setUpWithItems(items: EstimatedVacancyListItem[]) {
  mswServer.use(...buildHandlers(items));
  const view = renderHook(() => useVacancies(), { wrapper: withQueryClient() });
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

describe('useVacancies', () => {
  it('defaults to the NOT_REVIEWED filter and hides everything else', async () => {
    const items = [
      vacancy({ id: 1, userAction: 'NOT_REVIEWED' }),
      vacancy({ id: 2, userAction: 'DECLINED' }),
      vacancy({ id: 3, userAction: 'APPLIED' }),
    ];
    const { result } = await setUpWithItems(items);

    expect(result.current.statusFilter).toBe('NOT_REVIEWED');
    expect(result.current.visibleItems.map((i) => i.id)).toEqual([1]);
  });

  it('sorts by recommendation (APPLY first) then by match score descending', async () => {
    const items = [
      vacancy({ id: 1, recommendation: 'SKIP', matchScore: 90 }),
      vacancy({ id: 2, recommendation: 'APPLY', matchScore: 60 }),
      vacancy({ id: 3, recommendation: 'APPLY', matchScore: 95 }),
      vacancy({ id: 4, recommendation: 'APPLY_WITH_CAVEATS', matchScore: 99 }),
    ];
    const { result } = await setUpWithItems(items);
    void act(() => result.current.setStatusFilter('ALL'));

    await waitFor(() => expect(result.current.visibleItems.map((i) => i.id)).toEqual([3, 2, 4, 1]));
  });

  it('saves non-consequential actions immediately, without a confirmation step', async () => {
    const items = [vacancy({ id: 1, userAction: 'NOT_REVIEWED' })];
    const { result } = await setUpWithItems(items);

    act(() => result.current.requestActionChange(1, 'READY_TO_APPLY'));

    expect(result.current.pendingDecline).toBeNull();
    expect(result.current.pendingApply).toBeNull();
    // NOT_REVIEWED filter still active -> the now-READY_TO_APPLY item drops out of view.
    await waitFor(() => expect(result.current.visibleItems).toHaveLength(0));
  });

  it('requires confirmation before persisting DECLINED', async () => {
    const items = [vacancy({ id: 1, company: 'Acme', title: 'Backend Engineer' })];
    const { result } = await setUpWithItems(items);

    act(() => result.current.requestActionChange(1, 'DECLINED'));
    expect(result.current.pendingDecline).toEqual({
      id: 1,
      company: 'Acme',
      title: 'Backend Engineer',
    });
    // Not saved yet.
    expect(result.current.visibleItems).toHaveLength(1);

    act(() => result.current.confirmDecline());
    expect(result.current.pendingDecline).toBeNull();
    await waitFor(() => expect(result.current.visibleItems).toHaveLength(0));
  });

  it('cancelDecline discards the pending change without saving', async () => {
    const items = [vacancy({ id: 1 })];
    const { result } = await setUpWithItems(items);

    act(() => result.current.requestActionChange(1, 'DECLINED'));
    act(() => result.current.cancelDecline());

    expect(result.current.pendingDecline).toBeNull();
    expect(result.current.visibleItems).toHaveLength(1);
    expect(result.current.visibleItems[0].userAction).toBe('NOT_REVIEWED');
  });

  it('requires confirmation before persisting APPLIED', async () => {
    const items = [vacancy({ id: 1 })];
    const { result } = await setUpWithItems(items);

    act(() => result.current.requestActionChange(1, 'APPLIED'));
    expect(result.current.pendingApply?.id).toBe(1);

    act(() => result.current.confirmApply());
    expect(result.current.pendingApply).toBeNull();
    await waitFor(() => expect(result.current.visibleItems).toHaveLength(0));
  });

  it('surfaces a row error and leaves the item unchanged when the save fails', async () => {
    const items = [vacancy({ id: 1 })];
    mswServer.use(
      http.get('http://localhost:3000/api/v1/estimated-vacancies', () =>
        HttpResponse.json({ items, total: items.length }),
      ),
      http.patch('http://localhost:3000/api/v1/estimated-vacancies/:id/user-action', () =>
        HttpResponse.json(null, { status: 500 }),
      ),
    );
    const view = renderHook(() => useVacancies(), { wrapper: withQueryClient() });
    await waitFor(() => expect(view.result.current.loading).toBe(false));

    act(() => view.result.current.requestActionChange(1, 'READY_TO_APPLY'));

    await waitFor(() => expect(view.result.current.rowErrors.get(1)).toBeTruthy());
    expect(view.result.current.savingIds.has(1)).toBe(false);
    expect(view.result.current.visibleItems[0].userAction).toBe('NOT_REVIEWED');
  });
});
