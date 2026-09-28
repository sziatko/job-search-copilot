import { API_BASE, type CursorPage, parseResponse } from '@/lib/api';
import { type LogEntry, logPageSchema } from './types';

/** The endpoint's own ceiling (`@Max(100)`). */
const PAGE_SIZE = 100;

export async function listLogPage(
  q: string,
  cursor: number | undefined,
): Promise<CursorPage<LogEntry>> {
  const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (q) query.set('q', q);
  if (cursor !== undefined) query.set('cursor', String(cursor));

  const res = await fetch(`${API_BASE}/log?${query}`);
  if (!res.ok) {
    throw new Error(`Failed to load the log: HTTP ${res.status}`);
  }
  return parseResponse(logPageSchema, await res.json(), 'Load the log');
}
