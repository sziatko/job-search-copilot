import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { routeTree } from '@/router';
import { buildHandlers, type FakeVacancy, fakeVacancy } from '@/test/msw/handlers';
import { mswServer } from '@/test/msw/server';

function renderAt(path: string, rows: FakeVacancy[]) {
  mswServer.use(...buildHandlers(rows));
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
    salaryInListing: '130 PLN/h',
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
    expect(screen.getByRole('combobox')).toHaveValue('APPLIED');

    const timeline = await card(/status history/i);
    expect(timeline.getByText('Not reviewed')).toBeInTheDocument();
    expect(timeline.getByText('Applied')).toBeInTheDocument();

    const comments = await card(/^comments/i);
    expect(comments.getByText('2 entries')).toBeInTheDocument();
    expect(comments.getByText('LLM analysis')).toBeInTheDocument();
    expect(comments.getByText('Sent the CV.')).toBeInTheDocument();

    const details = await card(/^details$/i);
    expect(details.getByText('130 PLN/h')).toBeInTheDocument();
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

  it('shows a placeholder for the text of a vacancy recorded without a posting', async () => {
    renderAt('/vacancies/1', [fakeVacancy({ id: 1, fullText: 'N/A' })]);

    expect(await screen.findByText('No description')).toBeInTheDocument();
  });

  it('says so for an unknown id', async () => {
    renderAt('/vacancies/42', [fakeVacancy({ id: 1 })]);

    expect(await screen.findByText('Vacancy not found.')).toBeInTheDocument();
  });

  it('moves a triage status through the vacancy endpoint', async () => {
    const rows = [fakeVacancy({ id: 1, status: 'NOT_REVIEWED' })];
    const writes = recordWrites();
    renderAt('/vacancies/1', rows);

    await userEvent.selectOptions(await screen.findByRole('combobox'), 'SAVED_FOR_LATER');

    const timeline = await card(/status history/i);
    expect(await timeline.findByText('Saved for later')).toBeInTheDocument();
    expect(writes).toEqual(['PATCH /api/v1/vacancies/1/status']);
    expect(rows[0].status).toBe('SAVED_FOR_LATER');
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
    expect(await screen.findByRole('option', { name: 'Recruiter screen' })).toBeInTheDocument();
  });

  it('moves a pipeline status through the applications endpoint', async () => {
    const rows = [applied()];
    const writes = recordWrites();
    renderAt('/vacancies/1', rows);

    await userEvent.selectOptions(await screen.findByRole('combobox'), 'INTERVIEW');

    await waitFor(() => expect(rows[0].status).toBe('INTERVIEW'));
    expect(writes).toEqual(['PATCH /api/v1/applications/1/status']);
  });

  it('adds a comment, then shows it', async () => {
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
  });

  it('is linked from each row of both tables', async () => {
    renderAt('/vacancies?status=ALL', [
      fakeVacancy({ id: 7, status: 'NOT_REVIEWED' }),
      fakeVacancy({ id: 8, status: 'APPLIED', applyUrl: 'https://example.com/8' }),
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
