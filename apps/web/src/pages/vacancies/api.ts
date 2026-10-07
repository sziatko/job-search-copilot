import { API_BASE, apiFetch, type CursorPage, errorMessage, parseResponse } from '@/lib/api';
import {
  type Recommendation,
  type VacancyDetail,
  type VacancyListItem,
  type VacancyStatus,
  vacancyDetailSchema,
  vacancyListItemSchema,
  vacancyPageSchema,
} from './types';

/** `total` is the rows matching the filter, NOT the size of this page. */
export type VacancyPage = CursorPage<VacancyListItem>;

export async function listVacanciesPage(
  params: {
    limit?: number;
    /** Any of these. */
    status?: readonly VacancyStatus[];
    recommendation?: Recommendation;
    /** Free text over company OR title, filtered server-side (ADR-0025). */
    search?: string;
    /** With (`true`) or without (`false`) posting text; both when absent. */
    hasText?: boolean;
    /** Every vacancy of this name's company, whatever its spelling (ADR-0032) — the
     * company modal and the vacancy page's other vacancies. */
    sameCompanyAs?: string;
    /** The server's order (ADR-0030); it defaults to `newest`. */
    sort?: 'newest' | 'recommended';
    /** The `id` of the last row loaded; the page starts after it. */
    cursor?: number;
  } = {},
): Promise<VacancyPage> {
  const query = new URLSearchParams({ limit: String(params.limit ?? 100) });
  if (params.status?.length) query.set('status', params.status.join(','));
  if (params.recommendation) query.set('recommendation', params.recommendation);
  if (params.search) query.set('search', params.search);
  if (params.sameCompanyAs) query.set('sameCompanyAs', params.sameCompanyAs);
  if (params.hasText !== undefined) query.set('hasText', String(params.hasText));
  if (params.sort) query.set('sort', params.sort);
  if (params.cursor !== undefined) query.set('cursor', String(params.cursor));

  const res = await apiFetch(`${API_BASE}/vacancies?${query}`);
  if (!res.ok) {
    throw new Error(`Failed to load vacancies: HTTP ${res.status}`);
  }
  return parseResponse(vacancyPageSchema, await res.json(), 'Load vacancies');
}

export async function updateVacancyStatus(
  id: number,
  status: VacancyStatus,
): Promise<VacancyListItem> {
  const res = await apiFetch(`${API_BASE}/vacancies/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    throw new Error(`Failed to update vacancy ${id}: HTTP ${res.status}`);
  }
  // The PATCH endpoint returns the full record (including fullText); the schema
  // keeps only the list-item fields the UI uses and validates their shape.
  return parseResponse(vacancyListItemSchema, await res.json(), 'Update vacancy');
}

/** One vacancy, whole; null for an id the server does not know. */
export async function getVacancy(id: number): Promise<VacancyDetail | null> {
  const res = await apiFetch(`${API_BASE}/vacancies/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to load vacancy ${id}: HTTP ${res.status}`);
  }
  return parseResponse(vacancyDetailSchema, await res.json(), 'Load vacancy');
}

/**
 * Adds a USER comment through `PATCH /applications/:id` — core's `update` takes any
 * vacancy, applied or not. The body is not parsed: it is the application shape, whose
 * schema refuses a triage status, and the caller refetches the vacancy anyway.
 */
export async function addComment(id: number, comment: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/applications/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment }),
  });
  if (!res.ok) {
    throw await errorMessage(res, `Failed to add the comment: HTTP ${res.status}`);
  }
}
