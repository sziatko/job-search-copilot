import { DomainError } from '@job-search-copilot/core';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** Every tool returns its payload as one pretty-printed JSON text block. */
export function json(body: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
}

/** A tool-level failure — reported to the caller, never thrown as a protocol error. */
export function toolError(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

/**
 * Wraps a handler so a DomainError (a caller mistake — bad input, an unknown
 * recommendation, a duplicate) is reported as a tool error instead of a thrown
 * protocol error. Anything else still throws — an unexpected fault must not be
 * mistaken for bad input — but as a bare "Internal error": the SDK hands a thrown
 * message to the caller, and a Prisma one names tables and query shapes. The real
 * error goes to stderr (stdout is the stdio transport's).
 */
export function withDomainErrors<Args extends unknown[]>(
  handler: (...args: Args) => Promise<CallToolResult>,
): (...args: Args) => Promise<CallToolResult> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof DomainError) {
        return toolError(err.message);
      }
      console.error(err);
      throw new Error('Internal error');
    }
  };
}

/** The trimmed { id, company, title } echo every write tool returns. */
export function ref(row: { id: number; company: string; title: string }) {
  return { id: row.id, company: row.company, title: row.title };
}
