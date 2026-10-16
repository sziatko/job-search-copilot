import type { PrismaClient, VacancyStatus } from '@prisma/client';
import { forUser } from '../db/for-user';
import { getPrisma } from '../db/prisma-client';
import {
  OPEN_PIPELINE_STATUSES,
  PIPELINE_STATUSES,
  type PipelineStatus,
  timedOutWhere,
} from '../domain/status';

/** How many journal rows `recent` carries — the dashboard's activity feed. */
const RECENT_SIZE = 6;

/** Past a reply: the company has answered. */
const RESPONDED: VacancyStatus[] = ['ACTION_NEEDED', 'INTERVIEW', 'AWAITING', 'OFFER'];
const INTERVIEWED: VacancyStatus[] = ['INTERVIEW', 'OFFER'];

/** `GET /stats` (ADR-0031). The funnel stages count the journal ("ever reached"),
 * `pipeline` the current status. */
export interface Stats {
  /** Every vacancy, analysed or not (ADR-0033). */
  logged: number;
  /** Current `status = NEW` — the analysis queue, with or without posting text. */
  awaitingAnalysis: number;
  awaitingTriage: number;
  recommended: number;
  /** The analyzer's no, each vacancy once: currently `FILTERED_OUT` (by a `SKIP` or the
   * user) **or** analysed `SKIP`, whatever its status now. */
  notRecommended: number;
  applied: number;
  /** Current `status = DECLINED` — the user said no. */
  declined: number;
  /** Current `status = UNAVAILABLE` — the posting closed before the user applied. */
  unavailable: number;
  responded: number;
  interview: number;
  /** Current `status = ACTION_NEEDED` — the user's move. */
  actionNeeded: number;
  pipeline: {
    byStatus: Record<PipelineStatus, number>;
    active: number;
    timedOut: number;
    total: number;
  };
  /** The latest pipeline moves, newest first. */
  recent: {
    id: number;
    vacancyId: number;
    status: PipelineStatus;
    createdAt: Date;
    company: string;
    title: string;
  }[];
}

export class StatsService {
  /** @param db defaults (on construction, not import) to the lazy process-wide client —
   *   same rationale as VacancyService. Nest passes its managed client. */
  constructor(private readonly db: PrismaClient = getPrisma()) {}

  /** One user's numbers (`forUser`, ADR-0038). @param now the timeout clock's "today"; a
   * parameter so a test can pin it. */
  async get(userId: string, now = new Date()): Promise<Stats> {
    const db = forUser(this.db, userId);
    const everReached = (statuses: VacancyStatus[]) =>
      db.vacancy.count({ where: { statusChanges: { some: { status: { in: statuses } } } } });

    const [
      logged,
      awaitingAnalysis,
      awaitingTriage,
      recommended,
      notRecommended,
      applied,
      declined,
      unavailable,
      responded,
      interview,
      groups,
      timedOut,
      recent,
    ] = await Promise.all([
      db.vacancy.count(),
      db.vacancy.count({ where: { status: 'NEW' } }),
      db.vacancy.count({ where: { status: 'NOT_REVIEWED' } }),
      db.vacancy.count({ where: { recommendation: { in: ['APPLY', 'APPLY_WITH_CAVEATS'] } } }),
      db.vacancy.count({
        where: { OR: [{ status: 'FILTERED_OUT' }, { recommendation: 'SKIP' }] },
      }),
      everReached(['APPLIED']),
      db.vacancy.count({ where: { status: 'DECLINED' } }),
      db.vacancy.count({ where: { status: 'UNAVAILABLE' } }),
      everReached(RESPONDED),
      everReached(INTERVIEWED),
      db.vacancy.groupBy({
        by: ['status'],
        where: { status: { in: [...PIPELINE_STATUSES] } },
        _count: { _all: true },
      }),
      db.vacancy.count({ where: timedOutWhere(now) }),
      db.statusChange.findMany({
        where: { status: { in: [...PIPELINE_STATUSES] } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: RECENT_SIZE,
        select: {
          id: true,
          vacancyId: true,
          status: true,
          createdAt: true,
          vacancy: { select: { company: true, title: true } },
        },
      }),
    ]);

    const byStatus = Object.fromEntries(PIPELINE_STATUSES.map((s) => [s, 0])) as Record<
      PipelineStatus,
      number
    >;
    for (const group of groups) byStatus[group.status as PipelineStatus] = group._count._all;
    const open = OPEN_PIPELINE_STATUSES.reduce((sum, status) => sum + byStatus[status], 0);

    return {
      logged,
      awaitingAnalysis,
      awaitingTriage,
      recommended,
      notRecommended,
      applied,
      declined,
      unavailable,
      responded,
      interview,
      actionNeeded: byStatus.ACTION_NEEDED,
      pipeline: {
        byStatus,
        active: open - timedOut,
        timedOut,
        total: Object.values(byStatus).reduce((sum, n) => sum + n, 0),
      },
      recent: recent.map(({ vacancy, ...row }) => ({
        ...row,
        status: row.status as PipelineStatus,
        ...vacancy,
      })),
    };
  }
}
