import { useParams, useRouter } from '@tanstack/react-router';
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { IconCheck, IconChevronLeft, IconCross, IconExternal } from '@/components/icons';
import { DetailsLink } from '@/components/ui/DetailsLink';
import { ScorePill } from '@/components/ui/ScorePill';
import { Select } from '@/components/ui/Select';
import { isSafeExternalUrl } from '@/lib/url';
import { ApplicationStatusSelect } from '../applications/components/ApplicationStatusSelect';
import { isPipelineStatus } from '../applications/types';
import { ApplyDialog } from '../vacancies/components/ApplyDialog';
import { ConfirmDialog } from '../vacancies/components/ConfirmDialog';
import { CopyVacancyButton } from '../vacancies/components/CopyVacancyButton';
import { RecommendationTag } from '../vacancies/components/RecommendationTag';
import { STATUS_LABELS, STATUS_TAGS } from '../vacancies/constants';
import {
  type CommentSource,
  VACANCY_ACTION,
  type VacancyAction,
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
const CLOSED_BAD: readonly VacancyStatus[] = ['DECLINED', 'REJECTED'];
const CLOSED_GOOD: VacancyStatus = 'OFFER';

/** Core's `PLACEHOLDER_COMMENT` — the text a vacancy recorded without a posting carries. */
const PLACEHOLDER_TEXT = 'N/A';

const SOURCE_META = {
  ANALYZER: { label: 'LLM analysis', className: 'src-analyzer' },
  USER: { label: 'You', className: 'src-user' },
  AGENT: { label: 'Agent', className: 'src-agent' },
} satisfies Record<CommentSource, { label: string; className: string }>;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length === 0 ? '?' : (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

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
  const { id: rawId } = useParams({ from: '/vacancies/$id' });
  const id = Number(rawId);
  const page = useVacancyPage(id);
  const { data: vacancy, isPending, error } = page.vacancy;

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
    return <div className="empty-state">Loading…</div>;
  }

  return (
    <>
      <BackLink />
      <Header vacancy={vacancy} page={page} />

      <div className="card mb-[16px]">
        <div className="card-head">
          <h2>Status history</h2>
        </div>
        <Timeline steps={vacancy.timeline} />
      </div>

      <div className="dash-grid">
        <div className="stack-gap">
          <div className="card">
            <div className="card-head">
              <h2>Description</h2>
            </div>
            <Description text={vacancy.fullText} />
          </div>
          <div className="card">
            <div className="card-head">
              <h2>Comments &amp; history</h2>
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
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Details</h2>
          </div>
          <Facts vacancy={vacancy} />
        </div>
      </div>

      <div className="card mt-[16px]">
        <div className="card-head">
          <h2>Other vacancies at {vacancy.company}</h2>
          <div className="count">
            {page.othersPending
              ? 'Loading…'
              : `${page.others.length} ${page.others.length === 1 ? 'vacancy' : 'vacancies'}`}
          </div>
        </div>
        <OtherVacancies items={page.others} pending={page.othersPending} />
      </div>
    </>
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
  // `hasAnalysis`' rule: a placeholder has no analysis behind its score.
  const analysed = vacancy.estimationComment !== null;

  return (
    <div className="detail-header">
      <div>
        <div className="detail-company-row">
          <div className="company-mark" aria-hidden>
            {initials(vacancy.company)}
          </div>
          <div className="detail-company-name">{vacancy.company}</div>
        </div>
        <h1 className="detail-title">{vacancy.title}</h1>
        <div className="detail-meta-row">
          <span className="detail-id-tag">#{vacancy.id}</span>
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
 * dialog, Declined confirms first; from APPLIED on, the /applications pipeline select.
 */
function StatusControl({
  vacancy,
  page,
}: {
  vacancy: VacancyDetail;
  page: ReturnType<typeof useVacancyPage>;
}) {
  const [pending, setPending] = useState<'apply' | 'decline' | null>(null);
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

  function change(next: VacancyAction) {
    if (next === VACANCY_ACTION.APPLIED) setPending('apply');
    else if (next === VACANCY_ACTION.DECLINED) setPending('decline');
    else page.moveTriage(next);
  }

  return (
    <>
      <Select
        className="status-select"
        value={status as VacancyAction}
        options={TRIAGE_OPTIONS}
        disabled={page.statusSaving}
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
              <div className="timeline-label">{STATUS_LABELS[step.status]}</div>
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
function Description({ text }: { text: string }) {
  const [clampable, setClampable] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the text changes
  useLayoutEffect(() => {
    const el = bodyRef.current;
    setClampable(!!el && el.scrollHeight > el.clientHeight + 2);
  }, [text]);

  const trimmed = text.trim();
  if (trimmed === '' || trimmed.toUpperCase() === PLACEHOLDER_TEXT) {
    return (
      <div className="empty-block">
        <p>No description</p>
        <span>This source gave no posting text.</span>
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
    <div className="history-list">
      {comments.map((comment) => {
        const source = SOURCE_META[comment.source];
        return (
          <div key={comment.id} className="history-item">
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
          </div>
        );
      })}
    </div>
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
    <div className="fact-row">
      <span className="fact-label">{label}</span>
      <span className="fact-value">{children}</span>
    </div>
  );
}

function Facts({ vacancy }: { vacancy: VacancyDetail }) {
  const analysed = vacancy.estimationComment !== null;
  return (
    <div className="fact-list">
      <Fact label="Match score">{analysed ? <ScorePill score={vacancy.matchScore} /> : '—'}</Fact>
      <Fact label="Recommendation">
        {analysed ? <RecommendationTag recommendation={vacancy.recommendation} /> : '—'}
      </Fact>
      <Fact label="Salary in listing">{vacancy.salaryInListing ?? 'not listed'}</Fact>
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
  if (pending) return null;
  if (items.length === 0) {
    return <div className="empty-state">No other vacancies</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th style={{ width: 120 }}>Added</th>
            <th>Vacancy</th>
            <th style={{ width: 90 }}>Score</th>
            <th style={{ width: 150 }}>Status</th>
          </tr>
        </thead>
        <tbody>
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
