import { useState } from 'react';
import { IconExternal } from '@/components/icons';
import { buttonClass } from '@/components/ui/Button';
import { ScorePill } from '@/components/ui/ScorePill';
import { AddTagButton } from '@/components/ui/TableCells';
import { Tag } from '@/components/ui/Tag';
import { Tip } from '@/components/ui/Tip';
import { AddTagModal } from '@/components/vacancies/AddTagModal';
import { CopyVacancyButton } from '@/components/vacancies/CopyVacancyButton';
import { RecommendationTag } from '@/components/vacancies/RecommendationTag';
import { VacancyTags } from '@/components/vacancies/VacancyTags';
import { isSafeExternalUrl } from '@/lib/url';
import type { VacancyDetail } from '@/lib/vacancies/types';
import { StatusControl } from './StatusControl';
import type { useVacancyPage } from './useVacancyPage';

/** The header row, here and in the skeleton: who and what on the left, the controls
 * on the right — under it, full width, on a phone. */
export const HEADER_ROW = 'mb-5 flex flex-wrap items-start justify-between gap-4';

/** The company, the title, the id, score, verdict and tags; the status control and the
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
  const [addingTag, setAddingTag] = useState(false);

  return (
    <div className={HEADER_ROW}>
      <div>
        <div className="mb-2 flex items-center gap-2">
          <div className="text-body font-semibold text-ink-muted">{vacancy.company}</div>
        </div>
        <h1 className="text-headline">{vacancy.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-small text-ink-muted">
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
          <AddTagButton saving={page.tagSaving} onClick={() => setAddingTag(true)} />
        </div>
        <VacancyTags
          tags={vacancy.tags}
          edit={{ saving: page.tagSaving, onRemove: page.removeTag }}
        />
        {page.statusError && <p className="mt-2 text-small text-bad-ink">{page.statusError}</p>}
        {page.tagError && <p className="mt-2 text-small text-bad-ink">{page.tagError}</p>}
        {addingTag && (
          <AddTagModal
            assigned={vacancy.tags}
            onAdd={page.addTag}
            onClose={() => setAddingTag(false)}
          />
        )}
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
            <Tip align="end">Open posting</Tip>
          </a>
        )}
      </div>
    </div>
  );
}
