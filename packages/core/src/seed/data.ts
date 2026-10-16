import type { Recommendation, VacancyStatus } from '@prisma/client';

/**
 * The seed (ADR-0037): made-up vacancies for the e2e tests and the public demo.
 * Everything here is invented — companies, titles, links, salaries, notes (invariant 10);
 * the demo publishes it. Changing it changes the demo and every e2e expectation built
 * on these counts.
 */

/** One status move after intake and the analysis. APPLIED goes through
 * `ApplicationService.record`, a later pipeline move through its `updateStatus` (`note`
 * an AGENT comment), a triage move through `VacancyService.updateStatus` (`note` a USER
 * comment). */
export interface SeedMove {
  to: VacancyStatus;
  note?: string;
}

export interface SeedVacancy {
  company: string;
  title: string;
  applyUrl: string;
  source: string | null;
  /** Null = the posting text never came in. */
  fullText: string | null;
  /** Null = not analysed. Its estimation comment is the ANALYZER comment. */
  analysis: { matchScore: number; recommendation: Recommendation; comment: string } | null;
  moves: SeedMove[];
  /** What was entered when applying — read only with an APPLIED move. */
  salary?: string;
  tailored?: boolean;
  /** Days between the last status move and the reset; the journal before it is one day
   * per step. Over 30 on an open pipeline row = timed out. */
  daysAgo: number;
}

const COMPANIES = [
  'Acme Analytics',
  'Bluefin Logistics',
  'Cobalt Harbor',
  'Driftwood Labs',
  'Emberline Studio',
  'Foxglove Health',
  'Granite Peak Software',
  'Hollow Pine Games',
  'Ironleaf Finance',
  'Juniper Grid',
  'Kestrel Mobility',
  'Lumen Orchard',
  'Marigold Retail',
  'Nimbus Ferry',
  'Oakridge Insuretech',
  'Pebble & Stream',
  'Quartz Lane',
  'Riverstone Media',
  'Saffron Systems',
  'Tidewater Energy',
  'Umber Works',
  'Velvet Compass',
  'Willowbrook Data',
  'Xylo Robotics',
  'Yarrow Learning',
  'Zephyr Travel',
  'Amberfield Sp. z o.o.',
  'Brightkiln GmbH',
  'Copperleaf Bank',
  'Dunmore Freight',
  'Evergale',
  'Fernhill Cloud',
];

const TITLES = [
  'Senior Frontend Engineer',
  'Frontend Team Lead',
  'React Developer',
  'Senior TypeScript Engineer',
  'Angular Developer',
  'UI Platform Engineer',
];

const SOURCES = ['justjoin', 'linkedin', null];

function postingText(company: string, title: string): string {
  return (
    `${company} is hiring a ${title}. You will build and maintain the web front end of ` +
    'our product in React and TypeScript, work closely with design and backend engineers, ' +
    'review code and help shape the shared component library. Remote within the EU, a ' +
    'learning budget, and a small team that ships every week.'
  );
}

const apply = (k: number) => ({
  matchScore: 70 + ((k * 7) % 26),
  recommendation: 'APPLY' as const,
  comment: 'Strong match: React and TypeScript at the core, remote, a senior scope.',
});
const caveats = (k: number) => ({
  matchScore: 50 + ((k * 5) % 20),
  recommendation: 'APPLY_WITH_CAVEATS' as const,
  comment: 'Good fit on the stack; the salary range is not stated and the role leans on Angular.',
});
const skip = (k: number) => ({
  matchScore: 15 + ((k * 9) % 35),
  recommendation: 'SKIP' as const,
  comment: 'Backend-heavy role (Java), on-site only — outside the profile.',
});

type Shape = Partial<Pick<SeedVacancy, 'analysis' | 'moves' | 'salary' | 'tailored'>> & {
  daysAgo: number;
  noText?: boolean;
};

const applied = (k: number, ...rest: SeedMove[]): SeedMove[] => [
  { to: 'APPLIED', note: k % 2 === 0 ? 'Applied through the careers page.' : undefined },
  ...rest,
];
const salary = (k: number) => `${60 + 5 * (k % 5)}k EUR / year`;
const timedOutDays = (k: number) => 35 + 7 * k;

/** [how many, the shape of the k-th] — in this order, so ids follow it. */
const GROUPS: [number, (k: number) => Shape][] = [
  // NEW: waiting for the analysis, with the posting text and without.
  [8, (k) => ({ daysAgo: k % 3 })],
  [4, (k) => ({ daysAgo: k, noText: true })],
  // FILTERED_OUT: by the analyzer's SKIP, and by the user before any analysis.
  [15, (k) => ({ analysis: skip(k), daysAgo: 1 + k })],
  [3, (k) => ({ moves: [{ to: 'FILTERED_OUT' }], daysAgo: 2 + k })],
  // NOT_REVIEWED: APPLY, APPLY_WITH_CAVEATS, and a SKIP the user sent back to the queue.
  [25, (k) => ({ analysis: apply(k), daysAgo: k % 10 })],
  [25, (k) => ({ analysis: caveats(k), daysAgo: k % 12 })],
  [5, (k) => ({ analysis: skip(k), moves: [{ to: 'NOT_REVIEWED' }], daysAgo: k })],
  // The rest of triage.
  [
    8,
    (k) => ({
      analysis: apply(k),
      moves: [{ to: 'SAVED_FOR_LATER', note: 'Ask about the team size first.' }],
      daysAgo: 1 + k,
    }),
  ],
  [8, (k) => ({ analysis: caveats(k), moves: [{ to: 'DECLINED' }], daysAgo: 2 + k })],
  [5, (k) => ({ analysis: apply(k), moves: [{ to: 'UNAVAILABLE' }], daysAgo: 3 + k })],
  // The pipeline. APPLIED, active and timed out.
  [
    7,
    (k) => ({
      analysis: apply(k),
      moves: applied(k),
      salary: salary(k),
      tailored: k % 2 === 1,
      daysAgo: 1 + 2 * k,
    }),
  ],
  [8, (k) => ({ analysis: caveats(k), moves: applied(k), daysAgo: timedOutDays(k) })],
  [
    4,
    (k) => ({
      analysis: apply(k),
      moves: applied(k, { to: 'ACTION_NEEDED', note: 'They asked for availability.' }),
      salary: salary(k),
      daysAgo: k === 3 ? timedOutDays(k) : 2 + k,
    }),
  ],
  [
    4,
    (k) => ({
      analysis: apply(k),
      moves: applied(
        k,
        { to: 'ACTION_NEEDED', note: 'They asked for availability.' },
        { to: 'AWAITING', note: 'Sent my availability.' },
      ),
      daysAgo: k === 3 ? timedOutDays(k) : 1 + k,
    }),
  ],
  // INTERVIEW twice: the next round is an event of its own.
  [
    5,
    (k) => ({
      analysis: apply(k),
      moves: applied(
        k,
        { to: 'ACTION_NEEDED' },
        { to: 'INTERVIEW', note: 'Technical interview, round one.' },
        { to: 'INTERVIEW', note: 'Round two with the team lead.' },
      ),
      salary: salary(k),
      tailored: true,
      daysAgo: k === 4 ? timedOutDays(k) : 1 + k,
    }),
  ],
  [
    4,
    (k) => ({
      analysis: apply(k),
      moves: applied(
        k,
        { to: 'INTERVIEW' },
        { to: 'AWAITING', note: 'Waiting for the decision after the final round.' },
      ),
      salary: salary(k),
      daysAgo: 2 + k,
    }),
  ],
  [
    2,
    (k) => ({
      analysis: apply(k),
      moves: applied(k, { to: 'INTERVIEW' }, { to: 'OFFER', note: 'An offer arrived by email.' }),
      salary: salary(k),
      tailored: true,
      daysAgo: 1 + k,
    }),
  ],
  [
    10,
    (k) => ({
      analysis: k % 2 === 0 ? apply(k) : caveats(k),
      moves:
        k % 3 === 0
          ? applied(
              k,
              { to: 'INTERVIEW' },
              { to: 'REJECTED', note: 'Rejected after the interview.' },
            )
          : applied(k, { to: 'REJECTED' }),
      daysAgo: 3 + 6 * k,
    }),
  ],
];

/** About 150 — past one page of 100. The k-th of the run gets company `k % 32` and
 * title `k / 32`: every (company, title) pair distinct, so intake never matches two,
 * and each company holds four or five vacancies. */
export const SEED_VACANCIES: SeedVacancy[] = GROUPS.flatMap(([count, shape]) =>
  Array.from({ length: count }, (_, k) => shape(k)),
).map(({ noText, ...shape }, i) => {
  const company = COMPANIES[i % COMPANIES.length];
  const title = TITLES[Math.floor(i / COMPANIES.length) % TITLES.length];
  return {
    company,
    title,
    applyUrl: `https://jobs.example.com/postings/${i + 1}`,
    source: SOURCES[i % SOURCES.length],
    fullText: noText ? null : postingText(company, title),
    analysis: null,
    moves: [],
    ...shape,
  };
});
