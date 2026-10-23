import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Fact, FactList, FactRow } from './FactList';

describe('FactList', () => {
  it('lists each fact as one row of its label and value', () => {
    render(
      <FactList>
        <Fact label="Salary">not listed</Fact>
        <FactRow>
          <span>placeholder</span>
        </FactRow>
      </FactList>,
    );
    const rows = screen.getAllByTestId('fact-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Salarynot listed');
    expect(rows[1]).toHaveTextContent('placeholder');
  });
});
