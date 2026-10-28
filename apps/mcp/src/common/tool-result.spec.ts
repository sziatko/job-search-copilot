import { VacancyNotFoundError } from '@job-search-copilot/core';
import { describe, expect, it, vi } from 'vitest';
import { withDomainErrors } from './tool-result';

describe('withDomainErrors', () => {
  it('reports a domain error to the caller as a tool error', async () => {
    const tool = withDomainErrors(async () => {
      throw new VacancyNotFoundError('Vacancy 7 not found');
    });
    expect(await tool()).toEqual({
      isError: true,
      content: [{ type: 'text', text: 'Vacancy 7 not found' }],
    });
  });

  it('throws anything else as a bare "Internal error", the real one only logged', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fault = new Error('Invalid `prisma.vacancy.findMany()` invocation: column x');
    const tool = withDomainErrors(async () => {
      throw fault;
    });
    await expect(tool()).rejects.toThrow(/^Internal error$/);
    expect(log).toHaveBeenCalledWith(fault);
    log.mockRestore();
  });
});
