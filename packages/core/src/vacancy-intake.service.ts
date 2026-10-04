import type { Prisma, PrismaClient } from '@prisma/client';
import { InvalidIntakeEntryError } from './errors';
import { getPrisma } from './prisma-client';
import { firstStatus } from './status';
import { normalizeApplyUrl } from './url';
import type { VacancyIntakeInput } from './vacancy-intake';
import { normalizeCompanyKey, normalizeTitleKey } from './vacancy-intake';

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
    companyKey: normalizeCompanyKey(company),
    titleKey: normalizeTitleKey(title),
    source: entry.source?.trim() || null,
    fullText:
      entry.fullText && entry.fullText.trim().length >= MIN_TEXT_LENGTH ? entry.fullText : null,
  };
}

/**
 * How a posting enters `Vacancy` unanalysed (ADR-0033): a new one is created in NEW, a
 * known one is reported as a duplicate. Nothing else is reported.
 */
export class VacancyIntakeService {
  /** @param db defaults (on construction, not import) to the lazy process-wide client —
   *   same rationale as VacancyService. Nest passes its managed client. */
  constructor(private readonly db: PrismaClient = getPrisma()) {}

  /** One posting. An entry without an http(s) url, a company or a title is an error,
   * not a silent skip: the caller must not read "not taken in" as "duplicate". */
  async intake(entry: VacancyIntakeInput): Promise<{ new: boolean }> {
    const prepared = prepare(entry);
    if (!prepared) {
      throw new InvalidIntakeEntryError(
        'url (an http(s) link), company and title are all required',
      );
    }
    return { new: await this.db.$transaction((tx) => intakeOne(tx, prepared)) };
  }

  /**
   * A batch, in order and in one transaction, so a later entry can match an earlier
   * one. Returns the url of each new entry exactly as it was sent, so the caller can
   * find it in its own list. Entries without a usable url, a company or a title are
   * skipped.
   */
  async intakeMany(entries: VacancyIntakeInput[]): Promise<{ new: string[] }> {
    return this.db.$transaction(
      async (tx) => {
        const fresh: string[] = [];
        for (const entry of entries) {
          const prepared = prepare(entry);
          if (prepared && (await intakeOne(tx, prepared))) {
            fresh.push(entry.url as string);
          }
        }
        return { new: fresh };
      },
      // ponytail: fixed ceiling sized for BATCH_MAX entries over a remote DB.
      { timeout: 60_000 },
    );
  }
}

/**
 * Match by url, else by (companyKey, titleKey), oldest row — the same posting
 * re-published under a new link. A miss creates the vacancy in NEW. A hit only gets the
 * posting text it lacked: never a status, a source or an analysis. Returns true when
 * the entry was new.
 */
async function intakeOne(tx: Prisma.TransactionClient, entry: PreparedEntry): Promise<boolean> {
  const select = { id: true, fullText: true } as const;
  const row =
    (await tx.vacancy.findUnique({ where: { applyUrl: entry.applyUrl }, select })) ??
    (entry.companyKey && entry.titleKey
      ? await tx.vacancy.findFirst({
          where: { companyKey: entry.companyKey, titleKey: entry.titleKey },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select,
        })
      : null);

  if (!row) {
    await tx.vacancy.create({ data: { ...entry, ...firstStatus(new Date()) } });
    return true;
  }
  if (row.fullText === null && entry.fullText !== null) {
    await tx.vacancy.update({ where: { id: row.id }, data: { fullText: entry.fullText } });
  }
  return false;
}
