import { Fact, FactList } from '@/components/ui/FactList';
import { ScorePill } from '@/components/ui/ScorePill';
import { RecommendationTag } from '@/components/vacancies/RecommendationTag';
import type { VacancyDetail } from '@/lib/vacancies/types';
import { dateTimeFormatter } from './format';

/** The rows `Facts` lists, so its skeleton has as many. */
export const FACT_COUNT = 8;

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '—';
  }
}

/** The Details card: the analysis, the application's fields, where and when. */
export function Facts({ vacancy }: { vacancy: VacancyDetail }) {
  return (
    <FactList>
      <Fact label="Match score">
        <ScorePill score={vacancy.matchScore} />
      </Fact>
      <Fact label="Recommendation">
        <RecommendationTag recommendation={vacancy.recommendation} />
      </Fact>
      <Fact label="Salary">{vacancy.salaryInApplication ?? 'not listed'}</Fact>
      <Fact label="Tailored resume used">{vacancy.usedTailoredResume ? 'Yes' : 'No'}</Fact>
      <Fact label="Source">{hostname(vacancy.applyUrl)}</Fact>
      <Fact label="Status changed">
        {dateTimeFormatter.format(new Date(vacancy.statusChangedAt))}
      </Fact>
      <Fact label="Last updated">{dateTimeFormatter.format(new Date(vacancy.updatedAt))}</Fact>
      <Fact label="Vacancy ID">
        <span className="font-mono tabular-nums">#{vacancy.id}</span>
      </Fact>
    </FactList>
  );
}
