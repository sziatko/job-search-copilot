import { Link } from '@tanstack/react-router';
import { KpiTile } from '@/components/ui/KpiTile';
import { APPLICATION_STATUS_LABELS } from '../applications/constants';
import type { ApplicationStatus } from '../applications/types';
import type { VacancyListItem } from '../vacancies/types';
import type { RecentMove } from './types';
import { useDashboard } from './useDashboard';

/** What each status change reads as in the activity feed, and its dot colour. */
const ACTIVITY: Record<ApplicationStatus, { verb: string; dot: 'good' | 'warn' | 'accent' }> = {
  APPLIED: { verb: 'Applied', dot: 'accent' },
  RECRUITER_SCREEN: { verb: 'Recruiter screen booked', dot: 'good' },
  REPLIED: { verb: 'Got a reply', dot: 'accent' },
  INTERVIEW: { verb: 'Interview scheduled', dot: 'good' },
  OFFER: { verb: 'Offer received', dot: 'good' },
  REJECTED: { verb: 'Rejected', dot: 'warn' },
};

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Exported for its boundaries: a future timestamp (server/browser clock skew) has
 * to clamp to "this minute" rather than render a negative number, and an
 * unparseable one has to fail open like `daysSinceLastMove` — `relative.format` on
 * NaN throws `RangeError`, and there is no error boundary in the router, so one bad
 * stamp would take the whole dashboard render with it. */
export function timeAgo(iso: string): string {
  const elapsed = Date.now() - new Date(iso).getTime();
  // Not `elapsed < HOUR`: NaN fails every comparison below and would reach format().
  if (!Number.isFinite(elapsed)) return 'unknown';
  if (elapsed < HOUR) return relative.format(-Math.max(Math.round(elapsed / MINUTE), 0), 'minute');
  if (elapsed < DAY) return relative.format(-Math.round(elapsed / HOUR), 'hour');
  return relative.format(-Math.round(elapsed / DAY), 'day');
}

interface FunnelStep {
  label: string;
  value: number;
}

/**
 * Five stages, each bar scaled against the first and each label against the one
 * above it. The mockup fades each bar a little further; that is decoration, kept
 * because it is what makes the narrowing visible at a glance.
 */
function Funnel({ steps }: { steps: FunnelStep[] }) {
  const baseline = steps[0]?.value ?? 0;

  return (
    <div className="funnel">
      {steps.map((step, i) => {
        const previous = steps[i - 1];
        const width = baseline > 0 ? (step.value / baseline) * 100 : 0;
        const conversion = !previous
          ? 'baseline'
          : previous.value > 0
            ? `${Math.round((step.value / previous.value) * 100)}% of ${previous.label.toLowerCase()}`
            : '—';

        return (
          <div className="funnel-row" key={step.label}>
            <div className="funnel-name">{step.label}</div>
            <div className="funnel-track">
              <div className="funnel-fill" style={{ width: `${width}%`, opacity: 1 - i * 0.12 }} />
            </div>
            <div className="funnel-value">{step.value}</div>
            <div className="funnel-conv">{conversion}</div>
          </div>
        );
      })}
    </div>
  );
}

function ReviewQueue({ items }: { items: VacancyListItem[] }) {
  if (items.length === 0) {
    return <div className="empty-state">Everything is triaged. Nice.</div>;
  }

  return (
    <div className="attn-list">
      {items.map((item) => (
        <div className="attn-item" key={item.id}>
          <div className="attn-score">{item.matchScore}%</div>
          <div className="attn-body">
            <div className="attn-title">{item.title}</div>
            <div className="attn-sub">{item.company}</div>
          </div>
          <Link to="/vacancies/$id" params={{ id: String(item.id) }} className="attn-go">
            Review
          </Link>
        </div>
      ))}
    </div>
  );
}

function RecentActivity({ items }: { items: RecentMove[] }) {
  if (items.length === 0) {
    return <div className="empty-state">No status changes yet.</div>;
  }

  return (
    <div className="activity-list">
      {items.map((item) => (
        <div className="activity-item" key={item.id}>
          <div className={`activity-dot ${ACTIVITY[item.status].dot}`} />
          <div className="activity-body">
            <div className="activity-title">
              {ACTIVITY[item.status].verb} — {item.company}
            </div>
            <div className="activity-sub">
              <Link
                to="/vacancies/$id"
                params={{ id: String(item.vacancyId) }}
                className="role-link"
              >
                {item.title}
              </Link>{' '}
              · {APPLICATION_STATUS_LABELS[item.status]}
            </div>
          </div>
          <div className="activity-time">{timeAgo(item.createdAt)}</div>
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const { loading, loadError, stats, responseRate, reviewQueue } = useDashboard();

  if (loadError) {
    return (
      <section className="view">
        <div className="card">
          <div className="empty-state">Failed to load the dashboard: {loadError}</div>
        </div>
      </section>
    );
  }

  if (loading || !stats) {
    return (
      <section className="view">
        <div className="card">
          <div className="empty-state">Loading…</div>
        </div>
      </section>
    );
  }

  // Each stage past Analysed counts the journal — "ever reached", so a rejection
  // never shrinks an earlier stage (ADR-0031).
  const steps: FunnelStep[] = [
    { label: 'Logged', value: stats.logged },
    { label: 'Analysed', value: stats.analysed },
    { label: 'Applied', value: stats.applied },
    { label: 'Got a response', value: stats.responded },
    { label: 'Interview', value: stats.interview },
  ];

  return (
    <section className="view">
      <div className="kpi-row">
        <KpiTile label="Logged" value={stats.logged} note="postings seen, deduped by URL" />
        <KpiTile
          label="Awaiting triage"
          value={stats.awaitingTriage}
          variant="accent"
          note="scored, not yet decided"
        />
        <KpiTile label="Recommended" value={stats.recommended} note="analyzer says apply" />
        <KpiTile
          label="Applications sent"
          value={stats.applied}
          note={`${responseRate}% response rate`}
        />
        <KpiTile
          label="Interviews"
          value={stats.interview}
          variant="good"
          note={`${stats.recruiterScreen} in recruiter screen`}
        />
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Pipeline funnel</h2>
              <div className="count">From logged to interview</div>
            </div>
          </div>
          <Funnel steps={steps} />
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>Needs your review</h2>
              <div className="count">Top recommended, not yet triaged</div>
            </div>
          </div>
          <ReviewQueue items={reviewQueue} />
        </div>
      </div>

      <div className="card mt-[16px]">
        <div className="card-head">
          <div>
            <h2>Recent activity</h2>
            <div className="count">Latest status changes across applications</div>
          </div>
        </div>
        <RecentActivity items={stats.recent} />
      </div>
    </section>
  );
}
