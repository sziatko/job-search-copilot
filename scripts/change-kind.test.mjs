import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { changeKind, gateResult } from './change-kind.mjs';

const script = path.join(import.meta.dirname, 'change-kind.mjs');
const cli = (args, { cwd, env } = {}) =>
  spawnSync('node', [script, ...args], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });

test('changeKind: only docs paths are docs', () => {
  for (const paths of [
    ['README.md'],
    ['docs/decisions/0001-a.md', 'docs/diagram.png'],
    ['apps/web/src/components/ui/README.md'],
    ['.claude'],
    ['.claude', 'docs/backlog.md'],
  ]) {
    assert.equal(changeKind(paths), 'docs', paths.join(' '));
  }
});

test('changeKind: test paths, with or without docs, are tests', () => {
  for (const paths of [
    ['e2e/vacancies.spec.ts'],
    ['e2e/Dockerfile'],
    ['apps/api/test/auth.helper.ts'],
    ['packages/core/src/vacancy.spec.ts'],
    ['apps/web/src/lib/api.test.ts'],
    ['apps/web/src/pages/inbox.test.tsx'],
    ['scripts/change-kind.test.mjs'],
    ['e2e/vacancies.spec.ts', 'docs/development.md', '.claude'],
  ]) {
    assert.equal(changeKind(paths), 'tests', paths.join(' '));
  }
});

test('changeKind: anything else is code, whatever comes with it', () => {
  for (const paths of [
    ['apps/api/src/main.ts'],
    ['.github/workflows/ci.yml'],
    ['.github/dependabot.yml'],
    ['.gitmodules'],
    ['package-lock.json'],
    ['packages/core/prisma/migrations/1_a/migration.sql'],
    ['docs/backlog.md', 'apps/api/src/main.ts'],
    ['e2e/vacancies.spec.ts', 'apps/web/src/main.tsx'],
    // Look like the others until the last characters.
    ['README.md.ts'],
    ['apps/web/src/a.spec.tsx'],
    ['apps/web/src/a.test.ts.snap'],
    ['documents/a.ts'],
    ['.claude-config'],
  ]) {
    assert.equal(changeKind(paths), 'code', paths.join(' '));
  }
});

test('changeKind: an empty list is code', () => {
  assert.equal(changeKind([]), 'code');
});

const job = (result, outputs = {}) => ({ result, outputs });

test('gateResult: a failed changes is red, whatever the other jobs say', () => {
  for (const result of ['failure', 'cancelled', 'skipped']) {
    for (const others of ['skipped', 'success']) {
      assert.equal(
        gateResult({ changes: job(result), verify: job(others), e2e: job(others) }),
        false,
        `${result} ${others}`,
      );
    }
  }
});

test('gateResult: docs needs nothing else', () => {
  assert.equal(
    gateResult({
      changes: job('success', { kind: 'docs' }),
      verify: job('skipped'),
      e2e: job('skipped'),
    }),
    true,
  );
});

test('gateResult: tests and code need both jobs to have succeeded', () => {
  for (const kind of ['tests', 'code']) {
    const changes = job('success', { kind });
    const gate = (verify, e2e) => gateResult({ changes, verify: job(verify), e2e: job(e2e) });
    assert.equal(gate('success', 'success'), true, kind);
    assert.equal(gate('failure', 'success'), false, kind);
    assert.equal(gate('success', 'failure'), false, kind);
    assert.equal(gate('cancelled', 'success'), false, kind);
    assert.equal(gate('skipped', 'skipped'), false, kind);
  }
});

test('gateResult: a kind that never arrived needs both jobs', () => {
  assert.equal(
    gateResult({ changes: job('success'), verify: job('skipped'), e2e: job('skipped') }),
    false,
  );
});

test('gate on the command line: the exit code is the result', () => {
  const needs = (changes, kind) =>
    JSON.stringify({
      changes: job(changes, { kind }),
      verify: job('skipped'),
      e2e: job('skipped'),
    });
  assert.equal(cli(['gate'], { env: { NEEDS: needs('success', 'docs') } }).status, 0);
  assert.equal(cli(['gate'], { env: { NEEDS: needs('failure', 'docs') } }).status, 1);
  assert.equal(cli(['gate'], { env: { NEEDS: needs('success', 'code') } }).status, 1);
  assert.notEqual(cli(['gate'], { env: { NEEDS: '' } }).status, 0);
  assert.notEqual(cli(['nonsense']).status, 0);
});

function repo() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'change-kind-'));
  after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'a@example.com');
  git('config', 'user.name', 'A');
  const commit = () => {
    git('add', '.');
    git('commit', '-qm', 'a');
    return git('rev-parse', 'HEAD');
  };
  const write = (name, text = 'export const a = 1;\n') => writeFileSync(path.join(dir, name), text);
  write('a.ts');
  const base = commit();
  const kind = (head, from = base) => cli(['kind', from, head], { cwd: dir });
  return { git, commit, write, base, kind };
}

test('kind: a rename from .ts to .md is code', () => {
  const { git, commit, kind } = repo();
  git('mv', 'a.ts', 'a.md');
  assert.equal(kind(commit()).stdout.trim(), 'code');
});

test('kind: a deleted file counts', () => {
  const { git, commit, kind } = repo();
  git('rm', '-q', 'a.ts');
  assert.equal(kind(commit()).stdout.trim(), 'code');
});

test('kind: reads the branch, not what its base did since', () => {
  const { git, commit, write, kind } = repo();
  git('switch', '-qc', 'feature');
  write('a.md', 'text\n');
  const head = commit();
  git('switch', '-q', 'main');
  write('b.ts');
  assert.equal(kind(head, commit()).stdout.trim(), 'docs');
});

test('kind: a submodule pointer is listed under its path', () => {
  const { git, base, kind } = repo();
  git('update-index', '--add', '--cacheinfo', `160000,${base},.claude`);
  git('commit', '-qm', 'pointer');
  assert.equal(kind(git('rev-parse', 'HEAD')).stdout.trim(), 'docs');
});

test('kind: a path git would quote is still read', () => {
  const { commit, write, kind } = repo();
  write('нотатки.md', 'text\n');
  assert.equal(kind(commit()).stdout.trim(), 'docs');
});

test('kind: an all-zero base is code, without asking git', () => {
  assert.equal(cli(['kind', '0'.repeat(40), 'deadbeef']).stdout.trim(), 'code');
});

test('kind: fails loudly on a missing side or an unknown commit', () => {
  const { kind, base } = repo();
  assert.notEqual(cli(['kind', '', base]).status, 0);
  assert.notEqual(cli(['kind', base]).status, 0);
  assert.notEqual(kind('f'.repeat(40)).status, 0);
});
