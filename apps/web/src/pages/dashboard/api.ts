import { API_BASE, apiFetch, parseResponse } from '@/lib/api';
import { type Stats, statsSchema } from './types';

/** Every number on the dashboard, counted by the server (ADR-0031). */
export async function fetchStats(): Promise<Stats> {
  const res = await apiFetch(`${API_BASE}/stats`);
  if (!res.ok) {
    throw new Error(`Failed to load stats: HTTP ${res.status}`);
  }
  return parseResponse(statsSchema, await res.json(), 'Load stats');
}
