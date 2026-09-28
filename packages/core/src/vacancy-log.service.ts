import type { Prisma, PrismaClient } from '@prisma/client';
import { InvalidVacancyLogEntryError } from './errors';
import { getPrisma } from './prisma-client';
import { normalizeApplyUrl } from './url';
import type { CheckVacancyLogOptions, VacancyLogInput } from './vacancy-log';
import { normalizeCompanyKey, normalizeTitleKey } from './vacancy-log';

interface PreparedEntry {
  url: string;
  company: string | null;
  title: string | null;
  companyKey: string | null;
  titleKey: string | null;
}

/** Normalizes every input value; null when the entry has no usable url. */
function prepare(entry: VacancyLogInput): PreparedEntry | null {
  const url = normalizeApplyUrl(entry.url);
  if (!url) return null;
  const company = entry.company?.trim() || null;
  const title = entry.title?.trim() || null;
  return {
    url,
    company,
    title,
    companyKey: company && normalizeCompanyKey(company),
    titleKey: title && normalizeTitleKey(title),
  };
}

/**
 * The only way into the log (ADR-0026). Answers one question — has this posting been
 * seen? — and records it when it has not. Nothing else is reported.
 */
export class VacancyLogService {
  /** @param db defaults (on construction, not import) to the lazy process-wide client —
   *   same rationale as VacancyService. Nest passes its managed client. */
  constructor(private readonly db: PrismaClient = getPrisma()) {}

  /** One posting. An entry without an http(s) url is an error, not a silent skip:
   * the caller must not read "not checked" as "duplicate". */
  async check(entry: VacancyLogInput): Promise<{ new: boolean }> {
    const prepared = prepare(entry);
    if (!prepared) {
      throw new InvalidVacancyLogEntryError('url is required and must be an http(s) link');
    }
    return { new: await this.db.$transaction((tx) => recordOne(tx, prepared)) };
  }

  /**
   * A batch, in order and in one transaction, so a later entry can match an earlier
   * one. Returns the url of each new entry exactly as it was sent, so the caller can
   * find it in its own list. Entries without a usable url are skipped.
   */
  async checkMany(
    entries: VacancyLogInput[],
    { recordedAt }: CheckVacancyLogOptions = {},
  ): Promise<{ new: string[] }> {
    return this.db.$transaction(
      async (tx) => {
        const fresh: string[] = [];
        for (const entry of entries) {
          const prepared = prepare(entry);
          if (prepared && (await recordOne(tx, prepared, recordedAt))) {
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
 * Match by url, else by (companyKey, titleKey) — the same posting re-published under
 * a new link. A miss is recorded; a hit only gets the company or title it lacked.
 * Returns true when the entry was new.
 */
async function recordOne(
  tx: Prisma.TransactionClient,
  entry: PreparedEntry,
  recordedAt?: Date,
): Promise<boolean> {
  const row =
    (await tx.vacancyLogEntry.findUnique({ where: { url: entry.url } })) ??
    (entry.companyKey && entry.titleKey
      ? await tx.vacancyLogEntry.findFirst({
          where: { companyKey: entry.companyKey, titleKey: entry.titleKey },
          orderBy: { id: 'asc' },
        })
      : null);

  if (!row) {
    await tx.vacancyLogEntry.create({
      data: { ...entry, ...(recordedAt && { createdAt: recordedAt }) },
    });
    return true;
  }

  const data: Prisma.VacancyLogEntryUpdateInput = {};
  if (!row.company && entry.company) {
    data.company = entry.company;
    data.companyKey = entry.companyKey;
  }
  if (!row.title && entry.title) {
    data.title = entry.title;
    data.titleKey = entry.titleKey;
  }
  if (Object.keys(data).length > 0) {
    await tx.vacancyLogEntry.update({ where: { id: row.id }, data });
  }
  return false;
}
