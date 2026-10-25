import { screen } from '@testing-library/react';

/** The companies down the table, top to bottom — read off each row's Copy button,
 * named "Copy <title> at <company>": the one control every vacancy row has. */
export function companyOrder(): string[] {
  return screen
    .getAllByRole('button', { name: /^Copy / })
    .map((button) => button.getAttribute('aria-label')?.replace(/^Copy .* at /, '') ?? '');
}
