import { Card, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Fact, FactList } from '@/components/ui/FactList';
import { KpiRow, KpiTile } from '@/components/ui/KpiTile';
import { SplitGrid } from '@/components/ui/SplitGrid';
import { View } from '@/components/ui/View';
import { DashboardSkeleton } from './DashboardSkeleton';
import { Funnel, type FunnelStep } from './Funnel';
import { RecentActivity } from './RecentActivity';
import { ReviewQueue } from './ReviewQueue';
import { useDashboard } from './useDashboard';

export function DashboardPage() {
  const { loading, loadError, stats, responseRate, reviewQueue } = useDashboard();

  if (loadError) {
    return (
      <View>
        <Card>
          <EmptyState>Failed to load the dashboard: {loadError}</EmptyState>
        </Card>
      </View>
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
    <View>
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

      <SplitGrid>
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
          <FactList>
            {dropped.map((row) => (
              <Fact key={row.label} label={row.label}>
                {row.value}
              </Fact>
            ))}
          </FactList>
        </Card>

        <Card className="flex flex-col">
          <CardHead>
            <div>
              <CardTitle>Needs your review</CardTitle>
              <CardSub>Top recommended, not yet triaged</CardSub>
            </div>
          </CardHead>
          {/* The grid stretches both cards to one row height. `contain-size` keeps the
              list out of that height, so the funnel card alone sets it, and the list
              fills what is left under its heading and scrolls. Stacked, the card is a
              row of its own and sizes to its list again. */}
          <div className="min-h-0 flex-1 overflow-y-auto contain-size stacked:contain-none">
            <ReviewQueue items={reviewQueue} />
          </div>
        </Card>
      </SplitGrid>

      <Card className="mt-4">
        <CardHead>
          <div>
            <CardTitle>Recent activity</CardTitle>
            <CardSub>Latest status changes across applications</CardSub>
          </div>
        </CardHead>
        <RecentActivity items={stats.recent} />
      </Card>
    </View>
  );
}
