# 0022 — Timeout is derived on the client until a scheduled job owns it

- Status: Accepted
- Phase: 2   ·   Date: 2026-09 (updated in phase 3.1: the clock is `statusChangedAt` —
  [ADR-0029](0029-one-vacancy-table.md))

## Context

`/applications` needs to surface applications that have gone quiet. Two facts forced a
choice: `Vacancy.statusChangedAt` — the date of the last status move, the latest
`StatusChange` row — is always populated, and the stack has no scheduler — nothing runs on a clock in `apps/api` or `packages/core`.

The old `NO_RESPONSE` enum value was meant for this and was never used: 0 rows out
of 219. It required remembering to set it by hand, which is the kind of step that
does not survive contact with a real backlog.

## Decision

**Timeout is a derived, client-side view for now.**

- `REJECTED` and `OFFER` are *closed* — they are outcomes, not stalls.
- Of the rest, one whose `statusChangedAt` is older than `TIMEOUT_DAYS` (30) is a
  *timeout*; the remainder is *active*. The window floats: it counts from applying
  while `APPLIED`, and from the interview after `INTERVIEW`.
- Because the two categories partition every non-closed application,
  `total = active + timeout + rejected + offer` — the strip's numbers add up, so a
  broken rule is visible at a glance.
- The rule lives in exactly one place:
  `apps/web/src/pages/applications/constants.ts` (`TIMEOUT_DAYS`, `CLOSED_STATUSES`,
  `isTimedOut`, `isActive`, `matchesFilter`). The stats tile, the quick filters, and
  the ⏳ in `ApplicationsTable` all read it.
- `NO_RESPONSE` is dropped from the enum (migration `20260917181545`). The importer
  maps both `Без відповіді` and a blank status cell to `APPLIED` — those rows age
  into Timeout on their own.

**Stage 2 will replace this**: a daily, user-configurable sweep writes a real
`TIMEOUT` status. When it lands, add the value back and delete the client rule *in
the same change* — never both at once.

## Why this and not the alternatives

- **Keep `NO_RESPONSE`, let the user set it by hand.** It was unused across the
  entire log. The dates were already there; the manual step was the part nobody did.
- **Add a `TIMEOUT` enum value now, before anything writes it.** A stored status with
  no writer competes with the derived rule for the same fact: one row could be
  `status = TIMEOUT` while also "moved two days ago". That is two sources of truth
  for one fact. And the cost
  is asymmetric: *adding* an enum value is a one-line `ALTER TYPE … ADD VALUE`;
  *removing* one took a full type rebuild. Pay the cheap one later.
- **A server-side filter or endpoint now.** The client already loads the whole log
  (`?limit=500`); a DTO param plus a SQL predicate is strictly more code than
  `items.filter()`.

## Consequences

- The threshold is a client constant today. Stage 2 turns it into a user setting,
  and that is the moment it must also exist server-side.
- `apps/web` cannot import `core` ([ADR-0012](0012-web-hand-written-contract.md)), so
  a rule needed on both sides will be duplicated — the server copy canonical, the web
  copy a mirror. The status enum already works this way; the web file says so at the
  top.
- Every derived count is capped by the tracker's 500-row page limit, `Total`
  included. Pre-existing, not introduced here.

## What this constrains — breaks if you change it

- **Writing `status = TIMEOUT` while the client rule still exists** → the tile counts
  the row twice, or the two disagree about it. Add the value back and remove the rule
  together.
- **A scheduled sweep writing `TIMEOUT` through `writeStatus`** → that is a real move:
  it stamps `statusChangedAt` and journals the row. That is right for a stored
  `TIMEOUT` (it is the date the row timed out), but the client rule must be gone by
  then, or it reads the fresh stamp as "moved today".
- **Changing `TIMEOUT_DAYS` without it being the single source** → the strip's tile
  and the table's ⏳ share it on purpose; they must never diverge.
- **Making timeout depend on `updatedAt` instead of `statusChangedAt`** → `updatedAt`
  is Prisma's `@updatedAt` and moves on a salary / CV edit, so an edit would silently
  un-stale a row. A comment or an edit never moves `statusChangedAt`.

## Related

[ADR-0012](0012-web-hand-written-contract.md),
[ADR-0029](0029-one-vacancy-table.md),
[`../domain-model.md`](../domain-model.md) (Active/Timeout section).
