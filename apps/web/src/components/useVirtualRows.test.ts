import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useVirtualRows } from './useVirtualRows';

describe('useVirtualRows', () => {
  it('scrolls the box back to the top when the reset key changes, not on other renders', () => {
    const box = document.createElement('div');
    const scrollRef = { current: box };
    const { rerender } = renderHook(
      ({ key, count }) => useVirtualRows(scrollRef, count, undefined, key),
      {
        initialProps: { key: 'ALL', count: 50 },
      },
    );

    box.scrollTop = 400;
    rerender({ key: 'ALL', count: 80 }); // more rows loaded: the offset stays
    expect(box.scrollTop).toBe(400);

    rerender({ key: 'APPLIED', count: 80 });
    expect(box.scrollTop).toBe(0);
  });
});
