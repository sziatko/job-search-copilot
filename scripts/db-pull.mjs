// npm run db:pull [-- <database>]: the production database → a local one (the dev DB by
// default, POSTGRES_DB). docs/deployment.md § Pull the production database.
//
// The dump streams over ssh into the dev stack's Postgres, so no Postgres tools are
// needed on the host. Node, not a shell script: Git Bash's ssh does not see the Windows
// ssh-agent. The host is the local .env's PROD_SSH, never the repo.
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';

process.loadEnvFile('.env');
const host = process.env.PROD_SSH;
const user = process.env.POSTGRES_USER ?? 'postgres';
const target = process.argv[2] ?? process.env.POSTGRES_DB ?? 'job_search_copilot';
if (!host) fail('PROD_SSH is not set in .env (user@host of the server)');
// --clean drops every object it restores: never into a test database by mistake.
if (!/^[a-z0-9_]+$/.test(target) || /_(test|e2e)$/.test(target)) {
  fail(`refusing to restore into "${target}"`);
}

const windowsSsh = 'C:\\Windows\\System32\\OpenSSH\\ssh.exe';
const ssh = process.platform === 'win32' && existsSync(windowsSsh) ? windowsSsh : 'ssh';
const local = (...args) => spawn('docker', ['compose', 'exec', '-T', 'postgres', ...args]);

// A copy of what --clean is about to replace: the one way back from a pull into the
// wrong database.
const backup = join(tmpdir(), `db-pull-${target}-${Date.now()}.dump`);
await run(local('pg_dump', '-U', user, '-Fc', target), createWriteStream(backup));
console.log(`backup of local "${target}": ${backup}`);

const dump = spawn(ssh, [
  host,
  'cd /srv/infra && docker compose exec -T postgres pg_dump -U postgres -Fc jsc',
]);
// One transaction: a failed restore leaves the local database as it was.
const restore = local(
  'pg_restore',
  '-U',
  user,
  '-d',
  target,
  '--clean',
  '--if-exists',
  '--no-owner',
  '--no-acl',
  '--single-transaction',
);
dump.stdout.pipe(restore.stdin);
await Promise.all([run(dump), run(restore)]);
console.log(`"${target}" now holds the production database`);

/** Resolves when `child` exits with 0 and `out`, if given, has its stdout on disk. */
async function run(child, out) {
  if (out) child.stdout.pipe(out);
  child.stderr.pipe(process.stderr);
  await new Promise((resolve, reject) =>
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${child.spawnfile} exited with ${code}`)),
    ),
  );
  if (out) await finished(out);
}

function fail(message) {
  console.error(`db:pull: ${message}`);
  process.exit(1);
}
