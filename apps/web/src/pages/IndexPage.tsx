import { Link } from '@tanstack/react-router';

const CARD =
  'block rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-indigo-300 hover:shadow-md';

export function IndexPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold text-slate-900">Job Search Copilot</h1>
        <p className="mt-1 text-sm text-slate-500">Pick a view.</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link to="/vacancies" className={CARD}>
            <div className="text-base font-medium text-slate-900">Analyzed vacancies</div>
            <p className="mt-1 text-sm text-slate-500">
              Review the analyzer's shortlist and triage what to apply to.
            </p>
          </Link>

          <Link to="/tracker" className={CARD}>
            <div className="text-base font-medium text-slate-900">Application tracker</div>
            <p className="mt-1 text-sm text-slate-500">
              Every application you've sent and where it stands.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
