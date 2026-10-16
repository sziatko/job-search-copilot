import { describe, expect, it } from 'vitest';
import { isSafeExternalUrl } from './url';

// The scheme table mirrors the one in packages/core/src/domain/url.spec.ts. The two
// implementations are kept in step by hand — ADR-0012 keeps `core` and its
// Prisma/pg dependencies out of the browser bundle — so this file is where the
// web copy holds up its half of that bargain.
describe('isSafeExternalUrl', () => {
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
  ])('rejects %j', (url) => {
    expect(isSafeExternalUrl(url)).toBe(false);
  });

  it.each([
    ['http://acme.com/jobs/1'],
    ['https://acme.com/jobs/1'],
    ['https://pl.indeed.com/viewjob?jk=49a71fd8aa94f8a6'],
  ])('accepts %j', (url) => {
    expect(isSafeExternalUrl(url)).toBe(true);
  });

  it('gates the scheme, not the text — a payload in the query is still an https link', () => {
    // Pinned against a well-meaning "hardening" that greps the string for
    // `javascript:` instead of reading the parsed scheme. A posting whose URL
    // merely *mentions* a scheme in a query param is an ordinary link, and
    // turning it into plain text would hide a real vacancy.
    expect(isSafeExternalUrl('https://acme.com/redirect?to=javascript:alert(1)')).toBe(true);
  });
});
