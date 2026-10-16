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
import { DetailsLink } from '@/components/ui/DetailsLink';
import { ScorePill } from '@/components/ui/ScorePill';
import { Select, type SelectOption } from '@/components/ui/Select';
import { SkeletonCard } from '@/components/ui/SkeletonCard';
import { SkeletonRows } from '@/components/ui/SkeletonRows';
import { isSafeExternalUrl } from '@/lib/url';
import { ApplicationStatusSelect } from '../applications/components/ApplicationStatusSelect';
import { isPipelineStatus } from '../applications/types';
import { ApplyDialog } from '../vacancies/components/ApplyDialog';
import { ConfirmDialog } from '../vacancies/components/ConfirmDialog';
import { CopyVacancyButton } from '../vacancies/components/CopyVacancyButton';
import { RecommendationTag } from '../vacancies/components/RecommendationTag';
import { SaveForLaterDialog } from '../vacancies/components/SaveForLaterDialog';
import { actionsFor } from '../vacancies/components/VacancyTable';
import { STATUS_LABELS, STATUS_TAGS } from '../vacancies/constants';
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
        <div className="empty-state">Vacancy not found.</div>
      </>
    );
  }
  if (error) {
    return (
      <>
        <BackLink />
        <div className="empty-state">Failed to load the vacancy: {error.message}</div>
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

      <section className="card mb-[16px]" aria-labelledby={`${cardId}-history`}>
        <div className="card-head">
          <h2 id={`${cardId}-history`}>Status history</h2>
        </div>
        <Timeline steps={vacancy.timeline} />
      </section>

      <div className="dash-grid">
        <div className="stack-gap">
          <section className="card" aria-labelledby={`${cardId}-description`}>
            <div className="card-head">
              <h2 id={`${cardId}-description`}>Description</h2>
            </div>
            <Description text={vacancy.fullText} />
          </section>
          <section className="card" aria-labelledby={`${cardId}-comments`}>
            <div className="card-head">
              <h2 id={`${cardId}-comments`}>Comments &amp; history</h2>
              <div className="count">
                {vacancy.comments.length} {vacancy.comments.length === 1 ? 'entry' : 'entries'}
              </div>
            </div>
            <Comments comments={vacancy.comments} />
            <CommentForm
              saving={page.commentSaving}
              error={page.commentError}
              onSubmit={page.addComment}
            />
          </section>
        </div>
        <section className="card" aria-labelledby={`${cardId}-details`}>
          <div className="card-head">
            <h2 id={`${cardId}-details`}>Details</h2>
          </div>
          <Facts vacancy={vacancy} />
        </section>
      </div>

      <section className="card mt-[16px]" aria-labelledby={`${cardId}-others`}>
        <div className="card-head">
          <h2 id={`${cardId}-others`}>Other vacancies at {vacancy.company}</h2>
          <div className="count">
            {page.othersPending
              ? 'Loading…'
              : `${page.others.length} ${page.others.length === 1 ? 'vacancy' : 'vacancies'}`}
          </div>
        </div>
        <OtherVacancies items={page.others} pending={page.othersPending} />
      </section>
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
        <div className="w-full max-w-[520px]">
          <span className="skeleton h-[13px] w-[30%]" />
          <span className="skeleton mt-[10px] h-[22px] w-[80%]" />
          <span className="skeleton mt-[14px] h-[12px] w-[40%]" />
        </div>
        <span className="skeleton h-[32px] w-[200px]" />
      </div>
      <SkeletonCard lines={1} className="mb-[16px]" />
      <div className="dash-grid">
        <SkeletonCard lines={6} />
        <div aria-hidden className="card">
          <div className="card-head">
            <span className="skeleton h-[15px] w-[35%]" />
          </div>
          <div className="fact-list">
            {Array.from({ length: FACT_COUNT }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders, never reordered
              <div key={i} className="fact-row" data-testid="fact-row">
                <span className="skeleton w-[35%]" />
                <span className="skeleton w-[25%]" />
              </div>
            ))}
          </div>
        </div>
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
          {!analysed && <span className="tag neutral">Not analysed yet</span>}
          {analysed && <ScorePill score={vacancy.matchScore} />}
          {analysed &&
            (linkable ? (
              <a
                href={vacancy.applyUrl}
                target="_blank"
                rel="noreferrer"
                className="rec-link"
                title="Open original posting"
              >
                <RecommendationTag recommendation={vacancy.recommendation} />
              </a>
            ) : (
              <RecommendationTag recommendation={vacancy.recommendation} />
            ))}
        </div>
        {page.statusError && <p className="mt-[6px] text-[12px] text-bad">{page.statusError}</p>}
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
            className="icon-btn"
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
        className="status-select"
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
    return (
      <div className="empty-block">
        <p>No posting text</p>
        <span>None has come in for this vacancy yet.</span>
      </div>
    );
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
    return <div className="empty-state">No comments yet</div>;
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
      <textarea
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
        className="field-input w-full resize-y"
      />
      {error && <p className="self-start text-[12px] text-bad">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={saving || body.trim() === ''}>
        {saving ? 'Saving…' : 'Add comment'}
      </button>
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
    return <div className="empty-state">No other vacancies</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table aria-busy={pending}>
        <thead>
          <tr>
            <th style={{ width: 120 }}>Added</th>
            <th>Vacancy</th>
            <th style={{ width: 90 }}>Score</th>
            <th style={{ width: 150 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {pending && <SkeletonRows rows={3} cols={4} />}
          {items.map((item) => (
            <tr key={item.id}>
              <td className="date-cell">{dateFormatter.format(new Date(item.createdAt))}</td>
              <td>
                <div className="role-title-row">
                  {isSafeExternalUrl(item.applyUrl) ? (
                    <a
                      href={item.applyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="role-title role-link"
                    >
                      {item.title}
                    </a>
                  ) : (
                    <span className="role-title">{item.title}</span>
                  )}
                  <DetailsLink id={item.id} />
                </div>
                <div className="role-meta">
                  {item.company} <span className="id">#{item.id}</span>
                </div>
              </td>
              <td>{item.hasAnalysis ? <ScorePill score={item.matchScore} /> : '—'}</td>
              <td>
                <span className={`tag ${STATUS_TAGS[item.status].variant}`}>
                  {STATUS_TAGS[item.status].text}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
