/**
 * One-off backfill: rewrite stored `EstimatedVacancy.applyUrl` values into the
 * canonical form (ADR-0023), so the rows written before that decision stop being
 * unmatchable keys.
 *
 *   npm run backfill:applyurl -w @job-search-copilot/core [-- --commit]
 *
 * Why it is needed at all: `applyUrl` is the natural key, and every lookup runs
 * the *incoming* value through `normalizeApplyUrl` first. A stored value that is
 * not canonical therefore never equals a canonical lookup — the mismatch reads as
 * a new vacancy, and the duplicate the unique index exists to catch gets created.
 *
 * Dry run by default: prints every row that would change, writes nothing. With
 * `--commit`: prints the report, then requires the operator to type exactly
 * `backfill <N>` (N = the printed rewrite count). All rewrites go in one
 * transaction, all or nothing.
 *
 * Two things it deliberately does not do:
 *   - Synthetic `tracker://` rows are skipped. `normalizeApplyUrl` rejects them by
 *     design (ADR-0023) and their form is already stable, so they are not keys
 *     that can drift.
 *   - A collision — two rows landing on one key — aborts the run rather than being
 *     resolved. The unique index blocks the merge anyway, and choosing a survivor
 *     is a judgement about which analysis and which application history to keep.
 *     Resolve by hand, then re-run.
 *
 * The decision of *which* rows move is `planBackfill` in `src/applyurl-backfill.ts`
 * — pure, and covered by a spec. This file is the entrypoint: the report, the typed
 * confirmation gate, and the transaction.
 */
import { createInterface } from 'node:readline';
import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { planBackfill } from '../src/applyurl-backfill';
import { getPrisma } from '../src/prisma-client';
import { normalizeApplyUrl } from '../src/url';

/** The invariant the whole run exists to establish: every non-synthetic row is its own key. */
async function countNonCanonical(prisma: PrismaClient): Promise<number> {
  const rows = await prisma.estimatedVacancy.findMany({
    select: { applyUrl: true },
  });
  return rows.filter((r) => {
    const to = normalizeApplyUrl(r.applyUrl);
    return to !== null && to !== r.applyUrl;
  }).length;
}

async function main() {
  const commit = process.argv.includes('--commit');
  const prisma = getPrisma();

  const rows = await prisma.estimatedVacancy.findMany({
    select: { id: true, company: true, applyUrl: true },
    orderBy: { id: 'asc' },
  });
  const plan = planBackfill(rows);
  const { rewrites, synthetic, unchanged, collisions } = plan;

  // ---- report ----
  console.log('');
  console.log(`EstimatedVacancy rows : ${rows.length}`);
  console.log(`  already canonical   : ${unchanged}`);
  console.log(`  to rewrite          : ${rewrites.length}`);
  console.log(`  synthetic, skipped  : ${synthetic}  (tracker:// — not keys that can drift)`);

  if (rewrites.length) {
    console.log('\n  rewrites:');
    for (const r of rewrites) {
      console.log(`    id ${String(r.id).padEnd(4)} ${r.company.slice(0, 28).padEnd(28)}`);
      console.log(`         ${r.from}`);
      console.log(`      -> ${r.to}`);
    }
  }

  if (collisions.length) {
    console.log('\n  ⚠️  COLLISIONS — two rows would become one key. Not touched, resolve by hand:');
    for (const c of collisions) {
      console.log(`    -> ${c.target}`);
      for (const row of c.group) {
        console.log(
          `         id ${String(row.id).padEnd(4)} ${row.company.slice(0, 28).padEnd(28)} ${row.applyUrl}`,
        );
      }
    }
  }

  if (!commit) {
    console.log(
      `\nDRY RUN — nothing written. ${collisions.length ? 'Resolve the collisions, then' : 'Re-run with'} --commit to rewrite ${rewrites.length} rows.\n`,
    );
    await prisma.$disconnect();
    return;
  }

  if (collisions.length) {
    console.error(
      '\nRefusing to --commit while collisions remain: the merge would violate the unique index ' +
        "on applyUrl, and which row to keep is not this script's call. Resolve by hand, then re-run.\n",
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  if (rewrites.length === 0) {
    console.log('\nNothing to do.\n');
    await prisma.$disconnect();
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question(
      `\nType exactly "backfill ${rewrites.length}" to write, anything else to abort: `,
      resolve,
    );
  });
  rl.close();

  if (answer.trim() !== `backfill ${rewrites.length}`) {
    console.log('Aborted. Nothing written.\n');
    await prisma.$disconnect();
    return;
  }

  console.log(`\nRewriting ${rewrites.length} rows in one transaction…`);
  try {
    await prisma.$transaction(
      rewrites.map((r) =>
        prisma.estimatedVacancy.update({
          where: { id: r.id },
          data: { applyUrl: r.to },
          select: { id: true },
        }),
      ),
    );
  } catch (err) {
    // Loud, per ADR-0023: a P2002 here means the plan was wrong, not that a row
    // was uninteresting. Nothing was written — the transaction rolled back.
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      console.error(`\nRolled back. ${err.code}: ${err.message}\n`);
    }
    throw err;
  }

  const left = await countNonCanonical(prisma);
  console.log(
    `Done. ${rewrites.length} rewritten; non-canonical rows remaining: ${left}${left === 0 ? ' ✓' : ' (unexpected — re-run the dry run)'}\n`,
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
