import { API_BASE, errorMessage, parseResponse } from '@/lib/api';
import {
  type ApplicationListItem,
  type ApplicationStatus,
  applicationListItemSchema,
  listApplicationsResponseSchema,
  type RecordApplicationInput,
  type RecordApplicationResponse,
  recordApplicationResponseSchema,
  type UpdateApplicationInput,
} from './types';

export interface ApplicationPage {
  items: ApplicationListItem[];
  /** Rows in the log, independent of the page size — so the "N of M" footer stays
   * truthful. Never below `items.length`: a row deleted mid-load shrinks `total`
   * under a list that already holds more. */
  total: number;
}

/** The endpoint's own ceiling (`@Max(500)` on the DTO) — the smallest number of
 * round-trips that is also the largest page the API will serve. */
const PAGE_SIZE = 500;

/** 200 pages is 100k applications: past that the loop is not converging, and a
 * silent stop would be the same lie (a truncated log reported as the whole log)
 * that the loop exists to remove. */
const MAX_PAGES = 200;

/**
 * Loads the entire log, page by page.
 *
 * The tracker filters, sorts and counts client-side, so a truncated log is not
 * "less data" — it is wrong answers: the footer's count and the status filter
 * both ignore whatever the cap cut. And what the cap cuts is the *oldest* rows,
 * because the server orders `appliedAt desc` — exactly the history the
 * company-history modal answers for.
 *
 * ponytail: N serial round-trips instead of one. The server-side filter/sort/count
 * that would replace this is the deferred item in `docs/phases/phase-2.2.md`; at
 * ~300 rows this is one request.
 */
export async function listApplications(): Promise<ApplicationPage> {
  const items: ApplicationListItem[] = [];
  const seen = new Set<number>();
  let total = 0;
  let exhausted = false;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * PAGE_SIZE;
    const res = await fetch(`${API_BASE}/applications?limit=${PAGE_SIZE}&offset=${offset}`);
    if (!res.ok) {
      throw new Error(`Failed to load applications: HTTP ${res.status}`);
    }
    const body = parseResponse(
      listApplicationsResponseSchema,
      await res.json(),
      'Load applications',
    );

    // Re-read on every page: `total` is the count for the filter, and it is the
    // last page's answer that covers the rows this loop has just walked past.
    total = body.total;
    for (const item of body.items) {
      // A row can be served twice when the window shifts between requests (rows
      // inserted or deleted mid-load) — the log holds rows once.
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }

    // A short page is the end of the log, and so is reaching the count — the
    // second check is what stops an empty page from looping on a `total` that
    // still claims more.
    if (body.items.length < PAGE_SIZE || items.length >= total) {
      exhausted = true;
      break;
    }
  }

  if (!exhausted) {
    throw new Error(`Failed to load the whole log: still paging after ${MAX_PAGES} pages`);
  }
  return { items, total: Math.max(total, items.length) };
}

export async function recordApplication(
  input: RecordApplicationInput,
): Promise<RecordApplicationResponse> {
  const res = await fetch(`${API_BASE}/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    // The server's own words where it has them: a refusal like "already has an
    // application" is the whole answer, and the row shows this line.
    throw await errorMessage(res, `Failed to record application: HTTP ${res.status}`);
  }
  return parseResponse(recordApplicationResponseSchema, await res.json(), 'Record application');
}

export async function updateApplicationStatus(
  id: number,
  status: ApplicationStatus,
): Promise<ApplicationListItem> {
  const res = await fetch(`${API_BASE}/applications/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    throw new Error(`Failed to update application ${id}: HTTP ${res.status}`);
  }
  return parseResponse(applicationListItemSchema, await res.json(), 'Update application');
}

/** PATCH or POST against one application, parsed back into the row that replaces it. */
async function sendForRow(
  path: string,
  method: 'PATCH' | 'POST',
  body: unknown,
  label: string,
): Promise<ApplicationListItem> {
  const res = await fetch(`${API_BASE}/applications/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw await errorMessage(res, `${label} failed: HTTP ${res.status}`);
  }
  return parseResponse(applicationListItemSchema, await res.json(), label);
}

export function updateApplication(
  id: number,
  input: UpdateApplicationInput,
): Promise<ApplicationListItem> {
  return sendForRow(`${id}`, 'PATCH', input, 'Edit application');
}

export function addApplicationComment(id: number, body: string): Promise<ApplicationListItem> {
  return sendForRow(`${id}/comments`, 'POST', { body }, 'Add comment');
}
