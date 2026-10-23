import { Link } from '@tanstack/react-router';
import { Card, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { KpiRow, KpiTile, KpiTileSkeleton } from '@/components/ui/KpiTile';
import { SkeletonCard } from '@/components/ui/SkeletonCard';
import { APPLICATION_STATUS_LABELS } from '../applications/constants';
import type { ApplicationStatus } from '../applications/types';
import type { VacancyListItem } from '../vacancies/types';
import type { RecentMove } from './types';
import { useDashboard } from './useDashboard';

/** What each status change reads as in the activity feed, and its dot colour. */
const ACTIVITY: Record<ApplicationStatus, { verb: string; dot: 'good' | 'warn' | 'accent' }> = {
  APPLIED: { verb: 'Applied', dot: 'accent' },
  ACTION_NEEDED: { verb: 'Action needed', dot: 'good' },
  INTERVIEW: { verb: 'Interview scheduled', dot: 'good' },
  AWAITING: { verb: 'Awaiting their reply', dot: 'accent' },
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
 * above it. Each stage has its own colour (`--funnel-1…5` in index.css, by row).
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
          <div className="funnel-row" data-testid="funnel-row" key={step.label}>
            <div className="funnel-name">{step.label}</div>
            <div className="funnel-track">
              <div className="funnel-fill" style={{ width: `${width}%` }} />
            </div>
            <div className="funnel-value" data-testid="funnel-value">
              {step.value}
            </div>
            <div className="funnel-conv">{conversion}</div>
          </div>
        );
      })}
    </div>
  );
}

function ReviewQueue({ items }: { items: VacancyListItem[] }) {
  if (items.length === 0) {
    return <EmptyState>Everything is triaged. Nice.</EmptyState>;
  }

  return (
    <ul className="attn-list" aria-label="Needs your review">
      {items.map((item) => (
        <li className="attn-item" key={item.id}>
          <div className="attn-score">{item.matchScore === null ? '—' : `${item.matchScore}%`}</div>
          <div className="attn-body">
            <div className="attn-title">{item.title}</div>
            <div className="attn-sub">{item.company}</div>
          </div>
          <Link
            to="/vacancies/$id"
            params={{ id: String(item.id) }}
            className="attn-go"
            // Ten links read "Review" otherwise.
            aria-label={`Review ${item.title}`}
          >
            Review
          </Link>
        </li>
      ))}
    </ul>
  );
}

function RecentActivity({ items }: { items: RecentMove[] }) {
  if (items.length === 0) {
    return <EmptyState>No status changes yet.</EmptyState>;
  }

  return (
    <ul className="activity-list" aria-label="Recent activity">
      {items.map((item) => (
        <li className="activity-item" key={item.id}>
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
        </li>
      ))}
    </ul>
  );
}

/** The page while it loads: its KPI tiles and its cards, as bars. */
function DashboardSkeleton() {
  return (
    <section className="view" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <KpiRow aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders, never reordered
          <KpiTileSkeleton key={i} />
        ))}
      </KpiRow>
      <div className="dash-grid">
        <SkeletonCard lines={14} />
        <SkeletonCard lines={9} />
      </div>
      <SkeletonCard lines={5} className="mt-4" />
    </section>
  );
}

export function DashboardPage() {
  const { loading, loadError, stats, responseRate, reviewQueue } = useDashboard();

  if (loadError) {
    return (
      <section className="view">
        <Card>
          <EmptyState>Failed to load the dashboard: {loadError}</EmptyState>
        </Card>
      </section>
    );
  }

  if (loading || !stats) {
    return <DashboardSkeleton />;
  }

  // Each stage past Recommended counts the journal — "ever reached", so a rejection
  // never shrinks an earlier stage (ADR-0031).
  const steps: FunnelStep[] = [
    { label: 'Logged', value: stats.logged },
    { label: 'Recommended', value: stats.recommended },
    { label: 'Applied', value: stats.applied },
    { label: 'Got a response', value: stats.responded },
    { label: 'Interview', value: stats.interview },
  ];
  // Counted on the one table (ADR-0033), not `logged − recommended`: that also
  // counted every vacancy still waiting for its analysis.
  const dropped: { label: string; value: number }[] = [
    { label: 'Not recommended by the analyzer', value: stats.notRecommended },
    { label: 'Declined by you', value: stats.declined },
    { label: 'No longer accepting applications', value: stats.unavailable },
    { label: 'Rejected', value: stats.pipeline.byStatus.REJECTED },
    { label: 'Timed out (no move for 30+ days)', value: stats.pipeline.timedOut },
  ];

  return (
    <section className="view">
      <KpiRow>
        <KpiTile label="Logged" value={stats.logged} note="postings seen, deduped by URL" />
        <KpiTile
          label="Awaiting analysis"
          value={stats.awaitingAnalysis}
          note="in the inbox, not yet scored"
        />
        <KpiTile
          label="Awaiting triage"
          value={stats.awaitingTriage}
          tone="accent"
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
          tone="good"
          note={`${stats.actionNeeded} need your reply`}
        />
      </KpiRow>

      <div className="dash-grid">
        <Card>
          <CardHead>
            <div>
              <CardTitle>Pipeline funnel</CardTitle>
              <CardSub>From logged to interview</CardSub>
            </div>
          </CardHead>
          <Funnel steps={steps} />
          <CardHead className="border-t border-border">
            <div>
              <CardTitle>Dropped out</CardTitle>
              <CardSub>Where the rest went</CardSub>
            </div>
          </CardHead>
          <div className="fact-list">
            {dropped.map((row) => (
              <div className="fact-row" data-testid="fact-row" key={row.label}>
                <span className="fact-label">{row.label}</span>
                <span className="fact-value">{row.value}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="flex flex-col">
          <CardHead>
            <div>
              <CardTitle>Needs your review</CardTitle>
              <CardSub>Top recommended, not yet triaged</CardSub>
            </div>
          </CardHead>
          <div className="review-scroll">
            <ReviewQueue items={reviewQueue} />
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHead>
          <div>
            <CardTitle>Recent activity</CardTitle>
            <CardSub>Latest status changes across applications</CardSub>
          </div>
        </CardHead>
        <RecentActivity items={stats.recent} />
      </Card>
    </section>
  );
}
