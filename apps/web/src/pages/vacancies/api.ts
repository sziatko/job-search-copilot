import { API_BASE, parseResponse } from '@/lib/api';
import {
  type EstimatedVacancyListItem,
  estimatedVacancyListItemSchema,
  listResponseSchema,
  type Recommendation,
  type UserAction,
} from './types';

export interface VacancyPage {
  items: EstimatedVacancyListItem[];
  /** Rows matching the filter, NOT the size of this page — the count endpoint
   * `limit=1` is how the dashboard reads exact totals without a stats API. */
  total: number;
}

export async function listEstimatedVacanciesPage(
  params: { limit?: number; userAction?: UserAction; recommendation?: Recommendation } = {},
): Promise<VacancyPage> {
  const query = new URLSearchParams({ limit: String(params.limit ?? 100) });
  if (params.userAction) query.set('userAction', params.userAction);
  if (params.recommendation) query.set('recommendation', params.recommendation);

  const res = await fetch(`${API_BASE}/estimated-vacancies?${query}`);
  if (!res.ok) {
    throw new Error(`Failed to load vacancies: HTTP ${res.status}`);
  }
  return parseResponse(listResponseSchema, await res.json(), 'Load vacancies');
}

export async function updateUserAction(
  id: number,
  userAction: UserAction,
): Promise<EstimatedVacancyListItem> {
  const res = await fetch(`${API_BASE}/estimated-vacancies/${id}/user-action`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userAction }),
  });
  if (!res.ok) {
    throw new Error(`Failed to update vacancy ${id}: HTTP ${res.status}`);
  }
  // The PATCH endpoint returns the full record (including fullText); the schema
  // keeps only the list-item fields the UI uses and validates their shape.
  return parseResponse(estimatedVacancyListItemSchema, await res.json(), 'Update vacancy');
}
