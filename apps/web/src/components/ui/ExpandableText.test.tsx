import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { ExpandableText } from './ExpandableText';

// jsdom has no layout, so scrollHeight/clientHeight are always 0 and there's no
// ResizeObserver. Fake just enough: a span is "overflowing" when its text is long.
const scrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      return (this.textContent?.length ?? 0) > 60 ? 100 : 20;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 40,
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
  if (scrollHeight) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollHeight);
  if (clientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeight);
});

const LONG = 'A very long analysis comment '.repeat(5);

describe('ExpandableText', () => {
  it('shows no control when the text fits', () => {
    render(<ExpandableText text="short" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('expands on click and re-clamps on Escape', () => {
    render(<ExpandableText text={LONG} />);
    const button = screen.getByRole('button', { name: /show more/i });
    expect(button).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(button);
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/show less/i)).toBeInTheDocument();

    fireEvent.keyDown(button, { key: 'Escape' });
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  });

  it('collapses on Escape, and not on blur', () => {
    render(<ExpandableText text={LONG} />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');

    // The toggle is its own control, so losing focus must not close text the
    // user deliberately opened. (When the whole block was one button, blur *was*
    // the close gesture — that is the behaviour this replaced.)
    fireEvent.blur(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(button, { key: 'Escape' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});
