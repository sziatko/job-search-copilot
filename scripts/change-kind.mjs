// What a change needs from CI, and whether CI gave it. Runs before `npm ci`, on the runner's
// own Node, so no npm dependencies.
//
//   node scripts/change-kind.mjs kind <base> <head>       prints docs, tests or code
//   NEEDS='<toJSON(needs)>' node scripts/change-kind.mjs gate    exits 1 unless CI passed
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DOCS = [/\.md$/, /^docs\//, /^\.claude$/];
const TESTS = [/^e2e\//, /^apps\/api\/test\//, /\.spec\.ts$/, /\.test\.tsx?$/, /\.test\.mjs$/];

const matches = (patterns, path) => patterns.some((pattern) => pattern.test(path));

// A path nobody listed is code, and so is no path at all: the mistake must cost a CI run,
// never skip one.
export function changeKind(paths) {
  if (paths.length === 0) return 'code';
  const rest = paths.filter((path) => !matches(DOCS, path));
  if (rest.length === 0) return 'docs';
  return rest.every((path) => matches(TESTS, path)) ? 'tests' : 'code';
}

// GitHub counts a skipped job as a success, so a required `gate` has to look at what ran: a
// failed `changes` skips the jobs after it, and they would all read as green.
export function gateResult({ changes, verify, e2e }) {
  if (changes.result !== 'success') return false;
  if (changes.outputs.kind === 'docs') return true;
  return verify.result === 'success' && e2e.result === 'success';
}

export function changedPaths(base, head) {
  // An empty side would mean HEAD to git, and a wrong diff with no error.
  if (!base || !head) throw new Error(`needs <base> and <head>, got "${base}" "${head}"`);
  // --no-renames: a rename from .ts to .md must list the .ts. -z: a path git would quote.
  const listed = execFileSync(
    'git',
    ['diff', '--name-only', '--no-renames', '-z', `${base}...${head}`],
    { encoding: 'utf8' },
  );
  return listed.split('\0').filter(Boolean);
}

export function kindBetween(base, head) {
  // A push that creates a branch has no previous commit: the zeros are not a commit to diff.
  if (/^0+$/.test(base)) return 'code';
  return changeKind(changedPaths(base, head));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'kind') {
    console.log(kindBetween(...args));
  } else if (command === 'gate') {
    if (!gateResult(JSON.parse(process.env.NEEDS))) {
      console.error(`gate: CI did not pass: ${process.env.NEEDS}`);
      process.exit(1);
    }
  } else {
    throw new Error(`unknown command "${command}", expected kind or gate`);
  }
}
