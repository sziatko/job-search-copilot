import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { API_URL } from '@/test/msw/handlers';
import { mswServer } from '@/test/msw/server';
import { listApplications } from './api';
import type { ApplicationListItem } from './types';

function application(id: number, appliedAt: string): ApplicationListItem {
  return {
    id,
    appliedAt,
    status: 'APPLIED',
    statusChangedAt: appliedAt,
    comments: [],
    salaryInListing: null,
    usedTailoredResume: false,
    company: `Company ${id}`,
    title: `Role ${id}`,
    applyUrl: `https://example.com/${id}`,
    matchScore: 80,
  };
}

/** `count` rows, newest first — the order the endpoint itself returns. */
function log(count: number): ApplicationListItem[] {
  return Array.from({ length: count }, (_, i) =>
    application(i + 1, new Date(Date.UTC(2026, 0, 1) + i * 3_600_000).toISOString()),
  );
}

/** A paging endpoint over `rows`, recording the offset of every request it serves.
 * `total` is the real count unless overridden, which is how a server that
 * misreports its own size gets tested. */
function endpoint(rows: ApplicationListItem[], offsets: number[], total?: number, shift = 0) {
  return http.get(`${API_URL}/applications`, ({ request }) => {
    const query = new URL(request.url).searchParams;
    const limit = Number(query.get('limit') ?? 50);
    const offset = Number(query.get('offset') ?? 0);
    offsets.push(offset);
    // `shift` moves the window back a row on every page but the first, standing in
    // for a row inserted at the top mid-load: the next page then re-serves one row
    // it already sent.
    const start = offset === 0 ? 0 : offset - shift;
    return HttpResponse.json({
      items: rows.slice(start, start + limit),
      total: total ?? rows.length,
    });
  });
}

describe('listApplications', () => {
  it('loads a log shorter than one page in a single request', async () => {
    const offsets: number[] = [];
    mswServer.use(endpoint(log(3), offsets));

    const page = await listApplications();

    expect(offsets).toEqual([0]);
    expect(page.items).toHaveLength(3);
    expect(page.total).toBe(3);
  });

  it('pages until the whole log is loaded', async () => {
    const offsets: number[] = [];
    const limits: string[] = [];
    mswServer.use(
      http.get(`${API_URL}/applications`, ({ request }) => {
        const query = new URL(request.url).searchParams;
        const limit = Number(query.get('limit') ?? 50);
        const offset = Number(query.get('offset') ?? 0);
        offsets.push(offset);
        limits.push(String(limit));
        return HttpResponse.json({ items: log(1200).slice(offset, offset + limit), total: 1200 });
      }),
    );

    const page = await listApplications();

    expect(offsets).toEqual([0, 500, 1000]);
    expect(limits).toEqual(['500', '500', '500']);
    expect(page.items).toHaveLength(1200);
    expect(page.total).toBe(1200);
    // Order is the server's, and the pages are read in sequence — a request that
    // went out of order would splice the log back together wrong.
    expect(page.items[0].id).toBe(1);
    expect(page.items[1199].id).toBe(1200);
  });

  it('stops on an empty page even when total claims more', async () => {
    // A count that outlives its rows: the loop must end on the empty page rather
    // than ask for offset 1000, 1500, … against a server that has nothing left.
    const offsets: number[] = [];
    mswServer.use(endpoint(log(500), offsets, 5000));

    const page = await listApplications();

    expect(offsets).toEqual([0, 500]);
    expect(page.items).toHaveLength(500);
    // The server's own count, so the footer reads "500 of 5000" — truncated, and
    // saying so — rather than inheriting the page size.
    expect(page.total).toBe(5000);
  });

  it('drops a row served twice when the window shifts', async () => {
    const offsets: number[] = [];
    mswServer.use(endpoint(log(1200), offsets, 1200, 1));

    const page = await listApplications();

    expect(offsets).toEqual([0, 500, 1000]);
    const ids = page.items.map((item) => item.id);
    expect(ids).toHaveLength(1200);
    expect(new Set(ids).size).toBe(1200);
    // The re-served row is the boundary one, and it stays where it was first seen.
    expect(ids.indexOf(500)).toBe(499);
  });

  it('throws when the server never ends', async () => {
    // A page-shaped lie: every request returns a full page and a count that never
    // arrives, so neither ending condition is ever met. (Distinct ids per page, or
    // the dedupe would swallow them and `items.length >= total` would look true.)
    const offsets: number[] = [];
    mswServer.use(
      http.get(`${API_URL}/applications`, ({ request }) => {
        const offset = Number(new URL(request.url).searchParams.get('offset') ?? 0);
        offsets.push(offset);
        return HttpResponse.json({
          items: log(500).map((item) => ({ ...item, id: item.id + offset })),
          total: Number.MAX_SAFE_INTEGER,
        });
      }),
    );

    await expect(listApplications()).rejects.toThrow(/still paging after 200 pages/);
    expect(offsets).toHaveLength(200);
    // 200 pages × 500 rows = 100k rows through the zod schema: the default 5s is too
    // tight once the whole suite shares the CPU.
  }, 20_000);
});
