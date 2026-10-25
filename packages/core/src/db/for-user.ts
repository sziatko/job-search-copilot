import { Prisma, type PrismaClient } from '@prisma/client';
import { VacancyNotFoundError } from '../domain/errors';

/**
 * The raw client as a service holds it: `$extends` only, so the one thing it can do is
 * become `forUser`'s scoped client — `this.db.vacancy` or `this.db.$transaction` does not
 * compile. A `PrismaClient` is one, so callers still pass theirs.
 */
export type Unscoped = Pick<PrismaClient, '$extends'>;

/** The `Vacancy` operations `forUser` knows: each gets the owner added to its `where`. */
const VACANCY_FILTERED = new Set([
  'findUnique',
  'findFirst',
  'findMany',
  'count',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'deleteMany',
]);

type Args = {
  where?: object;
  cursor?: object;
  data?: Record<string, unknown>;
};

function unknownOperation(model: string, operation: string): Error {
  return new Error(`forUser does not scope ${model}.${operation}: add it to forUser first`);
}

/**
 * The one way core reaches `Vacancy`, `StatusChange` and `Comment` (ADR-0038,
 * invariant 11): a client that only sees `userId`'s rows. A `Vacancy` query gets
 * `userId` added to its `where` (and its `cursor`), so another user's row reads as
 * missing — null, a zero count, P2025 on an update. A `Vacancy` create must carry this
 * `userId`; its `data` nests only a `create`. `StatusChange` and `Comment` have no owner
 * column: a read is scoped through its vacancy, a create connects to a vacancy of this
 * user's (P2025 otherwise). Any other operation, and any other model, throws — a new one
 * is added here, scoped, before a service uses it. The extension stays on inside
 * `$transaction(async (tx) => …)`: `tx` is scoped too.
 *
 * Raw SQL (`$queryRaw`, `$executeRaw`) is not scoped: it filters by `userId` itself.
 */
export function forUser(db: Unscoped, userId: string) {
  if (!userId) throw new Error('forUser needs a userId');
  return db.$extends({
    name: 'forUser',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          const a = (args ?? {}) as Args;
          switch (model) {
            case 'Vacancy':
              return query(scopeVacancy(operation, a, userId) as typeof args);
            case 'StatusChange':
            case 'Comment':
              return query(scopeChild(model, operation, a, userId) as typeof args);
            default:
              throw unknownOperation(model, operation);
          }
        },
      },
    },
  });
}

function scopeVacancy(operation: string, a: Args, userId: string): Args {
  if (operation === 'create') {
    if (a.data?.userId !== userId) {
      throw new Error('forUser: a Vacancy create must carry the scoped userId');
    }
  } else if (VACANCY_FILTERED.has(operation)) {
    a.where = { ...a.where, userId };
    if (a.cursor) a.cursor = { ...a.cursor, userId };
    if (a.data && ('userId' in a.data || 'user' in a.data)) {
      throw new Error('forUser: a Vacancy update cannot change its owner');
    }
  } else {
    throw unknownOperation('Vacancy', operation);
  }
  // A nested `create` adds a row to this vacancy, so it is this user's; a `connect`,
  // `update`, `set`… could reach another user's row.
  for (const [field, value] of Object.entries(a.data ?? {})) {
    const nested = value !== null && typeof value === 'object' && !(value instanceof Date);
    if (nested && Object.keys(value).some((key) => key !== 'create')) {
      throw new Error(`forUser: a Vacancy ${operation} nests only a create (${field})`);
    }
  }
  return a;
}

/** `StatusChange` / `Comment`: through the vacancy they belong to. */
function scopeChild(model: string, operation: string, a: Args, userId: string): Args {
  if (operation === 'findMany') {
    return { ...a, where: { AND: [a.where ?? {}, { vacancy: { userId } }] } };
  }
  if (operation === 'create') {
    const { vacancyId, ...data } = a.data ?? {};
    if (typeof vacancyId !== 'number') {
      throw new Error(`forUser: a ${model} create must carry vacancyId`);
    }
    return { ...a, data: { ...data, vacancy: { connect: { id: vacancyId, userId } } } as never };
  }
  throw unknownOperation(model, operation);
}

/** A client scoped by `forUser`. */
export type UserDb = ReturnType<typeof forUser>;

/** The `tx` of a `UserDb`'s interactive transaction — scoped too. */
export type UserTx = Parameters<Parameters<UserDb['$transaction']>[0]>[0];

/** An update through `forUser` on a missing id, or another user's, fails with P2025: that
 * is "not found" — a command's `VacancyNotFoundError` (a query answers null instead). Let
 * the UPDATE fail rather than check first. */
export async function orNotFound<T>(update: Promise<T>, id: number): Promise<T> {
  try {
    return await update;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      throw new VacancyNotFoundError(`Vacancy ${id} not found`);
    }
    throw err;
  }
}
