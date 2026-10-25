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
          <Skeleton className="h-3.25 w-[30%]" />
          <Skeleton className="mt-2.5 h-5.5 w-[80%]" />
          <Skeleton className="mt-3.5 h-3 w-[40%]" />
        </div>
        <Skeleton className="h-8 w-50" />
      </div>
      <SkeletonCard lines={1} className="mb-4" />
      <SplitGrid>
        <SkeletonCard lines={6} />
        <Card aria-hidden>
          <CardHead>
            <Skeleton className="h-3.75 w-[35%]" />
          </CardHead>
          <FactList>
            {Array.from({ length: FACT_COUNT }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders, never reordered
              <FactRow key={i}>
                <Skeleton className="h-3 w-[35%]" />
                <Skeleton className="h-3 w-[25%]" />
              </FactRow>
            ))}
          </FactList>
        </Card>
      </SplitGrid>
    </div>
  );
}
