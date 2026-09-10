import type { z } from 'zod';
import {
  type EstimatedVacancyListItem,
  estimatedVacancyListItemSchema,
  listResponseSchema,
  type UserAction,
} from './types';

// The API serves everything under /api/v1 (see apps/api setup-app.ts).
export const API_BASE = `${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/api/v1`;

/**
 * Validate a response body against its schema. On mismatch, log the detail for
 * debugging but throw a short, human-readable message — the raw ZodError message
 * is a JSON blob that would otherwise land verbatim in the UI error banner.
 */
function parseResponse<T>(schema: z.ZodType<T>, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`${label}: unexpected response shape`, result.error.issues);
    throw new Error(`${label}: the server returned data in an unexpected format`);
  }
  return result.data;
}

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
