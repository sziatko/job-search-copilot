import { describe, expect, it } from 'vitest';
import { InvalidIntakeEntryError } from './errors';
import { getPrisma } from './prisma-client';
import { VacancyService } from './vacancy.service';
import { normalizeCompanyKey, normalizeTitleKey } from './vacancy-intake';
import { VacancyIntakeService } from './vacancy-intake.service';

// Integration tests against the real (test) Postgres — same rationale as
// vacancy.service.spec.ts.
const intake = new VacancyIntakeService();
const prisma = getPrisma();

const entry = (overrides: Record<string, string | null> = {}) => ({
  url: 'https://acme.com/jobs/1',
  company: 'Acme',
  title: 'Dev',
  ...overrides,
});

/** The vacancy's status journal, oldest first. */
async function journal(vacancyId: number) {
  const rows = await prisma.statusChange.findMany({
    where: { vacancyId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return rows.map((row) => row.status);
}

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
    expect(normalizeCompanyKey('—')).toBeNull();
  });
});

describe('VacancyIntakeService.intake', () => {
  it('creates a NEW vacancy, unanalysed, with its url clean; the raw form is then a duplicate', async () => {
    const raw = 'https://acme.com/jobs/1/?utm_source=x&trk=y#apply';
    expect(await intake.intake(entry({ url: raw, source: 'justjoin' }))).toEqual({ new: true });

    const stored = await prisma.vacancy.findFirstOrThrow();
    expect(stored).toMatchObject({
      applyUrl: 'https://acme.com/jobs/1',
      company: 'Acme',
      title: 'Dev',
      companyKey: 'acme',
      titleKey: 'dev',
      source: 'justjoin',
      fullText: null,
      matchScore: null,
      recommendation: null,
      status: 'NEW',
    });
    expect(await journal(stored.id)).toEqual(['NEW']);
    expect(await intake.intake(entry({ url: raw }))).toEqual({ new: false });
    expect(await prisma.vacancy.count()).toBe(1);
  });

  it('stores the text when the new entry carries some', async () => {
    await intake.intake(entry({ fullText: 'The posting.' }));
    expect((await prisma.vacancy.findFirstOrThrow()).fullText).toBe('The posting.');
  });

  it('matches a LinkedIn locale link with slug and ?trk= against the www key', async () => {
    await intake.intake(entry({ url: 'https://www.linkedin.com/jobs/view/3900000001' }));
    expect(
      await intake.intake(
        entry({
          url: 'https://pl.linkedin.com/jobs/view/senior-engineer-at-globex-3900000001?trk=public_jobs',
          company: 'Other',
          title: 'Other',
        }),
      ),
    ).toEqual({ new: false });
  });

  it('catches the same role under a new link by company + title, suffix ignored', async () => {
    await intake.intake(entry({ company: 'Acme Sp. z o.o.' }));
    expect(
      await intake.intake(entry({ url: 'https://acme.com/jobs/2', company: 'ACME', title: 'dev' })),
    ).toEqual({ new: false });
    expect(await prisma.vacancy.count()).toBe(1);
  });

  it('on a hit fills only the missing text — never a status, a source or a name', async () => {
    await intake.intake(entry());
    const { id } = await prisma.vacancy.findFirstOrThrow();
    await prisma.vacancy.update({ where: { id }, data: { status: 'FILTERED_OUT' } });

    await intake.intake(
      entry({ company: 'Other Name', title: 'Other', source: 'linkedin', fullText: 'Text.' }),
    );
    await intake.intake(entry({ fullText: 'A second text.' }));

    expect(await prisma.vacancy.findFirstOrThrow()).toMatchObject({
      company: 'Acme',
      title: 'Dev',
      source: null,
      status: 'FILTERED_OUT',
      fullText: 'Text.',
      recommendation: null,
    });
  });

  it('finds an analysed vacancy by url or by keys, and leaves it untouched', async () => {
    const { vacancy } = await new VacancyService().save({
      company: 'Acme Inc.',
      title: 'Backend Engineer',
      applyUrl: 'https://acme.com/jobs/9',
      fullText: 'Analysed text.',
      matchScore: 80,
      recommendation: 'APPLY',
      estimationComment: 'Strong match.',
    });

    expect(await intake.intake(entry({ url: 'https://acme.com/jobs/9?ref=x' }))).toEqual({
      new: false,
    });
    expect(
      await intake.intake(
        entry({ url: 'https://acme.com/jobs/10', title: 'Backend  Engineer', fullText: 'New.' }),
      ),
    ).toEqual({ new: false });

    expect(await prisma.vacancy.findFirstOrThrow()).toMatchObject({
      id: vacancy.id,
      fullText: 'Analysed text.',
      matchScore: 80,
      status: 'NOT_REVIEWED',
    });
    expect(await prisma.vacancy.count()).toBe(1);
  });

  it.each([
    [{ url: null }],
    [{ url: 'javascript:alert(1)' }],
    [{ company: null }],
    [{ title: '  ' }],
  ])('rejects %j — a vacancy needs all three — and creates nothing', async (overrides) => {
    await expect(intake.intake(entry(overrides))).rejects.toThrow(InvalidIntakeEntryError);
    expect(await prisma.vacancy.count()).toBe(0);
  });
});

describe('VacancyIntakeService.intakeMany', () => {
  it('returns the raw url of each new entry, in order', async () => {
    await intake.intake(entry());
    const raw = 'https://acme.com/jobs/2?utm_source=mail';
    expect(
      await intake.intakeMany([
        entry({ url: 'https://acme.com/jobs/1/' }),
        entry({ url: raw, title: 'QA' }),
        entry({ url: 'https://acme.com/jobs/3', title: 'Lead' }),
      ]),
    ).toEqual({ new: [raw, 'https://acme.com/jobs/3'] });
  });

  it('lets a later entry match an earlier one in the same batch', async () => {
    expect(
      await intake.intakeMany([
        entry({ url: 'https://acme.com/jobs/4' }),
        entry({ url: 'https://acme.com/jobs/4#x' }),
      ]),
    ).toEqual({ new: ['https://acme.com/jobs/4'] });
  });

  it('skips entries without a usable url, a company or a title', async () => {
    expect(
      await intake.intakeMany([
        entry({ url: null }),
        entry({ url: 'ftp://acme.com/1' }),
        { url: 'https://acme.com/jobs/6' },
        entry({ url: 'https://acme.com/jobs/5' }),
      ]),
    ).toEqual({ new: ['https://acme.com/jobs/5'] });
    expect(await prisma.vacancy.count()).toBe(1);
  });
});
