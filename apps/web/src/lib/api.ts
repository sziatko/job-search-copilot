import type { z } from 'zod';

// The API serves everything under /api/v1 (see apps/api setup-app.ts).
export const API_BASE = `${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/api/v1`;

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
