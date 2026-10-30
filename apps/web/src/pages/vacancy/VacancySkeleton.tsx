import { Card, CardHead } from '@/components/ui/Card';
import { FactList, FactRow } from '@/components/ui/FactList';
import { Skeleton } from '@/components/ui/Skeleton';
import { SkeletonCard } from '@/components/ui/SkeletonCard';
import { SplitGrid } from '@/components/ui/SplitGrid';
import { BackLink } from './BackLink';
import { FACT_COUNT } from './Facts';
import { HEADER_ROW } from './Header';

/** The page while the vacancy loads: the real Back link, then its header and cards as
 * bars — the status history, the description, the details. */
export function VacancySkeleton() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading…</span>
      <BackLink />
      <div aria-hidden className={HEADER_ROW}>
        <div className="w-full max-w-130">
          <Skeleton className="h-3 w-3/10" />
          <Skeleton className="mt-2 h-5.5 w-4/5" />
          <Skeleton className="mt-4 h-3 w-2/5" />
        </div>
        <Skeleton className="h-8 w-50" />
      </div>
      <SkeletonCard lines={1} className="mb-4" />
      <SplitGrid>
        <SkeletonCard lines={6} />
        <Card aria-hidden>
          <CardHead>
            <Skeleton className="h-4 w-7/20" />
          </CardHead>
          <FactList>
            {Array.from({ length: FACT_COUNT }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders, never reordered
              <FactRow key={i}>
                <Skeleton className="h-3 w-7/20" />
                <Skeleton className="h-3 w-1/4" />
              </FactRow>
            ))}
          </FactList>
        </Card>
      </SplitGrid>
    </div>
  );
}
