# 0043 — One merge gate: CI by what a change is, a review as a status on the SHA

- Status: Accepted · Date: 2026-11

## Context
A change to the docs, to the tests and to the code need different things before a merge, and the
gate has to hold on every pull request, whatever its branch is called. The heavy tests take many
times longer on the laptop than in CI, so running them in both pays twice. Reviews cost tokens and
CI does not, so a review of code that fails its tests is wasted. And a review counts only if it is
tied to the code that merges: a note kept anywhere else says nothing about the commit after it.

## Decision
**Three kinds.** `scripts/change-kind.mjs` classifies a change by its paths; the lists live there.
A path on neither list is code, and so is an empty diff: a mistake costs a CI run, never skips one.

| Kind | What it holds | CI | Images on a PR | Reviews | Deploy |
| --- | --- | --- | --- | --- | --- |
| `docs` | Markdown, `docs/`, the `.claude` pointer | none | none | none | none |
| `tests` | The e2e folder, the api's tests, spec and test files | full | none | none | none |
| `code` | Everything else | full | built | all three | yes |

A Dependabot PR gets its kind's CI and no reviews.

**`gate` is the required CI check** (`ci.yml`). `changes` finds the kind; `verify.yml` and `e2e.yml`
skip on `docs`; `gate` always runs and reads what happened through `gateResult`.

**`review` is the second required check**, a commit status on the SHA. New code has a new SHA, so
CI posts `pending` and the merge waits. The order is CI first, then `/ponytail-review`, the
`code-reviewer` agent and `/security-review`, all local, with fixes as commits. Then `npm run
review:attest` posts the success. It refuses a dirty tree, a HEAD that is not the PR's pushed head,
a `gate` not green, and a migration in the diff without `--migration-checked`: it first runs on a
fresh pull ([`deployment.md`](../deployment.md#pull-the-production-database)). With only tests or
docs since the newest reviewed commit, CI carries the status over; after a code fix the reviews
read `git diff <reviewed sha>..HEAD`, not the whole PR. The rule itself is `decide` in
`scripts/review-status.mjs`.

**Where the tests run.** The full `npm test` runs locally on every step and again in `verify`. The
full e2e and visual sets run only in CI ([ADR-0037](0037-e2e-playwright.md)).

**`main`.** The ruleset requires `gate` and `review`, allows only a squash, and has no bypass actors.
A code merge builds the images, passes `verify` on `main`'s own commit, and deploys unless newer
code is on `main`, whose run deploys it too. Any other merge does none of it. A push to a `phase-*` branch always builds, so a
phase can be deployed by hand ([ADR-0041](0041-one-origin-images-from-ghcr.md)).

## Why this and not the alternatives
- **A `paths` filter on the workflow** — a required workflow that a filter skips stays pending
  forever, and the PR can never merge.
- **`verify` and `e2e` as the required checks** — they skip on a docs PR, and GitHub counts a
  skipped job as a success, so a failed `changes` would turn everything green.
- **Reviews in CI** — a Claude secret in CI on a public repo; the action's docs say prompt
  injection is reduced, not eliminated.
- **A review mark in a local file, or a hook on `gh pr create`** — nothing ties it to the code that
  merges, and it holds only where the hook runs.
- **The PR's own run as `main`'s check before a deploy** — it ran on a merge ref, and `main` can
  have moved since.

## Consequences
- A docs PR merges at once: no build, no deploy, no restart.
- A tests PR, new visual baselines included, needs CI but no review, and keeps a review already
  on the PR.
- `review` protects against forgetting, not against a deliberate bypass. A required status with no
  integration is satisfied by anyone who can set it, a job named `review` in a PR's own workflow
  included, and `review-status` runs the PR's copy of its script with write access. Past that:
  reviews in CI.
- A fork PR has a read-only token, so its status is never posted, even for docs: the owner runs
  `review:attest` on it. The same goes for a Dependabot run if its token cannot post `statuses`.
- `actor` is `github.actor`, so a human commit on a bot's PR asks for a review: the safe side.
- A force-push takes the reviewed commit off the PR's list, so the review is asked for again.
- Retargeting a PR runs nothing, so `gate` and `review` stay from the old base, until a new commit.
  Past that: `edited` in `ci.yml`'s trigger types, at a full run per title edit.
- If a newer code merge fails `verify`, neither it nor the older one deploys, and production stays
  behind with `main` red. Past that: `deploy.sh` by hand.
- A docs or tests commit on `main` has no images: a deploy by hand needs a code commit's SHA.

## What this constrains — breaks if you change it
- `gate` renamed or moved → the ruleset's required context never reports, and every PR is locked
  out. The ruleset ties `gate` to GitHub Actions and `review` to no integration, since both CI and a
  user's token set it.
- `if: always()` off `gate`, or `gateResult` no longer checking `changes` → a failed `changes`
  skips the jobs after it, and they read as green.
- A `paths` filter on `ci.yml`'s trigger → the required `gate` stays pending forever.
- `review-status` needing `verify` or `e2e` → it skips with them on a docs PR, which then waits for
  `review` forever.
- `changedPaths` without `--no-renames` → a rename from `.ts` to `.md` reads as docs. A pattern added
  to `DOCS` or `TESTS` takes that path out of the reviews and the deploy.
- `change-kind.mjs` importing an npm package → `changes` runs before `npm ci`, and every PR fails.
- `github.sha` in place of `pull_request.head.sha` when posting → the status lands on the merge ref
  and the commit that merges has none.
- `decide`'s `keep` removed → CI landing after `attest`, or a re-run, takes the review back. Widened to
  any success → a `not needed` from one base passes the same SHA on another.
- The `reviewed` prefix of the status's description is how `newestReviewed` finds a review:
  `inherited` and `not needed` must not start with it, or they count as one.
- `deploy` without `verify` in its `needs`, or without its check of what is newer on `main` → a failing `main`
  deploys, or an older merge deploys over a newer one.

## Related
[ADR-0016](0016-docker-dev-stack-and-ci.md), [ADR-0037](0037-e2e-playwright.md),
[ADR-0041](0041-one-origin-images-from-ghcr.md); `scripts/change-kind.mjs`,
`scripts/review-status.mjs`, `.github/workflows/ci.yml`, `.github/workflows/images.yml`.
