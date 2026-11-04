import { forUser, isPrismaError, type Unscoped } from '../db/for-user';
import { getPrisma } from '../db/prisma-client';
import { TagNameTakenError, TagNotFoundError, VacancyNotFoundError } from '../domain/errors';
import {
  attachTags,
  createTags,
  lockVacancies,
  normalizeTagKey,
  parseTagName,
  TAG_REF,
} from '../domain/tags';
import type {
  CreateTagInput,
  TagRef,
  TagSummary,
  TagVacanciesItem,
  UpdateTagInput,
} from './tag.types';

/**
 * A user's tags (ADR-0042), written by the user and by machines alike. Holds no rule about
 * any particular tag, and writing one touches neither `status` nor `recommendation`.
 * Every public method takes the acting user's id first (`forUser`, ADR-0038).
 */
export class TagService {
  /** @param db only ever used through `forUser`. Defaults (on construction, not import) to
   *   the lazy process-wide client — same rationale as VacancyService. */
  constructor(private readonly db: Unscoped = getPrisma()) {}

  /** Every tag, by name whatever its case, with how many vacancies carry it. */
  async list(userId: string): Promise<TagSummary[]> {
    const rows = await forUser(this.db, userId).tag.findMany({
      orderBy: { nameKey: 'asc' },
      select: { ...TAG_REF, _count: { select: { vacancies: true } } },
    });
    return rows.map(({ _count, ...tag }) => ({ ...tag, vacancyCount: _count.vacancies }));
  }

  /** Throws InvalidTagsError on a blank or a too long name, TagNameTakenError on a name
   * taken in any spelling. */
  async create(userId: string, { name, tone }: CreateTagInput): Promise<TagRef> {
    const data = { ...parseTagName(name), tone, userId };
    try {
      return await forUser(this.db, userId).tag.create({ data, select: TAG_REF });
    } catch (err) {
      // The name is the only unique a tag write can break.
      if (isPrismaError(err, 'P2002')) {
        throw new TagNameTakenError(`Tag "${data.name}" already exists`);
      }
      throw err;
    }
  }

  /** As `create`, and TagNotFoundError when this user has no tag with this id. */
  async update(userId: string, id: number, { name, tone }: UpdateTagInput): Promise<TagRef> {
    const renamed = name === undefined ? undefined : parseTagName(name);
    try {
      return await forUser(this.db, userId).tag.update({
        where: { id },
        data: { ...renamed, tone },
        select: TAG_REF,
      });
    } catch (err) {
      if (isPrismaError(err, 'P2002')) {
        throw new TagNameTakenError(`Tag "${renamed?.name}" already exists`);
      }
      if (isPrismaError(err, 'P2025')) throw new TagNotFoundError(`Tag ${id} not found`);
      throw err;
    }
  }

  /** Takes the tag off its vacancies too. TagNotFoundError when this user has no tag with
   * this id. */
  async delete(userId: string, id: number): Promise<void> {
    const { count } = await forUser(this.db, userId).tag.deleteMany({ where: { id } });
    if (count === 0) throw new TagNotFoundError(`Tag ${id} not found`);
  }

  /**
   * Adds and removes tags by name, in one transaction: one failure writes nothing. Every
   * vacancy is checked first, even with nothing to add: a foreign id would otherwise be a
   * P2003 and a 500. Throws VacancyNotFoundError and InvalidTagsError. The transports cap
   * the items at ANALYSIS_BATCH_MAX.
   */
  tagVacancies(userId: string, items: TagVacanciesItem[]): Promise<void> {
    return forUser(this.db, userId).$transaction(async (db) => {
      const ids = items.map((item) => item.vacancyId);
      const known = await lockVacancies(db, userId, ids);
      const missing = ids.find((id) => !known.has(id));
      if (missing !== undefined) throw new VacancyNotFoundError(`Vacancy ${missing} not found`);

      await createTags(
        db,
        userId,
        items.flatMap((item) => item.add ?? []),
      );
      for (const { vacancyId, add = [], remove = [] } of items) {
        if (remove.length > 0) {
          await db.vacancyTag.deleteMany({
            where: { vacancyId, tag: { nameKey: { in: remove.map(normalizeTagKey) } } },
          });
        }
        await attachTags(db, userId, vacancyId, add);
      }
    });
  }
}
