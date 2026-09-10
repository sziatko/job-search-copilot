import { HttpResponse, http } from 'msw';
import type { EstimatedVacancyListItem, UserAction } from '@/features/vacancies/types';

const API_URL = 'http://localhost:3000/api/v1';

/** Builds handlers backed by a mutable in-memory `items` array, mirroring what
 * the real API does closely enough for the dashboard's own logic to be tested
 * against — a fake server, not a fake fetch. */
export function buildHandlers(items: EstimatedVacancyListItem[]) {
  return [
    http.get(`${API_URL}/estimated-vacancies`, () => {
      return HttpResponse.json({ items, total: items.length });
    }),
    http.patch(`${API_URL}/estimated-vacancies/:id/user-action`, async ({ params, request }) => {
      const id = Number(params.id);
      const item = items.find((i) => i.id === id);
      if (!item) {
        return new HttpResponse(null, { status: 404 });
      }
      const body = (await request.json()) as { userAction: UserAction };
      item.userAction = body.userAction;
      item.userActionUpdatedAt = new Date().toISOString();
      return HttpResponse.json(item);
    }),
  ];
}
