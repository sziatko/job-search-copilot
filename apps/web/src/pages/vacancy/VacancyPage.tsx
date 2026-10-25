import { useParams } from '@tanstack/react-router';
import { useId } from 'react';
import { Card, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SplitGrid } from '@/components/ui/SplitGrid';
import { View } from '@/components/ui/View';
import { BackLink } from './BackLink';
import { CommentForm } from './CommentForm';
import { Comments } from './Comments';
import { Description } from './Description';
import { Facts } from './Facts';
import { Header } from './Header';
import { OtherVacancies } from './OtherVacancies';
import { Timeline } from './Timeline';
import { useVacancyPage } from './useVacancyPage';
import { VacancySkeleton } from './VacancySkeleton';

/** `/vacancies/$id` — one vacancy whole: the posting, its status history, the comments,
 * and the company's other vacancies. */
export function VacancyPage() {
  return (
    <View>
      <VacancyView />
    </View>
  );
}

function VacancyView() {
  const { id: rawId } = useParams({ from: '/_app/vacancies/$id' });
  const id = Number(rawId);
  const page = useVacancyPage(id);
  const { data: vacancy, isPending, error } = page.vacancy;
  // Each card is a region named by its heading, for a screen reader to jump between.
  const cardId = useId();

  if (!Number.isInteger(id) || vacancy === null) {
    return (
      <>
        <BackLink />
        <EmptyState>Vacancy not found.</EmptyState>
      </>
    );
  }
  if (error) {
    return (
      <>
        <BackLink />
        <EmptyState>Failed to load the vacancy: {error.message}</EmptyState>
      </>
    );
  }
  if (isPending) {
    return <VacancySkeleton />;
  }

  return (
    <>
      <BackLink />
      <Header vacancy={vacancy} page={page} />

      <Card as="section" className="mb-4" aria-labelledby={`${cardId}-history`}>
        <CardHead>
          <CardTitle id={`${cardId}-history`}>Status history</CardTitle>
        </CardHead>
        <Timeline steps={vacancy.timeline} />
      </Card>

      <SplitGrid>
        <div className="flex flex-col gap-4">
          <Card as="section" aria-labelledby={`${cardId}-description`}>
            <CardHead>
              <CardTitle id={`${cardId}-description`}>Description</CardTitle>
            </CardHead>
            <Description text={vacancy.fullText} />
          </Card>
          <Card as="section" aria-labelledby={`${cardId}-comments`}>
            <CardHead>
              <CardTitle id={`${cardId}-comments`}>Comments &amp; history</CardTitle>
              <CardSub>
                {vacancy.comments.length} {vacancy.comments.length === 1 ? 'entry' : 'entries'}
              </CardSub>
            </CardHead>
            <Comments comments={vacancy.comments} />
            <CommentForm
              saving={page.commentSaving}
              error={page.commentError}
              onSubmit={page.addComment}
            />
          </Card>
        </div>
        <Card as="section" aria-labelledby={`${cardId}-details`}>
          <CardHead>
            <CardTitle id={`${cardId}-details`}>Details</CardTitle>
          </CardHead>
          <Facts vacancy={vacancy} />
        </Card>
      </SplitGrid>

      <Card as="section" className="mt-4" aria-labelledby={`${cardId}-others`}>
        <CardHead>
          <CardTitle id={`${cardId}-others`}>Other vacancies at {vacancy.company}</CardTitle>
          <CardSub>
            {page.othersPending
              ? 'Loading…'
              : `${page.others.length} ${page.others.length === 1 ? 'vacancy' : 'vacancies'}`}
          </CardSub>
        </CardHead>
        <OtherVacancies items={page.others} pending={page.othersPending} />
      </Card>
    </>
  );
}
