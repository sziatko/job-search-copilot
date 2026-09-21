/**
 * The planning half of the applyUrl backfill (ADR-0023).
 *
 * Kept out of `scripts/backfill-applyurl.ts` for the same reason
 * `tracker-import.ts` is kept out of `scripts/import-tracker.ts`: the script is an
 * entrypoint that runs at module load, and the part worth testing is the pure
 * decision — which stored keys move, which cannot, and which two rows would land
 * on one key. The script keeps the reporting, the confirmation gate and the write.
 */
import { normalizeApplyUrl } from './url';

export interface BackfillRow {
  id: number;
  company: string;
  applyUrl: string;
}

export interface BackfillRewrite {
  id: number;
  company: string;
  from: string;
  to: string;
}

export interface BackfillPlan {
  rewrites: BackfillRewrite[];
  synthetic: number;
  unchanged: number;
  collisions: { target: string; group: BackfillRow[] }[];
}

/** Pure: reads nothing, writes nothing, so the dry run and the write agree by construction. */
export function planBackfill(rows: BackfillRow[]): BackfillPlan {
  const rewrites: BackfillRewrite[] = [];
  let synthetic = 0;
  // Keyed by what each row's key *will* be, so a rewrite landing on an existing
  // value is caught by the same check as two rewrites landing on each other.
  const byTarget = new Map<string, BackfillRow[]>();

  for (const row of rows) {
    const to = normalizeApplyUrl(row.applyUrl);
    if (to === null) {
      synthetic++;
      continue;
    }
    byTarget.set(to, [...(byTarget.get(to) ?? []), row]);
    if (to !== row.applyUrl) {
      rewrites.push({ id: row.id, company: row.company, from: row.applyUrl, to });
    }
  }

  return {
    rewrites,
    synthetic,
    unchanged: rows.length - rewrites.length - synthetic,
    collisions: [...byTarget.entries()]
      .filter(([, group]) => group.length > 1)
      .map(([target, group]) => ({ target, group })),
  };
}
