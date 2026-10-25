import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ListCount, ListFrame } from './ListFrame';

describe('ListFrame', () => {
  it('puts the toolbar, with its count, above the list', () => {
    render(
      <ListFrame toolbar={<ListCount shown={20} total={45} />}>
        <p>The rows</p>
      </ListFrame>,
    );

    const count = screen.getByText('Showing 20 of 45');
    const list = screen.getByText('The rows');
    expect(count.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
