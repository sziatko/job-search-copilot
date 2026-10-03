/**
 * Intake's match keys (ADR-0033, from ADR-0026). The url is the primary match; the same
 * posting re-published under a new link is caught on these instead, so
 * `Acme Sp. z o.o.` and `Acme` must land on one key. Stored on `Vacancy` as
 * `companyKey` / `titleKey`. Changing either function leaves every stored key in the
 * old shape — it needs a backfill (`scripts/backfill-match-keys.ts`), like a
 * `normalizeApplyUrl` change.
 */

/** Lowercase; every run of punctuation and whitespace becomes one space. */
function collapse(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// Matched after `collapse`, so `Sp. z o.o.` arrives as `sp z o o` and `B.V.` as `b v`.
// The leading space means a suffix is only stripped when a name is left before it.
const LEGAL_SUFFIX =
  / (?:sp z o ?o|sp k|s a|sa|inc|llc|llp|lp|ltd|limited|gmbh|ag|b ?v|n ?v|plc|corp|corporation|co|s ?r ?l|oy|ab|a ?s|kft|s ?r ?o|pty)$/;

export function normalizeCompanyKey(company: string): string | null {
  let key = collapse(company);
  // `Acme Co. Ltd` carries two.
  for (let prev = ''; prev !== key; ) {
    prev = key;
    key = key.replace(LEGAL_SUFFIX, '');
  }
  return key || null;
}

export function normalizeTitleKey(title: string): string | null {
  return collapse(title) || null;
}

/** One posting to take in. All raw — the service normalizes. The url, company and title
 * are required: an entry without them is not taken in. */
export interface VacancyIntakeInput {
  url?: string | null;
  company?: string | null;
  title?: string | null;
  /** Where it was found (`justjoin`, `linkedin`, …). Stored on a new vacancy only. */
  source?: string | null;
  /** The posting text. Stored on a new vacancy, or on a match that has none. */
  fullText?: string | null;
}
