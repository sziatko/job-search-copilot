import { describe, expect, it } from 'vitest';
import { type BackfillRow, planBackfill } from './applyurl-backfill';

// Unit test of the pure planner — no DB traffic of its own. (The core project's
// shared setup still opens a connection per file, so the test DB must be up.)
//
// This is the one function in the repo that rewrites stored keys in bulk, and it
// is the guard ADR-0023 names: a run that misses a collision would violate the
// unique index on applyUrl, and one that over-reports stops a legitimate run. The
// docblock claims the dry run and the write agree by construction, because the
// plan is pure — that claim is what these tests hold it to.
function row(id: number, applyUrl: string, company = 'Acme'): BackfillRow {
  return { id, company, applyUrl };
}

describe('planBackfill', () => {
  it('leaves an already-canonical row alone', () => {
    const plan = planBackfill([row(1, 'https://acme.com/jobs/1')]);

    expect(plan.rewrites).toEqual([]);
    expect(plan.collisions).toEqual([]);
    expect(plan.unchanged).toBe(1);
    expect(plan.synthetic).toBe(0);
  });

  it('plans one rewrite for a drifted key, carrying the company for the report', () => {
    const plan = planBackfill([row(7, 'https://acme.com/jobs/1?utm_source=linkedin')]);

    expect(plan.rewrites).toEqual([
      {
        id: 7,
        company: 'Acme',
        from: 'https://acme.com/jobs/1?utm_source=linkedin',
        to: 'https://acme.com/jobs/1',
      },
    ]);
    expect(plan.unchanged).toBe(0);
  });

  it('runs the same site rules the services do, so an Indeed key keeps its id', () => {
    // The backfill and the dedup lookup both call `normalizeApplyUrl`, so they can
    // never disagree about what canonical means. If they could, a "canonical" row
    // would still miss its own lookup — the bug the backfill exists to fix.
    const plan = planBackfill([
      row(1, 'https://pl.indeed.com/viewjob?jk=49a71fd8aa94f8a6&from=serp'),
    ]);

    expect(plan.rewrites).toEqual([
      {
        id: 1,
        company: 'Acme',
        from: 'https://pl.indeed.com/viewjob?jk=49a71fd8aa94f8a6&from=serp',
        to: 'https://pl.indeed.com/viewjob?jk=49a71fd8aa94f8a6',
      },
    ]);
  });

  it('counts a tracker:// row as synthetic and never rewrites it', () => {
    // It fails the scheme gate by design (ADR-0023), so it is not a key that can
    // drift — touching it would be the script inventing work.
    const plan = planBackfill([row(1, 'tracker://acme/backend-engineer/2026-09-21')]);

    expect(plan.synthetic).toBe(1);
    expect(plan.rewrites).toEqual([]);
  });

  it('reports a collision when two rows would become one key', () => {
    const a = row(1, 'https://acme.com/jobs/1?utm_source=a');
    const b = row(2, 'https://acme.com/jobs/1/');

    const plan = planBackfill([a, b]);

    // Both rows are in the group, including the one that would not itself be
    // rewritten — the operator needs to see what it collides *with*.
    expect(plan.collisions).toEqual([{ target: 'https://acme.com/jobs/1', group: [a, b] }]);
  });

  it('catches a rewrite landing on a value already stored', () => {
    // Why `byTarget` is keyed on the target rather than on the source: row 1 is
    // already canonical, so it produces no rewrite of its own — and row 2's
    // rewrite would still violate the unique index. The same collision, arriving
    // from the other direction.
    const stored = row(1, 'https://acme.com/jobs/1');
    const drifted = row(2, 'https://acme.com/jobs/1/?utm_source=x');

    const plan = planBackfill([stored, drifted]);

    expect(plan.rewrites.map((r) => r.id)).toEqual([2]);
    expect(plan.collisions).toEqual([
      { target: 'https://acme.com/jobs/1', group: [stored, drifted] },
    ]);
  });

  it('reports no collision when every row is its own key', () => {
    const plan = planBackfill([
      row(1, 'https://acme.com/jobs/1'),
      row(2, 'https://acme.com/jobs/2?ref=x'),
      row(3, 'tracker://acme/backend-engineer/2026-09-21'),
    ]);

    expect(plan.collisions).toEqual([]);
  });

  it('accounts for every row: unchanged + rewrites + synthetic is the input length', () => {
    // The three counters are printed as a breakdown of the table, so a row falling
    // outside all three would make the report disagree with the row count above it.
    const rows = [
      row(1, 'https://acme.com/jobs/1'),
      row(2, 'https://acme.com/jobs/2?utm_source=x'),
      row(3, 'tracker://acme/backend-engineer/2026-09-21'),
      row(4, 'not a url at all'),
    ];

    const plan = planBackfill(rows);

    expect(plan.unchanged + plan.rewrites.length + plan.synthetic).toBe(rows.length);
    expect(plan.unchanged).toBe(1);
    expect(plan.rewrites).toHaveLength(1);
    expect(plan.synthetic).toBe(2);
  });

  it('plans nothing for an empty table', () => {
    expect(planBackfill([])).toEqual({
      rewrites: [],
      synthetic: 0,
      unchanged: 0,
      collisions: [],
    });
  });
});
