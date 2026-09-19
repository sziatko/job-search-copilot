import { Link } from '@tanstack/react-router';
import { KpiTile } from '@/components/ui/KpiTile';
import { APPLICATION_STATUS_LABELS } from '../applications/constants';
import type { ApplicationListItem, ApplicationStatus } from '../applications/types';
import type { EstimatedVacancyListItem } from '../vacancies/types';
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

function timeAgo(iso: string): string {
  const elapsed = Date.now() - new Date(iso).getTime();
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

function ReviewQueue({ items }: { items: EstimatedVacancyListItem[] }) {
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
          <Link to="/vacancies" className="attn-go">
            Review
          </Link>
        </div>
      ))}
    </div>
  );
}

function RecentActivity({ items }: { items: ApplicationListItem[] }) {
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
              {item.title} · {APPLICATION_STATUS_LABELS[item.status]}
            </div>
          </div>
          <div className="activity-time">{timeAgo(item.statusUpdatedAt)}</div>
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const { loading, loadError, counts, metrics, reviewQueue, recentActivity } = useDashboard();

  if (loadError) {
    return (
      <section className="view">
        <div className="card">
          <div className="empty-state">Failed to load the dashboard: {loadError}</div>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="view">
        <div className="card">
          <div className="empty-state">Loading…</div>
        </div>
      </section>
    );
  }

  // "Logged" and "Duplicates caught" in the mockup have no backing table — every
  // number below is counted from EstimatedVacancy and Application.
  const steps: FunnelStep[] = [
    { label: 'Analyzed', value: counts?.analyzed ?? 0 },
    { label: 'Recommended', value: counts?.recommended ?? 0 },
    { label: 'Applied', value: metrics.sent },
    { label: 'Got a response', value: metrics.responded },
    { label: 'Interview', value: metrics.interview },
  ];

  return (
    <section className="view">
      <div className="kpi-row">
        <KpiTile
          label="Analyzed"
          value={counts?.analyzed ?? 0}
          note="postings scored, deduped by URL"
        />
        <KpiTile
          label="Awaiting triage"
          value={counts?.awaitingTriage ?? 0}
          variant="accent"
          note="scored, not yet decided"
        />
        <KpiTile label="Recommended" value={counts?.recommended ?? 0} note="analyzer says apply" />
        <KpiTile
          label="Applications sent"
          value={metrics.sent}
          note={`${metrics.responseRate}% response rate`}
        />
        <KpiTile
          label="Interviews"
          value={metrics.interview}
          variant="good"
          note={`${metrics.recruiterScreen} in recruiter screen`}
        />
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Pipeline funnel</h2>
              <div className="count">From first analysis to interview</div>
            </div>
          </div>
          <Funnel steps={steps} />
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h2>Needs your review</h2>
              <div className="count">Highest-scored, not yet triaged</div>
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
        <RecentActivity items={recentActivity} />
      </div>
    </section>
  );
}
