import { API_BASE, apiFetch, errorMessage, parseResponse } from '@/lib/api';
import { type TagRef, type TagTone, type TagWrite, tagListSchema, tagRefSchema } from './types';

export async function listTags() {
  const res = await apiFetch(`${API_BASE}/tags`);
  if (!res.ok) {
    throw new Error(`Failed to load tags: HTTP ${res.status}`);
  }
  return parseResponse(tagListSchema, await res.json(), 'Load tags');
}

/** A name taken in any spelling is a 409, whose message the dialog shows. */
export async function createTag(input: { name: string; tone: TagTone }): Promise<TagRef> {
  const res = await apiFetch(`${API_BASE}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw await errorMessage(res, `Failed to create the tag: HTTP ${res.status}`);
  }
  return parseResponse(tagRefSchema, await res.json(), 'Create tag');
}

/** As `createTag`: a name taken in any spelling is a 409, whose message the dialog shows. */
export async function updateTag({ id, name, tone }: TagRef): Promise<TagRef> {
  const res = await apiFetch(`${API_BASE}/tags/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, tone }),
  });
  if (!res.ok) {
    throw await errorMessage(res, `Failed to update the tag: HTTP ${res.status}`);
  }
  return parseResponse(tagRefSchema, await res.json(), 'Update tag');
}

export async function deleteTag(id: number): Promise<void> {
  const res = await apiFetch(`${API_BASE}/tags/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    throw await errorMessage(res, `Failed to delete the tag: HTTP ${res.status}`);
  }
}

/** Puts a tag on a vacancy or takes it off. Over the limit of tags is a 422, whose message
 * the row shows. */
export async function writeVacancyTags({ id, add, remove }: TagWrite): Promise<void> {
  const res = await apiFetch(`${API_BASE}/vacancies/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ vacancyId: id, add: add && [add.name], remove: remove && [remove.name] }],
    }),
  });
  if (!res.ok) {
    throw await errorMessage(res, `Failed to update the tags of vacancy ${id}: HTTP ${res.status}`);
  }
}
