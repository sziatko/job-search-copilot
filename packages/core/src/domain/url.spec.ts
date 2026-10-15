import { describe, expect, it } from 'vitest';
import { buildSyntheticApplyUrl, normalizeApplyUrl } from './url';

// Unit test, no DB traffic of its own — same shape as recommendation.spec.ts.
// (The core project's shared setup still opens a connection per file, so the
// test DB must be up to run this; that is the suite's constraint, not this
// spec's.)
describe('normalizeApplyUrl', () => {
  describe('the scheme gate', () => {
    it.each([
      ['javascript:alert(1)'],
      ['JaVaScRiPt:alert(1)'],
      ['data:text/html,<script>alert(1)</script>'],
      ['vbscript:msgbox(1)'],
      ['mailto:someone@example.com'],
      ['ftp://example.com/jobs/1'],
      ['tracker://acme/backend-engineer/2026-09-21'],
      ['not a url at all'],
      ['example.com/jobs/1'],
      [''],
      ['   '],
    ])('rejects %j', (url) => {
      expect(normalizeApplyUrl(url)).toBeNull();
    });

    it('rejects null and undefined', () => {
      expect(normalizeApplyUrl(null)).toBeNull();
      expect(normalizeApplyUrl(undefined)).toBeNull();
    });

    it('keeps http as well as https', () => {
      expect(normalizeApplyUrl('http://acme.com/jobs/1')).toBe('http://acme.com/jobs/1');
    });
  });

  describe('the query strip', () => {
    it('drops the tracking params that made two links out of one posting', () => {
      expect(
        normalizeApplyUrl('https://www.linkedin.com/jobs/view/3912345678?refId=x&trackingId=y'),
      ).toBe('https://www.linkedin.com/jobs/view/3912345678');
      expect(normalizeApplyUrl('https://acme.com/jobs/1?utm_source=linkedin&fbclid=IwAR0')).toBe(
        'https://acme.com/jobs/1',
      );
    });

    it('drops the whole query, not just the trackers — an id param goes too', () => {
      // The deliberate cost, pinned so a later "smarter" change has to argue with
      // a failing test. See ADR-0023.
      expect(normalizeApplyUrl('https://acme.com/careers?gh_jid=456')).toBe(
        'https://acme.com/careers',
      );
    });

    it('drops a bare trailing "?" without leaving it behind', () => {
      expect(normalizeApplyUrl('https://acme.com/jobs/1?')).toBe('https://acme.com/jobs/1');
    });

    it('drops the fragment — it never reaches the server, so it never changes the document', () => {
      expect(normalizeApplyUrl('https://acme.com/jobs/1#apply')).toBe('https://acme.com/jobs/1');
    });

    it('does not cut a "?" that lives inside the fragment', () => {
      // The fragment is dropped whole, so the '?' inside it goes with it rather
      // than being read as the start of a query.
      expect(normalizeApplyUrl('https://acme.com/jobs/1#f?g')).toBe('https://acme.com/jobs/1');
      expect(normalizeApplyUrl('https://acme.com/jobs/1?a=b#c?d')).toBe('https://acme.com/jobs/1');
    });
  });

  describe('the site rules', () => {
    it.each([
      ['https://pl.indeed.com/viewjob?jk=49a71fd8aa94f8a6'],
      ['https://us.indeed.com/viewjob?jk=49a71fd8aa94f8a6'],
      ['https://nl.indeed.com/viewjob?jk=49a71fd8aa94f8a6'],
      ['https://www.indeed.com/viewjob?jk=49a71fd8aa94f8a6'],
      ['https://indeed.com/viewjob?jk=49a71fd8aa94f8a6'],
    ])('keeps both the locale and the id in %j', (url) => {
      // The id *is* the `jk` param, so the generic query strip would have thrown
      // the key away: every Indeed posting from one locale would share one row
      // and all but the first would be discarded by analyze-once. See ADR-0023.
      expect(normalizeApplyUrl(url)).toBe(url);
    });

    it('lowercases the locale the way it lowercases any other host', () => {
      expect(normalizeApplyUrl('https://PL.INDEED.COM/viewjob?jk=49a71fd8aa94f8a6')).toBe(
        'https://pl.indeed.com/viewjob?jk=49a71fd8aa94f8a6',
      );
    });

    it('drops the tracking params and keeps only the id', () => {
      expect(
        normalizeApplyUrl('https://pl.indeed.com/viewjob?from=serp&jk=49a71fd8aa94f8a6&vjs=3'),
      ).toBe('https://pl.indeed.com/viewjob?jk=49a71fd8aa94f8a6');
    });

    it('does not fold two locales into one row — the cost, taken deliberately', () => {
      // The id is global, so merging `pl.` and `us.` would be defensible and
      // would dedup one posting seen twice. It is not done: the link should open
      // the page the user actually scraped. Two rows and two analyses instead —
      // pinned so a later "cleanup" has to argue with a failing test. ADR-0023.
      const pl = normalizeApplyUrl('https://pl.indeed.com/viewjob?jk=49a71fd8aa94f8a6');
      const us = normalizeApplyUrl('https://us.indeed.com/viewjob?jk=49a71fd8aa94f8a6');
      expect(pl).not.toBe(us);
    });

    it('leaves the id alone rather than folding its case', () => {
      // A dead link is the one outcome this file refuses to risk; a duplicate row
      // is the cheaper failure.
      expect(normalizeApplyUrl('https://pl.indeed.com/viewjob?jk=ABC123')).toBe(
        'https://pl.indeed.com/viewjob?jk=ABC123',
      );
      // Re-encoded from the parsed params, so the result carries exactly one param.
      expect(normalizeApplyUrl('https://pl.indeed.com/viewjob?jk=a%2Bb')).toBe(
        'https://pl.indeed.com/viewjob?jk=a%2Bb',
      );
    });

    it('falls back to the generic rules when there is no id to key on', () => {
      // A search page or an expired link, not a vacancy: rule 2 applies, as on any
      // other host.
      expect(normalizeApplyUrl('https://pl.indeed.com/viewjob?from=serp')).toBe(
        'https://pl.indeed.com/viewjob',
      );
      expect(normalizeApplyUrl('https://pl.indeed.com/viewjob?jk=')).toBe(
        'https://pl.indeed.com/viewjob',
      );
      expect(normalizeApplyUrl('https://pl.indeed.com/q-engineer-jobs.html?from=serp')).toBe(
        'https://pl.indeed.com/q-engineer-jobs.html',
      );
    });

    it('matches a declared domain, not merely a host name that contains it', () => {
      // Why the check is a suffix on the host rather than a substring: with
      // `includes`, this first case would be handed to Indeed's normalizer — and
      // `indeed.com.evil.com` would be too.
      expect(normalizeApplyUrl('https://notindeed.com/viewjob?jk=49a71fd8aa94f8a6')).toBe(
        'https://notindeed.com/viewjob',
      );
      expect(normalizeApplyUrl('https://acme.com/viewjob?jk=49a71fd8aa94f8a6')).toBe(
        'https://acme.com/viewjob',
      );
    });

    it('still drops the fragment and the trailing slash on a site-ruled URL', () => {
      // The rule owns the query only; the rules after it stay shared.
      expect(normalizeApplyUrl('https://pl.indeed.com/viewjob?jk=49a71fd8aa94f8a6#apply')).toBe(
        'https://pl.indeed.com/viewjob?jk=49a71fd8aa94f8a6',
      );
      expect(normalizeApplyUrl('https://pl.indeed.com/viewjob/?jk=49a71fd8aa94f8a6')).toBe(
        'https://pl.indeed.com/viewjob?jk=49a71fd8aa94f8a6',
      );
    });

    it('is idempotent for a site-ruled URL too', () => {
      // What the backfill and every lookup rest on: a rule that mangled its own
      // output would turn each re-run into a rewrite.
      const once = normalizeApplyUrl('https://pl.indeed.com/viewjob?from=serp&jk=49a71fd8aa94f8a6');
      expect(normalizeApplyUrl(once)).toBe(once);
    });
  });

  describe('the LinkedIn rule', () => {
    const canonical = 'https://www.linkedin.com/jobs/view/3900000001';

    it.each([
      ['https://www.linkedin.com/jobs/view/3900000001'],
      [
        'https://pl.linkedin.com/jobs/view/senior-software-engineer-data-f-m-d-at-globex-3900000001?trk=public_jobs_topcard-title',
      ],
      ['https://nl.linkedin.com/jobs/view/engineer-2-at-acme-3900000001'],
      ['https://www.linkedin.com/jobs/view/3900000001?trk=abc&refId=x'],
      ['https://www.linkedin.com/comm/jobs/view/3900000001/'],
      ['https://linkedin.com/jobs/view/3900000001/#apply'],
      ['http://www.linkedin.com/jobs/view/3900000001'],
    ])('collapses %j onto the one key', (url) => {
      // One posting, one key — the locale host, slug and /comm/ were three more
      // keys per job before. See ADR-0027.
      expect(normalizeApplyUrl(url)).toBe(canonical);
    });

    it('is idempotent', () => {
      expect(normalizeApplyUrl(canonical)).toBe(canonical);
    });

    it('leaves a non-job LinkedIn path on its host, losing only the query', () => {
      expect(normalizeApplyUrl('https://pl.linkedin.com/company/acme/?trk=x')).toBe(
        'https://pl.linkedin.com/company/acme',
      );
      expect(normalizeApplyUrl('https://www.linkedin.com/jobs/search?currentJobId=123')).toBe(
        'https://www.linkedin.com/jobs/search',
      );
    });

    it('does not read a trailing digit run off a non-id segment', () => {
      expect(normalizeApplyUrl('https://www.linkedin.com/jobs/view/123abc')).toBe(
        'https://www.linkedin.com/jobs/view/123abc',
      );
    });
  });

  describe('canonicalization', () => {
    it('leaves an already-canonical URL byte-for-byte alone', () => {
      expect(normalizeApplyUrl('https://example.com/jobs/1')).toBe('https://example.com/jobs/1');
    });

    it('lowercases the host, drops a default port, and adds the origin slash', () => {
      // URL-spec equivalences, so merging these is provably safe. See ADR-0023.
      expect(normalizeApplyUrl('https://ACME.com:443/jobs/1')).toBe('https://acme.com/jobs/1');
      expect(normalizeApplyUrl('https://acme.com')).toBe('https://acme.com/');
    });

    it('collapses a trailing slash on a non-empty path', () => {
      // A judgement call, not a spec guarantee — the two may be different
      // documents, but the mismatch is what the scrapers actually hand back.
      // ADR-0023 names the cost.
      expect(normalizeApplyUrl('https://acme.com/jobs/123/')).toBe('https://acme.com/jobs/123');
      expect(normalizeApplyUrl('https://acme.com/jobs/123')).toBe('https://acme.com/jobs/123');
      expect(normalizeApplyUrl('https://acme.com/jobs/123///')).toBe('https://acme.com/jobs/123');
    });

    it('keeps the slash that is the whole path', () => {
      expect(normalizeApplyUrl('https://acme.com/')).toBe('https://acme.com/');
    });

    it('is idempotent', () => {
      const once = normalizeApplyUrl('https://ACME.com/jobs/1?utm_source=x#apply');
      expect(normalizeApplyUrl(once)).toBe(once);
    });
  });
});

describe('buildSyntheticApplyUrl', () => {
  it('is not a real URL — normalizeApplyUrl rejects it, which is why the web app renders it as text', () => {
    const synthetic = buildSyntheticApplyUrl('Acme', 'Backend Engineer', new Date('2026-09-21'));
    expect(synthetic).toBe('tracker://acme/backend-engineer/2026-09-21');
    expect(normalizeApplyUrl(synthetic)).toBeNull();
  });

  it('is stable, so a re-save of the same posting resolves to the same key', () => {
    const date = new Date('2026-09-21');
    expect(buildSyntheticApplyUrl('Acme', 'Backend Engineer', date)).toBe(
      buildSyntheticApplyUrl('Acme', 'Backend Engineer', date),
    );
  });
});
