/**
 * Every React Query key in the app, in one place. Called with no argument, a key is
 * its prefix: `invalidateQueries` and `setQueriesData` match by prefix, so
 * `queryKeys.vacancies()` reaches every filter's list at once.
 *
 * Only the tables' paged lists sit under `vacancies` and `applications`: the row
 * writes patch every entry under those prefixes as pages (`useRowMutation`), so a
 * company's or a search's rows have keys of their own.
 */
export const queryKeys = {
  /** The vacancy tables' paged lists (/vacancies, /inbox); the filters follow. */
  vacancies: (...filters: readonly unknown[]) => ['vacancies', ...filters] as const,
  /** /applications' paged lists; the status filter follows. */
  applications: (...filters: readonly unknown[]) => ['applications', ...filters] as const,
  /** One vacancy's own page. */
  vacancy: (...id: [id?: number]) => ['vacancy', ...id] as const,
  /** A company's vacancies — the company modal's and the vacancy page's. */
  vacancyCompany: (...company: [company?: string]) => ['vacancy-company', ...company] as const,
  /** A company's applications, for the company modal's marks. */
  applicationCompany: (...company: [company?: string]) =>
    ['application-company', ...company] as const,
  vacancySearch: (term: string, statuses: readonly string[]) =>
    ['vacancy-search', term, statuses] as const,
  applicationSearch: (term: string) => ['application-search', term] as const,
  /** `GET /stats` — the dashboard's numbers and /applications' KPI strip. */
  stats: () => ['stats'] as const,
  dashboard: (...rest: ['review-queue'] | []) => ['dashboard', ...rest] as const,
  passkeys: () => ['passkeys'] as const,
  apiKeys: () => ['api-keys'] as const,
  connectedApps: () => ['connected-apps'] as const,
  oauthClient: (clientId: string) => ['oauth-client', clientId] as const,
};

/**
 * What each kind of write makes stale, named once for every hook that makes it. An
 * inactive entry is only marked stale, so a broad set costs a refetch of what is on
 * screen and nothing more. The search modal's keys are not here: it refetches on
 * every open.
 */
export const staleAfter = {
  /** A status write — a triage move, an apply, a pipeline move — touches every view
   * that shows the row's status, and the counts. */
  statusWrite: [
    queryKeys.vacancies(),
    queryKeys.applications(),
    queryKeys.vacancy(),
    queryKeys.vacancyCompany(),
    queryKeys.applicationCompany(),
    queryKeys.stats(),
    queryKeys.dashboard(),
  ],
  /** An application's edit or a comment touches where the application's fields and
   * comments show. */
  edit: [queryKeys.applications(), queryKeys.vacancy(), queryKeys.applicationCompany()],
};
