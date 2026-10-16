import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { RequestHandler } from 'msw';
import { createElement } from 'react';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routeTree } from '@/router';
import { buildHandlers, type FakeVacancy, fakeVacancy, holdGet } from '@/test/msw/handlers';
import { mswServer } from '@/test/msw/server';
import {
  expectLoadedPage,
  expectLoadedTable,
  expectSkeletonPage,
  expectSkeletonTable,
} from '@/test/skeleton';

/** `first` go in front of the fake's own handlers — a `holdGet` must. */
function renderAt(path: string, rows: FakeVacancy[], ...first: RequestHandler[]) {
  mswServer.use(...first, ...buildHandlers(rows));
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router })));
}

/** The writes the page sent, as `METHOD /path`. */
function recordWrites(): string[] {
  const writes: string[] = [];
  mswServer.events.on('request:start', ({ request }) => {
    if (request.method !== 'GET') {
      writes.push(`${request.method} ${new URL(request.url).pathname}`);
    }
  });
  return writes;
}

/** The card whose heading matches `name`. */
async function card(name: RegExp) {
  const heading = await screen.findByRole('heading', { name });
  return within(heading.closest('.card') as HTMLElement);
}

const applied = () =>
  fakeVacancy({
    id: 1,
    company: 'Acme',
    title: 'Backend Engineer',
    fullText: 'We build things.',
    status: 'APPLIED',
    salaryInApplication: '130 PLN/h',
    timeline: [
      { status: 'NOT_REVIEWED', createdAt: '2026-09-01T00:00:00.000Z' },
      { status: 'APPLIED', createdAt: '2026-09-03T00:00:00.000Z' },
    ],
    comments: [
      { id: 1, createdAt: '2026-09-01T00:00:00.000Z', body: 'Strong match.', source: 'ANALYZER' },
      { id: 2, createdAt: '2026-09-03T00:00:00.000Z', body: 'Sent the CV.', source: 'USER' },
    ],
  });

describe('VacancyPage', () => {
  afterEach(() => {
    mswServer.events.removeAllListeners();
    vi.restoreAllMocks();
  });

  it('shows the header, the timeline, the comments, the details and the other vacancies', async () => {
    renderAt('/vacancies/1', [
      applied(),
      fakeVacancy({ id: 2, company: 'Acme', title: 'Frontend Engineer' }),
      fakeVacancy({ id: 3, company: 'Globex', title: 'Data Engineer' }),
    ]);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Backend Engineer' }),
    ).toBeInTheDocument();
    expect(screen.getByText('We build things.')).toBeInTheDocument();
    // Past APPLIED, the pipeline select.
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('APPLIED');

    const timeline = await card(/status history/i);
    expect(timeline.getByText('Not reviewed')).toBeInTheDocument();
    expect(timeline.getByText('Applied')).toBeInTheDocument();

    const comments = await card(/^comments/i);
    expect(comments.getByText('2 entries')).toBeInTheDocument();
    expect(comments.getByText('LLM analysis')).toBeInTheDocument();
    expect(comments.getByText('Sent the CV.')).toBeInTheDocument();

    const details = await card(/^details$/i);
    // What the user entered when applying, not necessarily the listing's figure.
    expect(details.getByText('Salary').closest('.fact-row')).toHaveTextContent('130 PLN/h');
    expect(details.getByText('example.com')).toBeInTheDocument();

    // The company's others, this one left out.
    const others = await card(/other vacancies at acme/i);
    expect(await others.findByText('Frontend Engineer')).toBeInTheDocument();
    expect(others.queryByText('Backend Engineer')).not.toBeInTheDocument();
    expect(others.queryByText('Data Engineer')).not.toBeInTheDocument();
    expect(others.getByRole('link', { name: /open vacancy details/i })).toHaveAttribute(
      'href',
      '/vacancies/2',
    );
  });

  it('asks for the other vacancies by company, whatever its spelling (ADR-0032)', async () => {
    const asked: (string | null)[] = [];
    mswServer.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/vacancies')) asked.push(url.searchParams.get('sameCompanyAs'));
    });
    renderAt('/vacancies/1', [applied()]);

    await card(/other vacancies at acme/i);
    await waitFor(() => expect(asked).toEqual(['Acme']));
  });

  it('draws a skeleton of the header and the cards while the vacancy loads', async () => {
    const hold = holdGet('/vacancies/1');
    renderAt(
      '/vacancies/1',
      [applied(), fakeVacancy({ id: 2, company: 'Acme', title: 'Frontend Engineer' })],
      hold.handler,
    );

    const page = await expectSkeletonPage();
    const facts = page.querySelectorAll('.fact-row').length;
    hold.release();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Backend Engineer' }),
    ).toBeInTheDocument();
    // The other vacancies load after it, with skeleton rows of their own.
    await (await card(/other vacancies at acme/i)).findByText('Frontend Engineer');
    expectLoadedPage();
    // A skeleton row for each fact the details card lists.
    expect(document.querySelectorAll('.fact-row')).toHaveLength(facts);
  });

  it('draws skeleton rows under the other vacancies header while they load', async () => {
    const hold = holdGet('/vacancies');
    renderAt(
      '/vacancies/1',
      [applied(), fakeVacancy({ id: 2, company: 'Acme', title: 'Data Engineer' })],
      hold.handler,
    );

    const others = await card(/other vacancies at acme/i);
    const table = await expectSkeletonTable('Vacancy', others);
    hold.release();
    await expectLoadedTable(table, 'Data Engineer');
  });

  it('says "No posting text" in place of the text of a vacancy that has none', async () => {
    renderAt('/vacancies/1', [fakeVacancy({ id: 1, fullText: null })]);

    const description = await card(/^description$/i);
    expect(description.getByText('No posting text')).toBeInTheDocument();
  });

  it('says "Not analysed yet" in place of the score of a vacancy with no analysis', async () => {
    renderAt('/vacancies/1', [
      fakeVacancy({
        id: 1,
        status: 'NEW',
        matchScore: null,
        recommendation: null,
        estimationComment: null,
      }),
    ]);

    await screen.findByRole('heading', { level: 1, name: 'Backend Engineer' });
    const meta = document.querySelector('.detail-meta-row') as HTMLElement;
    expect(within(meta).getByText('Not analysed yet')).toBeInTheDocument();
    expect(meta.querySelector('.pill')).toBeNull();
  });

  it('shows the score, not "Not analysed yet", once there is an analysis', async () => {
    renderAt('/vacancies/1', [fakeVacancy({ id: 1, matchScore: 80 })]);

    await screen.findByRole('heading', { level: 1, name: 'Backend Engineer' });
    const meta = document.querySelector('.detail-meta-row') as HTMLElement;
    expect(within(meta).getByText('80%')).toBeInTheDocument();
    expect(within(meta).queryByText('Not analysed yet')).not.toBeInTheDocument();
  });

  it('says so for an unknown id', async () => {
    renderAt('/vacancies/42', [fakeVacancy({ id: 1 })]);

    expect(await screen.findByText('Vacancy not found.')).toBeInTheDocument();
  });

  it('moves a triage status through the vacancy endpoint', async () => {
    const success = vi.spyOn(toast, 'success');
    const rows = [fakeVacancy({ id: 1, status: 'NOT_REVIEWED' })];
    const writes = recordWrites();
    renderAt('/vacancies/1', rows);

    await userEvent.selectOptions(await screen.findByRole('combobox'), 'UNAVAILABLE');

    const timeline = await card(/status history/i);
    expect(await timeline.findByText('Unavailable')).toBeInTheDocument();
    expect(writes).toEqual(['PATCH /api/v1/vacancies/1/status']);
    expect(rows[0].status).toBe('UNAVAILABLE');
    expect(success).toHaveBeenCalledWith('Moved to Unavailable', {
      description: expect.stringContaining(' — '),
    });
  });

  it('saves for later through its dialog, with the comment', async () => {
    const success = vi.spyOn(toast, 'success');
    const rows = [fakeVacancy({ id: 1, status: 'NOT_REVIEWED' })];
    const writes = recordWrites();
    renderAt('/vacancies/1', rows);

    await userEvent.selectOptions(await screen.findByRole('combobox'), 'SAVED_FOR_LATER');
    // Nothing written until the dialog is sent.
    const dialog = within(screen.getByRole('dialog'));
    expect(writes).toEqual([]);
    await userEvent.type(dialog.getByRole('textbox', { name: 'Comment' }), 'Back in May.');
    await userEvent.click(dialog.getByRole('button', { name: 'Save for later' }));

    const comments = await card(/^comments/i);
    expect(await comments.findByText('Back in May.')).toBeInTheDocument();
    expect(writes).toEqual(['PATCH /api/v1/vacancies/1/status']);
    expect(rows[0].status).toBe('SAVED_FOR_LATER');
    expect(success).toHaveBeenCalledWith('Moved to Saved for later', {
      description: expect.stringContaining(' — '),
    });
  });

  it('writes nothing when the Save for later dialog is cancelled', async () => {
    const rows = [fakeVacancy({ id: 1, status: 'NOT_REVIEWED' })];
    const writes = recordWrites();
    renderAt('/vacancies/1', rows);

    await userEvent.selectOptions(await screen.findByRole('combobox'), 'SAVED_FOR_LATER');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(writes).toEqual([]);
    expect(rows[0].status).toBe('NOT_REVIEWED');
  });

  /** The status select's options, as labels, in order. */
  function statusOptions() {
    const select = screen.getByRole('combobox', { name: 'Status' }) as HTMLSelectElement;
    return [...select.options].map((option) => option.textContent);
  }

  const unanalysed = { matchScore: null, recommendation: null, estimationComment: null } as const;

  it("offers a NEW vacancy only the row buttons' Filter out, under its own status", async () => {
    const rows = [fakeVacancy({ id: 1, status: 'NEW', ...unanalysed })];
    const writes = recordWrites();
    renderAt('/vacancies/1', rows);

    expect(await screen.findByRole('combobox')).toHaveValue('NEW');
    expect(statusOptions()).toEqual(['New', 'Filtered out']);

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'FILTERED_OUT');
    await waitFor(() => expect(rows[0].status).toBe('FILTERED_OUT'));
    expect(writes).toEqual(['PATCH /api/v1/vacancies/1/status']);
    // Unanalysed, so it can go back to the queue.
    await waitFor(() => expect(statusOptions()).toEqual(['Filtered out', 'New']));
  });

  it('puts an unanalysed FILTERED_OUT vacancy back in the queue', async () => {
    const rows = [fakeVacancy({ id: 1, status: 'FILTERED_OUT', ...unanalysed })];
    renderAt('/vacancies/1', rows);

    expect(await screen.findByRole('combobox')).toHaveValue('FILTERED_OUT');
    expect(statusOptions()).toEqual(['Filtered out', 'New']);
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeEnabled();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'NEW');
    await waitFor(() => expect(rows[0].status).toBe('NEW'));
  });

  it('offers an analysed FILTERED_OUT vacancy nowhere to go', async () => {
    renderAt('/vacancies/1', [
      fakeVacancy({ id: 1, status: 'FILTERED_OUT', recommendation: 'SKIP', matchScore: 20 }),
    ]);

    // The server refuses NEW on an analysed row, as on /inbox.
    expect(await screen.findByRole('combobox')).toHaveValue('FILTERED_OUT');
    expect(statusOptions()).toEqual(['Filtered out']);
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeDisabled();
  });

  it('offers a triage vacancy the /vacancies actions, as before', async () => {
    renderAt('/vacancies/1', [fakeVacancy({ id: 1, status: 'SAVED_FOR_LATER' })]);

    expect(await screen.findByRole('combobox')).toHaveValue('SAVED_FOR_LATER');
    expect(statusOptions()).toEqual([
      'Not reviewed',
      'Saved for later',
      'Declined',
      'Unavailable',
      'Applied',
    ]);
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeEnabled();
  });

  it('applies through the apply dialog, which records the application', async () => {
    const rows = [fakeVacancy({ id: 1, status: 'NOT_REVIEWED' })];
    const writes = recordWrites();
    renderAt('/vacancies/1', rows);

    await userEvent.selectOptions(await screen.findByRole('combobox'), 'APPLIED');
    await userEvent.click(await screen.findByRole('button', { name: 'OK' }));

    await waitFor(() => expect(rows[0].status).toBe('APPLIED'));
    expect(writes).toEqual(['POST /api/v1/applications']);
    // Now in the pipeline: the select offers the pipeline's statuses.
    expect(await screen.findByRole('option', { name: 'Action needed' })).toBeInTheDocument();
  });

  it('moves a pipeline status through the applications endpoint', async () => {
    const success = vi.spyOn(toast, 'success');
    const rows = [applied()];
    const writes = recordWrites();
    renderAt('/vacancies/1', rows);

    await userEvent.selectOptions(await screen.findByRole('combobox'), 'INTERVIEW');

    await waitFor(() => expect(rows[0].status).toBe('INTERVIEW'));
    expect(writes).toEqual(['PATCH /api/v1/applications/1/status']);
    await waitFor(() =>
      expect(success).toHaveBeenCalledWith('Moved to Interview', {
        description: 'Backend Engineer — Acme',
      }),
    );
  });

  it('adds a comment, then shows it', async () => {
    const success = vi.spyOn(toast, 'success');
    const rows = [fakeVacancy({ id: 1, status: 'NOT_REVIEWED' })];
    const writes = recordWrites();
    renderAt('/vacancies/1', rows);

    await userEvent.type(
      await screen.findByRole('textbox', { name: /add a comment/i }),
      'Ask about the rate.{Enter}',
    );

    const comments = await card(/^comments/i);
    expect(await comments.findByText('Ask about the rate.')).toBeInTheDocument();
    expect(writes).toEqual(['PATCH /api/v1/applications/1']);
    expect(comments.getByRole('textbox', { name: /add a comment/i })).toHaveValue('');
    expect(success).toHaveBeenCalledWith('Comment added');
  });

  it('is linked from each row of /vacancies', async () => {
    renderAt('/vacancies?status=ALL', [
      fakeVacancy({ id: 7, status: 'NOT_REVIEWED' }),
      fakeVacancy({ id: 8, status: 'SAVED_FOR_LATER', applyUrl: 'https://example.com/8' }),
    ]);
    await screen.findAllByRole('link', { name: /open vacancy details/i });
    expect(
      screen
        .getAllByRole('link', { name: /open vacancy details/i })
        .map((link) => link.getAttribute('href')),
    ).toEqual(expect.arrayContaining(['/vacancies/7', '/vacancies/8']));
  });

  it('is linked from each row of the application tracker', async () => {
    renderAt('/applications', [fakeVacancy({ id: 8, status: 'APPLIED' })]);

    expect(await screen.findByRole('link', { name: /open vacancy details/i })).toHaveAttribute(
      'href',
      '/vacancies/8',
    );
  });
});
