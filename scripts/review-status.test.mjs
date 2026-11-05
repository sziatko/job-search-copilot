import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attestRefusal, decide } from './review-status.mjs';

const sha = 'abc1234def5678abc1234def5678abc1234def56';
const code = { kind: 'code', actor: 'someone' };

test('decide: a head that is already a success is kept, even after a new CI run', () => {
  assert.equal(decide({ ...code, headStatus: 'success' }).state, 'keep');
  assert.equal(
    decide({ ...code, headStatus: 'success', reviewedSha: sha, kindSince: 'code' }).state,
    'keep',
  );
});

test('decide: docs and tests need no review', () => {
  for (const kind of ['docs', 'tests']) {
    assert.deepEqual(decide({ kind, actor: 'someone' }), {
      state: 'success',
      description: 'not needed',
    });
  }
});

test('decide: a bot needs no review, a human on the same PR does', () => {
  assert.deepEqual(decide({ kind: 'code', actor: 'dependabot[bot]' }), {
    state: 'success',
    description: 'not needed',
  });
  assert.equal(decide(code).state, 'pending');
});

test('decide: code with no review asks for one', () => {
  assert.deepEqual(decide(code), { state: 'pending', description: 'needs review' });
  assert.deepEqual(decide({ ...code, headStatus: 'pending' }), {
    state: 'pending',
    description: 'needs review',
  });
});

test('decide: only tests or docs since the review carry it over', () => {
  for (const kindSince of ['docs', 'tests']) {
    assert.deepEqual(decide({ ...code, reviewedSha: sha, kindSince }), {
      state: 'success',
      description: 'inherited from abc1234',
    });
  }
});

test('decide: new code since the review drops it', () => {
  assert.deepEqual(decide({ ...code, reviewedSha: sha, kindSince: 'code' }), {
    state: 'pending',
    description: 'needs review since abc1234',
  });
});

test('decide: a kind nobody expected asks for a review', () => {
  assert.equal(decide({ kind: '', actor: 'someone' }).state, 'pending');
  assert.equal(decide({ ...code, reviewedSha: sha, kindSince: '' }).state, 'pending');
});

const ready = {
  dirty: false,
  head: sha,
  prHead: sha,
  gateConclusions: ['success'],
  paths: ['apps/api/src/main.ts'],
  migrationChecked: false,
};

test('attestRefusal: nothing to refuse on a clean, pushed, green HEAD', () => {
  assert.equal(attestRefusal(ready), null);
});

test('attestRefusal: a dirty tree, an unpushed HEAD or a gate that is not green', () => {
  assert.match(attestRefusal({ ...ready, dirty: true }), /not clean/);
  assert.match(attestRefusal({ ...ready, prHead: 'f'.repeat(40) }), /pushed head/);
  assert.match(attestRefusal({ ...ready, gateConclusions: [] }), /no run yet/);
  assert.match(attestRefusal({ ...ready, gateConclusions: ['failure'] }), /not green/);
  assert.match(attestRefusal({ ...ready, gateConclusions: ['success', 'failure'] }), /not green/);
});

test('attestRefusal: a migration needs the flag', () => {
  const migration = { ...ready, paths: ['packages/core/prisma/migrations/1_a/migration.sql'] };
  assert.match(attestRefusal(migration), /--migration-checked/);
  assert.equal(attestRefusal({ ...migration, migrationChecked: true }), null);
});
