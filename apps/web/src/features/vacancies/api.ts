import { API_BASE, parseResponse } from '@/lib/api';
import {
  type EstimatedVacancyListItem,
  estimatedVacancyListItemSchema,
  listResponseSchema,
  type UserAction,
} from './types';

export async function listEstimatedVacancies(): Promise<EstimatedVacancyListItem[]> {
  const res = await fetch(`${API_BASE}/estimated-vacancies?limit=100`);
  if (!res.ok) {
    throw new Error(`Failed to load vacancies: HTTP ${res.status}`);
  }
  return parseResponse(listResponseSchema, await res.json(), 'Load vacancies').items;
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
