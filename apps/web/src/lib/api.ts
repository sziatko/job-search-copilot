import { z } from 'zod';

export const API_ORIGIN: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
// The API serves everything under /api/v1 (see apps/api setup-app.ts).
export const API_BASE = `${API_ORIGIN}/api/v1`;

/** `fetch` with the session cookie: every API route wants it (invariant 9). The cookie
 * is the API's (`localhost:3000`), and a cross-origin request carries it only with
 * `credentials: 'include'`. */
export function apiFetch(input: string, init?: RequestInit) {
  return fetch(input, { ...init, credentials: 'include' });
}

/** A cursor page (ADR-0030). `total` is the rows matching the filter, not the page
 * size; `nextCursor` is null on the last page. */
export interface CursorPage<T> {
  items: T[];
  total: number;
  nextCursor: number | null;
}

export function cursorPageSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), total: z.number(), nextCursor: z.number().nullable() });
}

/**
 * Validate a response body against its schema. On mismatch, log the detail for
 * debugging but throw a short, human-readable message — the raw ZodError message
 * is a JSON blob that would otherwise land verbatim in the UI error banner.
 */
export function parseResponse<T>(schema: z.ZodType<T>, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`${label}: unexpected response shape`, result.error.issues);
    throw new Error(`${label}: the server returned data in an unexpected format`);
  }
  return result.data;
}

/**
 * The message to show for a failed response: the API's own where it sent one, and
 * `fallback` otherwise.
 *
 * The server says things the status code cannot — "This vacancy already has an
 * application" against a bare `HTTP 422` (`apps/api`'s DomainExceptionFilter sends
 * `{ statusCode, error, message }`, and Nest's own errors carry the same key, as a
 * string or an array for validation failures). Reading it costs one parse of a body
 * that is already in memory; not reading it turns every refusal into the same
 * opaque line.
 */
export async function errorMessage(res: Response, fallback: string): Promise<Error> {
  let message: unknown;
  try {
    message = ((await res.json()) as { message?: unknown }).message;
  } catch {
    return new Error(fallback); // no body, or not JSON
  }
  if (typeof message === 'string' && message.trim() !== '') return new Error(message);
  if (Array.isArray(message) && message.length > 0) return new Error(message.join(', '));
  return new Error(fallback);
}
