// The `review` commit status, required on every merge. A SHA with no status cannot merge, so new
// code asks for a review by itself, and tests or docs since the last review carry it over.
//
//   node scripts/review-status.mjs ci                             run by CI, reads its env
//   npm run review:attest [-- --migration-checked]                run after the three reviews
//
// Limit: this protects against forgetting, not against a deliberate bypass. A required status
// with no integration is satisfied by anyone who can set it, a job named `review` in a PR's own
// workflow included, and CI runs the PR's copy of this script with write access. A fork PR has a
// read-only token, so CI cannot post on it, even for docs: the owner runs `attest` there.
// Past that: reviews in CI.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { changedPaths, kindBetween } from './change-kind.mjs';

const REVIEWED = 'reviewed';
const MIGRATIONS = 'packages/core/prisma/migrations/';

// A kind nobody expected asks for a review: `docs` and `tests` are the only ways out.
const isCode = (kind) => kind !== 'docs' && kind !== 'tests';

export function decide({ kind, actor, headStatus, reviewedSha, kindSince }) {
  // CI can land after `attest`, or be re-run: it must not take a review back.
  if (headStatus === 'success') return { state: 'keep', description: 'already a success' };
  if (!isCode(kind) || actor === 'dependabot[bot]') {
    return { state: 'success', description: 'not needed' };
  }
  if (!reviewedSha) return { state: 'pending', description: 'needs review' };
  const short = reviewedSha.slice(0, 7);
  if (!isCode(kindSince)) return { state: 'success', description: `inherited from ${short}` };
  return { state: 'pending', description: `needs review since ${short}` };
}

export function attestRefusal({ dirty, head, prHead, gateConclusions, paths, migrationChecked }) {
  if (dirty) return 'the working tree is not clean: a review reads what is committed';
  if (head !== prHead) return `HEAD ${head} is not the PR's pushed head ${prHead}`;
  if (gateConclusions.length === 0 || !gateConclusions.every((c) => c === 'success')) {
    return `the gate check on HEAD is not green: ${gateConclusions.join(', ') || 'no run yet'}`;
  }
  if (!migrationChecked && paths.some((path) => path.startsWith(MIGRATIONS))) {
    return 'a migration: run it on a fresh db:pull, then pass --migration-checked';
  }
  return null;
}

const run = (command, ...args) => execFileSync(command, args, { encoding: 'utf8' }).trim();
const gh = (...args) => run('gh', 'api', ...args);

const reviewStatus = (sha) =>
  JSON.parse(gh(`repos/{owner}/{repo}/commits/${sha}/status`)).statuses.find(
    (status) => status.context === 'review',
  );

const post = (sha, state, description) =>
  gh(
    `repos/{owner}/{repo}/statuses/${sha}`,
    '-f',
    `state=${state}`,
    '-f',
    'context=review',
    '-f',
    `description=${description}`,
    '--silent',
  );

// Only the PR's own commits: a force-push takes the reviewed one off this list, so it asks again.
function newestReviewed(pr) {
  const commits = gh('--paginate', `repos/{owner}/{repo}/pulls/${pr}/commits`, '--jq', '.[].sha');
  return commits
    .split('\n')
    .reverse()
    .find((sha) => {
      const status = reviewStatus(sha);
      return status?.state === 'success' && status.description.startsWith(REVIEWED);
    });
}

function ci({ KIND: kind, ACTOR: actor, PR: pr, HEAD_SHA: head }) {
  const reviewedSha = newestReviewed(pr);
  const { state, description } = decide({
    kind,
    actor,
    headStatus: reviewStatus(head)?.state,
    reviewedSha,
    kindSince: reviewedSha && kindBetween(reviewedSha, head),
  });
  console.log(`review on ${head}: ${state}, ${description}`);
  // Never github.sha: on a pull request that is the merge ref, not the commit that merges.
  if (state !== 'keep') post(head, state, description);
}

function attest(flags) {
  const { headRefOid, baseRefName } = JSON.parse(
    run('gh', 'pr', 'view', '--json', 'headRefOid,baseRefName'),
  );
  const head = run('git', 'rev-parse', 'HEAD');
  run('git', 'fetch', '-q', 'origin', baseRefName);
  const refusal = attestRefusal({
    // A moved .claude is normal: its pointer goes with the next commit.
    dirty: run('git', 'status', '--porcelain', '--ignore-submodules=all') !== '',
    head,
    prHead: headRefOid,
    gateConclusions: gh(
      `repos/{owner}/{repo}/commits/${head}/check-runs?check_name=gate`,
      '--jq',
      '.check_runs[].conclusion',
    )
      .split('\n')
      .filter(Boolean),
    paths: changedPaths(`origin/${baseRefName}`, head),
    migrationChecked: flags.includes('--migration-checked'),
  });
  if (refusal) {
    console.error(`attest refused: ${refusal}`);
    process.exit(1);
  }
  post(head, 'success', `${REVIEWED}: ponytail, code, security`);
  console.log(`review on ${head}: success`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'ci') ci(process.env);
  else if (command === 'attest') attest(args);
  else throw new Error(`unknown command "${command}", expected ci or attest`);
}
