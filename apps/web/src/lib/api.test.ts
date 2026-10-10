import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { mswServer } from '@/test/msw/server';
import { API_BASE, apiFetch } from './api';

afterEach(() => window.history.pushState({}, '', '/'));

describe('apiFetch', () => {
  it('sends the web to /login on a 401, and still returns the response', async () => {
    mswServer.use(http.get(`${API_BASE}/stats`, () => new HttpResponse(null, { status: 401 })));
    window.history.pushState({}, '', '/applications');

    const res = await apiFetch(`${API_BASE}/stats`);

    expect(res.status).toBe(401);
    await expect.poll(() => window.location.pathname).toBe('/login');
  });

  it('does not redirect from /login itself (no loop)', async () => {
    mswServer.use(http.get(`${API_BASE}/stats`, () => new HttpResponse(null, { status: 401 })));
    window.history.pushState({}, '', '/login');

    await apiFetch(`${API_BASE}/stats`);

    expect(window.location.pathname).toBe('/login');
    expect(window.location.search).toBe('');
  });

  it('leaves other statuses alone', async () => {
    mswServer.use(http.get(`${API_BASE}/stats`, () => new HttpResponse(null, { status: 500 })));
    window.history.pushState({}, '', '/applications');

    await apiFetch(`${API_BASE}/stats`);

    expect(window.location.pathname).toBe('/applications');
  });
});
