import { API_BASE, parseResponse } from '@/lib/api';
import {
  type ApplicationListItem,
  type ApplicationStatus,
  applicationListItemSchema,
  listApplicationsResponseSchema,
  type RecordApplicationInput,
  type RecordApplicationResponse,
  recordApplicationResponseSchema,
} from './types';

export async function listApplications(): Promise<ApplicationListItem[]> {
  // The tracker loads the whole log and filters/sorts client-side (Phase 1 pattern).
  const res = await fetch(`${API_BASE}/applications?limit=500`);
  if (!res.ok) {
    throw new Error(`Failed to load applications: HTTP ${res.status}`);
  }
  return parseResponse(listApplicationsResponseSchema, await res.json(), 'Load applications').items;
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
    throw new Error(`Failed to record application: HTTP ${res.status}`);
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
