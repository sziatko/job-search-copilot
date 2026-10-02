import { API_BASE, type CursorPage, errorMessage, parseResponse } from '@/lib/api';
import {
  type ApplicationListItem,
  type ApplicationStatus,
  type ApplicationStatusFilter,
  applicationListItemSchema,
  applicationPageSchema,
  type RecordApplicationInput,
  type RecordApplicationResponse,
  recordApplicationResponseSchema,
  STATUS_FILTER_ACTIVE,
  STATUS_FILTER_ALL,
  STATUS_FILTER_TIMEOUT,
  type UpdateApplicationInput,
} from './types';

export type ApplicationPage = CursorPage<ApplicationListItem>;

/**
 * One page of the pipeline, `statusChangedAt desc, id desc`, filtered and counted by
 * the server (ADR-0030). The dropdown's filter goes out as `status` for a stored
 * status and as `state` for the derived Active / Timeout (ADR-0031); All sends neither.
 */
export async function listApplicationsPage(
  params: {
    filter?: ApplicationStatusFilter;
    /** Free text over company OR title. */
    search?: string;
    /** This name's company, whatever its spelling (ADR-0032) — the company modal. */
    sameCompanyAs?: string;
    /** The `id` of the last row loaded; the page starts after it. */
    cursor?: number;
    limit?: number;
  } = {},
): Promise<ApplicationPage> {
  const query = new URLSearchParams({ limit: String(params.limit ?? 100) });
  const { filter = STATUS_FILTER_ALL } = params;
  if (filter === STATUS_FILTER_ACTIVE) query.set('state', 'active');
  else if (filter === STATUS_FILTER_TIMEOUT) query.set('state', 'timedOut');
  else if (filter !== STATUS_FILTER_ALL) query.set('status', filter);
  if (params.search) query.set('search', params.search);
  if (params.sameCompanyAs) query.set('sameCompanyAs', params.sameCompanyAs);
  if (params.cursor !== undefined) query.set('cursor', String(params.cursor));

  const res = await fetch(`${API_BASE}/applications?${query}`);
  if (!res.ok) {
    throw new Error(`Failed to load applications: HTTP ${res.status}`);
  }
  return parseResponse(applicationPageSchema, await res.json(), 'Load applications');
}

export async function recordApplication(
  input: RecordApplicationInput,
): Promise<RecordApplicationResponse> {
  const res = await fetch(`${API_BASE}/applications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    // The server's own words where it has them: a refusal like "already has an
    // application" is the whole answer, and the row shows this line.
    throw await errorMessage(res, `Failed to record application: HTTP ${res.status}`);
  }
  return parseResponse(recordApplicationResponseSchema, await res.json(), 'Record application');
}

export async function updateApplicationStatus(
  id: number,
  status: ApplicationStatus,
): Promise<ApplicationListItem> {
  const res = await fetch(`${API_BASE}/applications/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    throw new Error(`Failed to update application ${id}: HTTP ${res.status}`);
  }
  return parseResponse(applicationListItemSchema, await res.json(), 'Update application');
}

export async function updateApplication(
  id: number,
  input: UpdateApplicationInput,
): Promise<ApplicationListItem> {
  const res = await fetch(`${API_BASE}/applications/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw await errorMessage(res, `Edit application failed: HTTP ${res.status}`);
  }
  return parseResponse(applicationListItemSchema, await res.json(), 'Edit application');
}
