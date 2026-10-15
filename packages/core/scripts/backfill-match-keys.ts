/**
 * One-off backfill (phase 5, ADR-0033): fill `Vacancy.companyKey` / `titleKey` where
 * migration 20261003130100 left them null — the rows with no log row to copy them
 * from. The keys are computed by the same TypeScript normalizers intake uses, which is
 * why this is a script and not SQL.
 *
 *   npm run backfill:match-keys -w @job-search-copilot/core [-- --commit]
 *
 * Dry run by default: prints what would change, writes nothing. With `--commit`, every
 * update goes in one transaction, all or nothing. Only a null key is filled; a stored
 * one is never rewritten. A name that normalizes to nothing (`—`) keeps a null key —
 * it is matched by url only. Safe to re-run: a second run finds nothing to do.
 */

import { getPrisma } from '../src/db/prisma-client';
import { normalizeCompanyKey, normalizeTitleKey } from '../src/domain/identity';

async function main() {
  const commit = process.argv.includes('--commit');
  const prisma = getPrisma();

  const rows = await prisma.vacancy.findMany({
    where: { OR: [{ companyKey: null }, { titleKey: null }] },
    select: { id: true, company: true, title: true, companyKey: true, titleKey: true },
    orderBy: { id: 'asc' },
  });
  const planned = rows.map((row) => ({
    ...row,
    to: {
      companyKey: row.companyKey ?? normalizeCompanyKey(row.company),
      titleKey: row.titleKey ?? normalizeTitleKey(row.title),
    },
  }));
  const updates = planned.filter(
    (row) => row.to.companyKey !== row.companyKey || row.to.titleKey !== row.titleKey,
  );
  const stayNull = planned.filter((row) => !row.to.companyKey || !row.to.titleKey);

  console.log(`\nVacancy rows      : ${await prisma.vacancy.count()}`);
  console.log(`  with a null key : ${rows.length}`);
  console.log(`  to fill         : ${updates.length}`);
  console.log(`  stay null       : ${stayNull.length}  (the name normalizes to nothing)`);
  for (const row of stayNull) {
    console.log(`    id ${String(row.id).padEnd(5)} ${row.company} / ${row.title}`);
  }

  if (!commit) {
    console.log(`\nDRY RUN — nothing written. Re-run with --commit to fill ${updates.length}.\n`);
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(
    updates.map((row) =>
      prisma.vacancy.update({ where: { id: row.id }, data: row.to, select: { id: true } }),
    ),
  );
  const left = await prisma.vacancy.count({
    where: { OR: [{ companyKey: null }, { titleKey: null }] },
  });
  console.log(
    `\nDone. ${updates.length} filled; rows with a null key: ${left}` +
      `${left === stayNull.length ? ' (all of them names that normalize to nothing) ✓' : ' — unexpected, re-run the dry run'}\n`,
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
