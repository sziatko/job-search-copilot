/**
 * What counts as "the same" — every match key in one place.
 *
 * - **The same posting**: an equal `applyUrl` (normalized, `url.ts`), else equal
 *   `(companyKey, titleKey)` — intake's dedup (ADR-0033) and `record`'s lookup by name
 *   (ADR-0019) alike. Both keys are stored on `Vacancy`; a row whose name normalizes
 *   to nothing has a null key and is matched by url only.
 * - **The same company**: an equal `companyGroupKey` (ADR-0032) — the company modal,
 *   `sameCompanyAs` and `companyMatchCount`. Computed, not stored.
 *
 * Two company keys on purpose, because a wrong match costs different things. A posting
 * wrongly taken for a known one is never stored — lost without a trace — so its key
 * strips only what never tells two companies apart (case, punctuation, legal forms). A
 * wrong company group only lists an extra row the user can see, so its key also drops
 * notes and places: `Fabrikam (client: bank)` and `Fabrikam (client: telecom)` are one
 * group, but their two `Senior Frontend Developer` postings stay two vacancies.
 *
 * Changing `normalizeCompanyKey` or `normalizeTitleKey` leaves every stored key in the
 * old shape — it needs a backfill (`scripts/backfill-match-keys.ts`), like a
 * `normalizeApplyUrl` change. `companyGroupKey` is not stored: a change applies at once.
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

/** The stored posting keys of a (company, title) — what every create writes. */
export function matchKeys(
  company: string,
  title: string,
): { companyKey: string | null; titleKey: string | null } {
  return { companyKey: normalizeCompanyKey(company), titleKey: normalizeTitleKey(title) };
}

// Matched after normalizeCompanyKey's collapse, the way it matches legal forms: a
// trailing country or region names an office, not another company.
const PLACE_SUFFIX =
  / (?:polska|poland|spain|españa|espana|latam|germany|deutschland|uk|usa|ukraine|netherlands|emea|europe)$/;

/**
 * Same company ⇔ equal keys (ADR-0032), so every spelling of a company sees the same
 * rows and the same count. `normalizeCompanyKey` (case, punctuation, legal forms), with
 * a note in parentheses (`Fabrikam (partner company)`) and a trailing country
 * (`contoso Polska`) dropped too. A name that is nothing but those keeps itself.
 */
export function companyGroupKey(company: string): string {
  let key = normalizeCompanyKey(company.replace(/\([^)]*\)/g, ' ')) ?? '';
  // `Acme Polska Sp. z o.o.` carries both, in either order.
  for (let prev = ''; prev !== key; ) {
    prev = key;
    key = normalizeCompanyKey(key.replace(PLACE_SUFFIX, '')) ?? '';
  }
  return key || company.trim().toLowerCase();
}
