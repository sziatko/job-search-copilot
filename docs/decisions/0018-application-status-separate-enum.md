# 0018 — `ApplicationStatus` is a separate enum from `UserAction`

- Status: Accepted
- Phase: 2   ·   Date: 2026-09

## Context

Phase 1 has `UserAction` (`NOT_REVIEWED → READY_TO_APPLY → APPLIED / DECLINED`) —
triage on an analysed vacancy. Phase 2 needs to track where a *submitted*
application stands: applied, a recruiter reached out, replied, interviewing, offer,
rejected, ghosted. The obvious shortcut is to extend `UserAction` with the new
values.

## Decision

A distinct enum: `ApplicationStatus = APPLIED, RECRUITER_SCREEN, REPLIED,
INTERVIEW, OFFER, REJECTED`, living on `Application`.
`UserAction` is unchanged. The only link between the axes is the side-effect in
`ApplicationService.record` that sets the linked vacancy's `userAction = APPLIED`;
nothing is derived in either direction.

Ukrainian tracker vocabulary maps to it as: Подано→`APPLIED`,
Питання від рекрутера→`RECRUITER_SCREEN`, Відповів→`REPLIED`,
Запрошення на співбесіду / Співбесіда→`INTERVIEW`, Оффер→`OFFER`,
Відмова→`REJECTED`, Без відповіді / (empty)→`APPLIED`. Freeform values map to
the nearest, with the raw text preserved in `userComment`. "No answer" is not a
stored value — it ages into the derived Timeout view
([ADR-0022](0022-timeout-derived-until-scheduled.md)).

## Why this and not the alternatives

- **Extend `UserAction`.** Two problems. (1) Different altitude — `UserAction` is
  "have I decided about this analysis?", `ApplicationStatus` is "how far has this
  application gone?". (2) A name collision: `UserAction.DECLINED` means "I chose not
  to apply"; the tracker's "Відмова" means "the company rejected me". Merging makes
  "declined/rejected" ambiguous. Rejected.
- **Add an `OTHER` value for freeform statuses.** Dead-ends filtering and the stats
  strip. Rejected — freeform maps to the nearest real value instead.

## Consequences

- Two enums to maintain. Adding an `ApplicationStatus` value touches: the Prisma
  enum + a migration; `apps/mcp/src/applications/applications.schemas.ts`
  (`ApplicationStatusEnum`); the `@IsEnum(ApplicationStatus)` DTOs in `apps/api`;
  `apps/web/src/pages/applications/types.ts` (`applicationStatusSchema`) and
  `constants.ts` (`APPLICATION_STATUS_LABELS` / `_ORDER` / `_BADGE_STYLES`, each
  `satisfies Record<…>`); `packages/core/src/index.ts` (re-export); the importer's
  `STATUS_ALIASES`. There is no single source — same trade-off as
  [ADR-0012](0012-web-hand-written-contract.md).
- The two axes stay independently queryable — `/vacancies` filters `userAction`,
  `/tracker` filters `status`.

## What this constrains — breaks if you change it

- Deriving `status` from `userAction` (or vice versa) → the "independent axes"
  invariant is gone; `record()`'s explicit, single-field side-effect becomes an
  implicit coupling.
- Adding a value without updating every touch point above → a compile error in the
  web `satisfies Record<…>` maps (intended), or a runtime enum mismatch in the DTO
  / MCP zod schema (not caught until called).

## Related

[ADR-0017](0017-application-1to1-delta.md),
[`../domain-model.md`](../domain-model.md) (enum-change checklist).
