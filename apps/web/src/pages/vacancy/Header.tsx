import { IconExternal } from '@/components/icons';
import { buttonClass } from '@/components/ui/Button';
import { ScorePill } from '@/components/ui/ScorePill';
import { Tag } from '@/components/ui/Tag';
import { Tip } from '@/components/ui/Tip';
import { CopyVacancyButton } from '@/components/vacancies/CopyVacancyButton';
import { RecommendationTag } from '@/components/vacancies/RecommendationTag';
import { isSafeExternalUrl } from '@/lib/url';
import type { VacancyDetail } from '@/lib/vacancies/types';
import { StatusControl } from './StatusControl';
import type { useVacancyPage } from './useVacancyPage';

/** The header row, here and in the skeleton: who and what on the left, the controls
 * on the right — under it, full width, on a phone. */
export const HEADER_ROW = 'mb-5 flex flex-wrap items-start justify-between gap-4';

/** The company, the title, the id, score and verdict; the status control and the
 * posting's links. */
export function Header({
  vacancy,
  page,
}: {
  vacancy: VacancyDetail;
  page: ReturnType<typeof useVacancyPage>;
}) {
  const linkable = isSafeExternalUrl(vacancy.applyUrl);
  // `hasAnalysis`' rule: the analysis is there when `recommendation` is.
  const analysed = vacancy.recommendation !== null;

  return (
    <div className={HEADER_ROW}>
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <div className="text-base font-semibold text-ink-muted">{vacancy.company}</div>
        </div>
        <h1 className="text-4xl font-extrabold leading-6.5 tracking-[-0.01em]">{vacancy.title}</h1>
        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          <span className="font-mono font-semibold">#{vacancy.id}</span>
          {!analysed && <Tag tone="neutral">Not analysed yet</Tag>}
          {analysed && <ScorePill score={vacancy.matchScore} />}
          {analysed &&
            (linkable ? (
              <a
                href={vacancy.applyUrl}
                target="_blank"
                rel="noreferrer"
                className="no-underline hover:brightness-105"
                title="Open original posting"
              >
                <RecommendationTag recommendation={vacancy.recommendation} />
              </a>
            ) : (
              <RecommendationTag recommendation={vacancy.recommendation} />
            ))}
        </div>
        {page.statusError && <p className="mt-1.5 text-sm text-bad">{page.statusError}</p>}
      </div>
      <div className="flex flex-none items-center gap-2 narrow:w-full">
        <StatusControl vacancy={vacancy} page={page} />
        <CopyVacancyButton
          id={vacancy.id}
          company={vacancy.company}
          title={vacancy.title}
          applyUrl={vacancy.applyUrl}
        />
        {linkable && (
          <a
            href={vacancy.applyUrl}
            target="_blank"
            rel="noreferrer"
            className={buttonClass('icon')}
            aria-label="Open original posting"
          >
            <IconExternal />
            <Tip>Open posting</Tip>
          </a>
        )}
      </div>
    </div>
  );
}
