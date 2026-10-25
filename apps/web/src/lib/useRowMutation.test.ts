import {
  type InfiniteData,
  QueryClient,
  QueryClientProvider,
  useMutation,
} from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { useRowMutation } from './useRowMutation';

interface Row {
  id: number;
  label: string;
}

type Pages = InfiniteData<{ items: Row[] }, unknown>;

const pages = (...items: Row[]): Pages => ({ pages: [{ items }], pageParams: [undefined] });

/** A request the test settles by hand, so the in-flight state can be read. */
function held() {
  let settle = { resolve: () => {}, reject: (_err: Error) => {} };
  const promise = new Promise<void>((resolve, reject) => {
    settle = { resolve: () => resolve(), reject };
  });
  return { promise, ...settle };
}

function setup(request: () => Promise<void>) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  // Two filters' entries under one prefix: a write has to reach both.
  client.setQueryData(['rows', 'a'], pages({ id: 1, label: 'old' }, { id: 2, label: 'other' }));
  client.setQueryData(['rows', 'b'], pages({ id: 1, label: 'old' }));
  client.setQueryData(['counts'], 3);
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  const { result } = renderHook(
    () => {
      const rows = useRowMutation<Row>(['rows']);
      const write = useMutation(
        rows.rowMutation({
          mutationFn: (_vars: { id: number; label: string }) => request(),
          patch: (item, { label }) => ({ ...item, label }),
          invalidates: [['counts']],
        }),
      );
      return { ...rows, write };
    },
    { wrapper },
  );
  const labels = (key: string) =>
    client
      .getQueryData<Pages>(['rows', key])
      ?.pages.flatMap((page) => page.items.map((i) => i.label));
  return { client, result, labels };
}

describe('useRowMutation', () => {
  it('patches every cached list, marks the row saving, and rolls back with a row error', async () => {
    const request = held();
    const { result, labels } = setup(() => request.promise);

    act(() => result.current.write.mutate({ id: 1, label: 'new' }));

    await waitFor(() => expect(labels('a')).toEqual(['new', 'other']));
    expect(labels('b')).toEqual(['new']);
    expect([...result.current.savingIds]).toEqual([1]);

    await act(async () => request.reject(new Error('Server said no')));

    await waitFor(() => expect(result.current.savingIds.size).toBe(0));
    expect(labels('a')).toEqual(['old', 'other']);
    expect(labels('b')).toEqual(['old']);
    expect(result.current.rowErrors).toEqual(new Map([[1, 'Server said no']]));
  });

  it("clears the row's error on its next write, and marks the given keys stale", async () => {
    let fail = true;
    const { client, result } = setup(async () => {
      if (fail) throw new Error('Server said no');
    });

    act(() => result.current.write.mutate({ id: 1, label: 'new' }));
    await waitFor(() => expect(result.current.rowErrors.get(1)).toBe('Server said no'));

    fail = false;
    act(() => result.current.write.mutate({ id: 1, label: 'new' }));
    await waitFor(() => expect(result.current.write.isSuccess).toBe(true));
    expect(result.current.rowErrors.size).toBe(0);
    expect(client.getQueryState(['counts'])?.isInvalidated).toBe(true);
  });
});
