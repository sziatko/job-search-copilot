import type { PrismaClient } from '@prisma/client';
import { forUser, type UserTx } from '../db/for-user';
import { getPrisma } from '../db/prisma-client';
import { InvalidIntakeEntryError } from '../domain/errors';
import { matchKeys } from '../domain/identity';
import { firstStatus } from '../domain/status';
import { normalizeApplyUrl } from '../domain/url';
import type { VacancyIntakeInput } from './vacancy-intake';

/** Shorter posting text, trimmed, is taken as none: a login wall or captcha page, not a
 * posting. Text is never overwritten, so storing it would block the real one. */
const MIN_TEXT_LENGTH = 200;

interface PreparedEntry {
  applyUrl: string;
  company: string;
  title: string;
  companyKey: string | null;
  titleKey: string | null;
  source: string | null;
  fullText: string | null;
}

/** Normalizes every input value; null when the entry lacks a usable url, a company or
 * a title. */
function prepare(entry: VacancyIntakeInput): PreparedEntry | null {
  const applyUrl = normalizeApplyUrl(entry.url);
  const company = entry.company?.trim();
  const title = entry.title?.trim();
  if (!applyUrl || !company || !title) return null;
  return {
    applyUrl,
    company,
    title,
    ...matchKeys(company, title),
    source: entry.source?.trim() || null,
    fullText:
      entry.fullText && entry.fullText.trim().length >= MIN_TEXT_LENGTH ? entry.fullText : null,
  };
}

/**
 * How a posting enters `Vacancy` unanalysed (ADR-0033): a new one is created in NEW, a
 * known one is reported as a duplicate. Nothing else is reported. Per user: another
 * user's vacancies are never a duplicate (`forUser`, ADR-0038).
 */
export class VacancyIntakeService {
  /** @param db defaults (on construction, not import) to the lazy process-wide client —
   *   same rationale as VacancyService. Nest passes its managed client. */
  constructor(private readonly db: PrismaClient = getPrisma()) {}

  /** One posting. An entry without an http(s) url, a company or a title is an error,
   * not a silent skip: the caller must not read "not taken in" as "duplicate". */
  async intake(userId: string, entry: VacancyIntakeInput): Promise<{ new: boolean }> {
    const prepared = prepare(entry);
    if (!prepared) {
      throw new InvalidIntakeEntryError(
        'url (an http(s) link), company and title are all required',
      );
    }
    return {
      new: await forUser(this.db, userId).$transaction((db) => intakeOne(db, userId, prepared)),
    };
  }

  /**
   * A batch, in order and in one transaction, so a later entry can match an earlier
   * one. Returns the url of each new entry exactly as it was sent, so the caller can
   * find it in its own list. Entries without a usable url, a company or a title are
   * skipped.
   */
  async intakeMany(userId: string, entries: VacancyIntakeInput[]): Promise<{ new: string[] }> {
    return forUser(this.db, userId).$transaction(
      async (db) => {
        const fresh: string[] = [];
        for (const entry of entries) {
          const prepared = prepare(entry);
          if (prepared && (await intakeOne(db, userId, prepared))) {
            fresh.push(entry.url as string);
          }
        }
        return { new: fresh };
      },
      // A fixed ceiling, sized for BATCH_MAX entries over a remote DB.
      { timeout: 60_000 },
    );
  }
}

/**
 * Match by url, else by (companyKey, titleKey), oldest row — the same posting
 * re-published under a new link (`identity.ts`). A miss creates the vacancy in NEW. A hit only gets the
 * posting text it lacked: never a status, a source or an analysis. Returns true when
 * the entry was new.
 */
async function intakeOne(db: UserTx, userId: string, entry: PreparedEntry): Promise<boolean> {
  const select = { id: true, fullText: true } as const;
  const row =
    (await db.vacancy.findUnique({
      where: { userId_applyUrl: { userId, applyUrl: entry.applyUrl } },
      select,
    })) ??
    (entry.companyKey && entry.titleKey
      ? await db.vacancy.findFirst({
          where: { companyKey: entry.companyKey, titleKey: entry.titleKey },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select,
        })
      : null);

  if (!row) {
    await db.vacancy.create({ data: { ...entry, userId, ...firstStatus(new Date()) } });
    return true;
  }
  if (row.fullText === null && entry.fullText !== null) {
    await db.vacancy.update({ where: { id: row.id }, data: { fullText: entry.fullText } });
  }
  return false;
}
