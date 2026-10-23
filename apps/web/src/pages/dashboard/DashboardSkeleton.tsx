import { KpiRow, KpiTileSkeleton } from '@/components/ui/KpiTile';
import { SkeletonCard } from '@/components/ui/SkeletonCard';
import { SplitGrid } from '@/components/ui/SplitGrid';
import { View } from '@/components/ui/View';

/** The page while it loads: its KPI tiles and its cards, as bars. */
export function DashboardSkeleton() {
  return (
    <View aria-busy="true">
      <span className="sr-only">Loading…</span>
      <KpiRow aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders, never reordered
          <KpiTileSkeleton key={i} />
        ))}
      </KpiRow>
      <SplitGrid>
        <SkeletonCard lines={14} />
        <SkeletonCard lines={9} />
      </SplitGrid>
      <SkeletonCard lines={5} className="mt-4" />
    </View>
  );
}
