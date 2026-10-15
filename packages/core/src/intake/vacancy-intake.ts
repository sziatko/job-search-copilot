/** One posting to take in. All raw — the service normalizes. The url, company and title
 * are required: an entry without them is not taken in. Matched by url, else by name
 * (`identity.ts`). */
export interface VacancyIntakeInput {
  url?: string | null;
  company?: string | null;
  title?: string | null;
  /** Where it was found (`justjoin`, `linkedin`, …). Stored on a new vacancy only. */
  source?: string | null;
  /** The posting text. Stored on a new vacancy, or on a match that has none. */
  fullText?: string | null;
}
