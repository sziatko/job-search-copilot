import type { TagTone } from '@prisma/client';

/** Tags on one vacancy, existing plus new: far above any real use, low enough that a
 * machine's bug cannot bury a row. Enforced by core, as a rule of the write. */
export const TAGS_PER_VACANCY_MAX = 20;

/** A tag as a vacancy carries it. */
export interface TagRef {
  id: number;
  name: string;
  tone: TagTone;
}

/** A tag as `/profile` lists it. */
export interface TagSummary extends TagRef {
  /** How many of the user's vacancies carry it. */
  vacancyCount: number;
}

export interface CreateTagInput {
  name: string;
  /** Default `GREY`. */
  tone?: TagTone;
}

/** A field left out is untouched. */
export interface UpdateTagInput {
  name?: string;
  tone?: TagTone;
}

/** Names, not ids: a new one in `add` creates the tag, an unknown one in `remove` is
 * ignored. `remove` runs first, so an item can swap a tag at the limit. */
export interface TagVacanciesItem {
  vacancyId: number;
  add?: string[];
  remove?: string[];
}
