import { describe, expect, it } from 'vitest';
import { InvalidVacancyLogEntryError } from './errors';
import { getPrisma } from './prisma-client';
import { normalizeCompanyKey, normalizeTitleKey } from './vacancy-log';
import { VacancyLogService } from './vacancy-log.service';

// Integration tests against the real (test) Postgres — same rationale as
// vacancy.service.spec.ts.
const log = new VacancyLogService();
const prisma = getPrisma();

describe('the match keys', () => {
  it.each([
    ['Acme Sp. z o.o.'],
    ['ACME sp. z o. o.'],
    ['Acme, Inc.'],
    ['Acme LLC'],
    ['Acme GmbH'],
    ['Acme B.V.'],
    ['Acme Co. Ltd'],
    ['  acme  '],
  ])('reduces %j to the bare name', (company) => {
    expect(normalizeCompanyKey(company)).toBe('acme');
  });

  it('keeps a name that is nothing but a suffix word', () => {
    expect(normalizeCompanyKey('Inc.')).toBe('inc');
  });

  it('collapses case, punctuation and whitespace in a title', () => {
    expect(normalizeTitleKey('Senior  Front-End Engineer (React)')).toBe(
      'senior front end engineer react',
    );
    expect(normalizeTitleKey(' !! ')).toBeNull();
  });
});

describe('VacancyLogService.check', () => {
  it('records a new posting with its url clean, and the raw form is then a duplicate', async () => {
    const raw = 'https://acme.com/jobs/1/?utm_source=x&trk=y#apply';
    expect(await log.check({ url: raw, company: 'Acme', title: 'Dev' })).toEqual({ new: true });

    const stored = await prisma.vacancyLogEntry.findFirstOrThrow();
    expect(stored).toMatchObject({ url: 'https://acme.com/jobs/1', companyKey: 'acme' });
    expect(await log.check({ url: raw })).toEqual({ new: false });
  });

  it('matches a LinkedIn locale link with slug and ?trk= against the www key', async () => {
    await log.check({ url: 'https://www.linkedin.com/jobs/view/3900000001' });
    expect(
      await log.check({
        url: 'https://pl.linkedin.com/jobs/view/senior-engineer-at-globex-3900000001?trk=public_jobs',
      }),
    ).toEqual({ new: false });
  });

  it('catches the same role under a new link by company + title, suffix ignored', async () => {
    await log.check({ url: 'https://acme.com/jobs/1', company: 'Acme Sp. z o.o.', title: 'Dev' });
    expect(
      await log.check({ url: 'https://acme.com/jobs/2', company: 'ACME', title: 'dev' }),
    ).toEqual({ new: false });
    expect(await prisma.vacancyLogEntry.count()).toBe(1);
  });

  it('fills a stored row with the company and title it lacked, overwriting nothing', async () => {
    await log.check({ url: 'https://acme.com/jobs/3' });
    await log.check({ url: 'https://acme.com/jobs/3', company: 'Acme', title: 'Dev' });
    await log.check({ url: 'https://acme.com/jobs/3', company: 'Other', title: 'Else' });

    expect(await prisma.vacancyLogEntry.findFirstOrThrow()).toMatchObject({
      company: 'Acme',
      title: 'Dev',
      companyKey: 'acme',
      titleKey: 'dev',
    });
  });

  it.each([[{}], [{ company: 'Acme', title: 'Dev' }], [{ url: 'javascript:alert(1)' }]])(
    'rejects %j — no http(s) url — and records nothing',
    async (entry) => {
      await expect(log.check(entry)).rejects.toThrow(InvalidVacancyLogEntryError);
      expect(await prisma.vacancyLogEntry.count()).toBe(0);
    },
  );
});

describe('VacancyLogService.checkMany', () => {
  it('returns the raw url of each new entry, in order', async () => {
    await log.check({ url: 'https://acme.com/jobs/1' });
    const raw = 'https://acme.com/jobs/2?utm_source=mail';
    expect(
      await log.checkMany([
        { url: 'https://acme.com/jobs/1/' },
        { url: raw },
        { url: 'https://acme.com/jobs/3' },
      ]),
    ).toEqual({ new: [raw, 'https://acme.com/jobs/3'] });
  });

  it('lets a later entry match an earlier one in the same batch', async () => {
    expect(
      await log.checkMany([
        { url: 'https://acme.com/jobs/4' },
        { url: 'https://acme.com/jobs/4#x' },
      ]),
    ).toEqual({ new: ['https://acme.com/jobs/4'] });
  });

  it('skips entries without a usable url', async () => {
    expect(
      await log.checkMany([
        { company: 'Acme', title: 'Dev' },
        { url: 'ftp://acme.com/1' },
        { url: 'https://acme.com/jobs/5' },
      ]),
    ).toEqual({ new: ['https://acme.com/jobs/5'] });
    expect(await prisma.vacancyLogEntry.count()).toBe(1);
  });

  it('stamps new rows with recordedAt when given', async () => {
    const recordedAt = new Date('2026-03-01T00:00:00Z');
    await log.checkMany([{ url: 'https://acme.com/jobs/6' }], { recordedAt });
    expect((await prisma.vacancyLogEntry.findFirstOrThrow()).createdAt).toEqual(recordedAt);
  });
});
