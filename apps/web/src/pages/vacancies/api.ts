import { API_BASE, parseResponse } from '@/lib/api';
import {
  listResponseSchema,
  type Recommendation,
  type VacancyListItem,
  type VacancyStatus,
  vacancyListItemSchema,
} from './types';

export interface VacancyPage {
  items: VacancyListItem[];
  /** Rows matching the filter, NOT the size of this page — the count endpoint
   * `limit=1` is how the dashboard reads exact totals without a stats API. */
  total: number;
}

export async function listVacanciesPage(
  params: {
    limit?: number;
    /** Any of these. */
    status?: VacancyStatus[];
    recommendation?: Recommendation;
    /** Free text over company OR title, filtered server-side (ADR-0025). */
    search?: string;
    /** ILIKE '%company%' — the company-history modal's filter. */
    company?: string;
  } = {},
): Promise<VacancyPage> {
  const query = new URLSearchParams({ limit: String(params.limit ?? 100) });
  if (params.status?.length) query.set('status', params.status.join(','));
  if (params.recommendation) query.set('recommendation', params.recommendation);
  if (params.search) query.set('search', params.search);
  if (params.company) query.set('company', params.company);

  const res = await fetch(`${API_BASE}/vacancies?${query}`);
  if (!res.ok) {
    throw new Error(`Failed to load vacancies: HTTP ${res.status}`);
  }
  return parseResponse(listResponseSchema, await res.json(), 'Load vacancies');
}

export async function updateVacancyStatus(
  id: number,
  status: VacancyStatus,
): Promise<VacancyListItem> {
  const res = await fetch(`${API_BASE}/vacancies/${id}/status`, {
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
