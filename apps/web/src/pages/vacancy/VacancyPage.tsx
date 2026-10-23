import { useParams, useRouter } from '@tanstack/react-router';
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { IconCheck, IconChevronLeft, IconCross, IconExternal } from '@/components/icons';
import { Button, buttonClass } from '@/components/ui/Button';
import { Card, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { DetailsLink } from '@/components/ui/DetailsLink';
import { EmptyState } from '@/components/ui/EmptyState';
import { Textarea } from '@/components/ui/Field';
import { ScorePill } from '@/components/ui/ScorePill';
import { Select, type SelectOption } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { SkeletonCard } from '@/components/ui/SkeletonCard';
import { type Column, Table } from '@/components/ui/Table';
import { DateCell, RoleMeta, RoleTitle } from '@/components/ui/TableCells';
import { Tag } from '@/components/ui/Tag';
import { isSafeExternalUrl } from '@/lib/url';
import { ApplicationStatusSelect } from '../applications/components/ApplicationStatusSelect';
import { isPipelineStatus } from '../applications/types';
import { ApplyDialog } from '../vacancies/components/ApplyDialog';
import { ConfirmDialog } from '../vacancies/components/ConfirmDialog';
import { CopyVacancyButton } from '../vacancies/components/CopyVacancyButton';
import { RecommendationTag } from '../vacancies/components/RecommendationTag';
import { SaveForLaterDialog } from '../vacancies/components/SaveForLaterDialog';
import { StatusTag } from '../vacancies/components/StatusTag';
import { actionsFor } from '../vacancies/components/VacancyTable';
import { STATUS_LABELS } from '../vacancies/constants';
import {
  type CommentSource,
  ROW_ACTION,
  type RowAction,
  VACANCY_ACTION,
  type VacancyComment,
  type VacancyDetail,
  type VacancyListItem,
  type VacancyStatus,
} from '../vacancies/types';
import { useVacancyPage } from './useVacancyPage';

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const TRIAGE_OPTIONS = Object.values(VACANCY_ACTION).map((value) => ({
  value,
  label: STATUS_LABELS[value],
}));

/** The statuses that end a vacancy: a bad one, and the good one. */
const CLOSED_BAD: readonly VacancyStatus[] = [
  'DECLINED',
  'UNAVAILABLE',
  'FILTERED_OUT',
  'REJECTED',
];
const CLOSED_GOOD: VacancyStatus = 'OFFER';

const SOURCE_META = {
  ANALYZER: { label: 'LLM analysis', className: 'src-analyzer' },
  USER: { label: 'You', className: 'src-user' },
  AGENT: { label: 'Agent', className: 'src-agent' },
} satisfies Record<CommentSource, { label: string; className: string }>;

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '—';
  }
}

/** `/vacancies/$id` — one vacancy whole: the posting, its status history, the comments,
 * and the company's other vacancies. */
export function VacancyPage() {
  return (
    <section className="view">
      <VacancyView />
    </section>
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

      <div className="dash-grid">
        <div className="stack-gap">
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
      </div>

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

/** The rows `Facts` lists, so its skeleton has as many. */
const FACT_COUNT = 8;

/** The page while the vacancy loads: the real Back link, then its header and cards as
 * bars — the status history, the description, the details. */
function VacancySkeleton() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading…</span>
      <BackLink />
      <div aria-hidden className="detail-header">
        <div className="w-full max-w-130">
          <Skeleton className="h-3.25 w-[30%]" />
          <Skeleton className="mt-2.5 h-5.5 w-[80%]" />
          <Skeleton className="mt-3.5 h-3 w-[40%]" />
        </div>
        <Skeleton className="h-8 w-50" />
      </div>
      <SkeletonCard lines={1} className="mb-4" />
      <div className="dash-grid">
        <SkeletonCard lines={6} />
        <Card aria-hidden>
          <CardHead>
            <Skeleton className="h-3.75 w-[35%]" />
          </CardHead>
          <div className="fact-list">
            {Array.from({ length: FACT_COUNT }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders, never reordered
              <div key={i} className="fact-row" data-testid="fact-row">
                <Skeleton className="h-3 w-[35%]" />
                <Skeleton className="h-3 w-[25%]" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/** Back to wherever the visit came from; a page opened directly goes to /vacancies. */
function BackLink() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="back-link"
      onClick={() =>
        router.history.canGoBack()
          ? router.history.back()
          : void router.navigate({ to: '/vacancies' })
      }
    >
      <IconChevronLeft />
      Back
    </button>
  );
}

function Header({
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
    <div className="detail-header">
      <div>
        <div className="detail-company-row">
          <div className="detail-company-name">{vacancy.company}</div>
        </div>
        <h1 className="detail-title">{vacancy.title}</h1>
        <div className="detail-meta-row">
          <span className="detail-id-tag">#{vacancy.id}</span>
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
        {page.statusError && <p className="mt-[6px] text-sm text-bad">{page.statusError}</p>}
      </div>
      <div className="detail-header-actions">
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
            <span className="tip">Open posting</span>
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * Before APPLIED, the /vacancies actions — Applied records the application through its
 * dialog, Declined confirms first, Saved for later asks for an optional comment; from APPLIED on, the /applications pipeline select.
 * NEW and FILTERED_OUT come before triage: their select offers what the row buttons do
 * (`actionsFor`), under the status itself.
 */
function StatusControl({
  vacancy,
  page,
}: {
  vacancy: VacancyDetail;
  page: ReturnType<typeof useVacancyPage>;
}) {
  const [pending, setPending] = useState<'apply' | 'decline' | 'save' | null>(null);
  const { status } = vacancy;

  if (isPipelineStatus(status)) {
    return (
      <ApplicationStatusSelect
        value={status}
        disabled={page.statusSaving}
        onChange={page.movePipeline}
      />
    );
  }

  function change(next: RowAction) {
    if (next === VACANCY_ACTION.APPLIED) setPending('apply');
    else if (next === VACANCY_ACTION.DECLINED) setPending('decline');
    else if (next === VACANCY_ACTION.SAVED_FOR_LATER) setPending('save');
    else page.moveTriage(next);
  }

  const options: readonly SelectOption<RowAction>[] =
    status === ROW_ACTION.NEW || status === ROW_ACTION.FILTERED_OUT
      ? [status, ...actionsFor(vacancy)].map((value) => ({ value, label: STATUS_LABELS[value] }))
      : TRIAGE_OPTIONS;

  return (
    <>
      <Select
        label="Status"
        value={status}
        options={options}
        // An analysed FILTERED_OUT vacancy has nowhere to go.
        disabled={page.statusSaving || options.length === 1}
        onChange={change}
      />
      {pending === 'apply' && (
        <ApplyDialog
          company={vacancy.company}
          title={vacancy.title}
          onCancel={() => setPending(null)}
          onConfirm={(details) => {
            page.apply(details);
            setPending(null);
          }}
        />
      )}
      {pending === 'decline' && (
        <ConfirmDialog
          title="Decline this vacancy?"
          description={`${vacancy.title} — ${vacancy.company}`}
          confirmLabel="Decline"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            page.moveTriage(VACANCY_ACTION.DECLINED);
            setPending(null);
          }}
        />
      )}
      {pending === 'save' && (
        <SaveForLaterDialog
          company={vacancy.company}
          title={vacancy.title}
          onCancel={() => setPending(null)}
          onConfirm={(comment) => {
            page.moveTriage(VACANCY_ACTION.SAVED_FOR_LATER, comment);
            setPending(null);
          }}
        />
      )}
    </>
  );
}

/** Every `StatusChange`, oldest first. The last step is where the vacancy is now:
 * marked bad or good when it is closed, and trailing off when it is still open. */
function Timeline({ steps }: { steps: VacancyDetail['timeline'] }) {
  const last = steps.at(-1)?.status;
  const open = last !== undefined && !CLOSED_BAD.includes(last) && last !== CLOSED_GOOD;

  return (
    <div className="status-timeline">
      {steps.map((step, i) => {
        const bad = CLOSED_BAD.includes(step.status);
        const good = step.status === CLOSED_GOOD;
        const isLast = i === steps.length - 1;
        const node = !isLast ? 'node-done' : bad ? 'node-bad' : good ? 'node-good' : 'node-current';
        return (
          // The journal is append-only, and two moves never share a date and a status.
          <div key={`${step.createdAt}-${step.status}`} className="contents">
            {i > 0 && (
              <div
                className={`timeline-connector ${bad ? 'connector-bad' : good ? 'connector-good' : ''}`}
              />
            )}
            <div className={`timeline-node ${node}`}>
              <div className="timeline-dot">
                {isLast && bad && <IconCross />}
                {isLast && good && <IconCheck />}
              </div>
              <div className="timeline-label" data-testid="timeline-status">
                {STATUS_LABELS[step.status]}
              </div>
              <time className="timeline-date mono">
                {dateFormatter.format(new Date(step.createdAt))}
              </time>
            </div>
          </div>
        );
      })}
      {open && <div className="timeline-connector connector-trailing" />}
    </div>
  );
}

/** The posting, clamped with a fade; the toggle shows only when the text overflows. */
function Description({ text }: { text: string | null }) {
  const [clampable, setClampable] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the text changes
  useLayoutEffect(() => {
    const el = bodyRef.current;
    setClampable(!!el && el.scrollHeight > el.clientHeight + 2);
  }, [text]);

  if (!text?.trim()) {
    return <EmptyState title="No posting text">None has come in for this vacancy yet.</EmptyState>;
  }

  return (
    <>
      <div className={`desc-wrap ${expanded ? 'expanded' : ''}`}>
        <div ref={bodyRef} className="desc-body">
          {text}
        </div>
        {clampable && <div className="desc-fade" />}
      </div>
      {clampable && (
        <button
          type="button"
          className={`desc-toggle ${expanded ? 'expanded' : ''}`}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : 'Show full description'}
        </button>
      )}
    </>
  );
}

function Comments({ comments }: { comments: VacancyComment[] }) {
  if (comments.length === 0) {
    return <EmptyState>No comments yet</EmptyState>;
  }
  return (
    <ul className="history-list" aria-label="Comments">
      {comments.map((comment) => {
        const source = SOURCE_META[comment.source];
        return (
          <li key={comment.id} className="history-item">
            <div className={`history-badge ${source.className}`} aria-hidden>
              {source.label[0]}
            </div>
            <div className="history-body">
              <div className="history-head">
                <span className="history-source">{source.label}</span>
                <time className="history-time">
                  {dateTimeFormatter.format(new Date(comment.createdAt))}
                </time>
              </div>
              <div className="history-text">{comment.body}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** A new USER comment. Enter sends, Shift+Enter breaks the line — the ApplyDialog's keys. */
function CommentForm({
  saving,
  error,
  onSubmit,
}: {
  saving: boolean;
  error: string | null;
  onSubmit: (body: string, onDone: () => void) => void;
}) {
  const [body, setBody] = useState('');

  function submit() {
    if (body.trim() === '' || saving) return;
    onSubmit(body, () => setBody(''));
  }

  return (
    <form
      className="comment-form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        submit();
      }}
    >
      <Textarea
        aria-label="Add a comment"
        placeholder="Add a comment…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={2}
      />
      {error && <p className="self-start text-sm text-bad">{error}</p>}
      <Button type="submit" variant="primary" disabled={saving || body.trim() === ''}>
        {saving ? 'Saving…' : 'Add comment'}
      </Button>
    </form>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fact-row" data-testid="fact-row">
      <span className="fact-label">{label}</span>
      <span className="fact-value">{children}</span>
    </div>
  );
}

function Facts({ vacancy }: { vacancy: VacancyDetail }) {
  return (
    <div className="fact-list">
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
        <span className="mono">#{vacancy.id}</span>
      </Fact>
    </div>
  );
}

function OtherVacancies({ items, pending }: { items: VacancyListItem[]; pending: boolean }) {
  if (!pending && items.length === 0) {
    return <EmptyState>No other vacancies</EmptyState>;
  }
  return <Table columns={OTHER_COLUMNS} items={items} loading={pending} skeletonRows={3} />;
}

const OTHER_COLUMNS: Column<VacancyListItem>[] = [
  {
    header: 'Added',
    width: 120,
    cell: (item) => <DateCell date={dateFormatter.format(new Date(item.createdAt))} />,
  },
  {
    header: 'Vacancy',
    cell: (item) => (
      <>
        <div className="flex items-center gap-1.5">
          <RoleTitle title={item.title} href={item.applyUrl} />
          <DetailsLink id={item.id} />
        </div>
        <RoleMeta company={item.company} id={item.id} />
      </>
    ),
  },
  {
    header: 'Score',
    width: 90,
    cell: (item) => <ScorePill score={item.hasAnalysis ? item.matchScore : null} />,
  },
  { header: 'Status', width: 150, cell: (item) => <StatusTag status={item.status} /> },
];
