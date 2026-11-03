import { Prisma, type PrismaClient } from '@prisma/client';
import { VacancyNotFoundError } from '../domain/errors';

/**
 * The raw client as a service holds it: `$extends` only, so the one thing it can do is
 * become `forUser`'s scoped client — `this.db.vacancy` or `this.db.$transaction` does not
 * compile. A `PrismaClient` is one, so callers still pass theirs.
 */
export type Unscoped = Pick<PrismaClient, '$extends'>;

/** The models with a `userId` column and the operations `forUser` knows on each: a
 * `filtered` one gets the owner added to its `where`, every row of a `creates` one must
 * carry it. */
const OWNED = {
  Vacancy: {
    filtered: new Set([
      'findUnique',
      'findFirst',
      'findMany',
      'count',
      'groupBy',
      'update',
      'updateMany',
      'updateManyAndReturn',
      'deleteMany',
    ]),
    creates: new Set(['create']),
  },
  Tag: {
    filtered: new Set(['findMany', 'update', 'deleteMany']),
    creates: new Set(['create', 'createMany']),
  },
  VacancyTag: {
    filtered: new Set(['count', 'deleteMany']),
    creates: new Set(['createMany']),
  },
};

type Row = Record<string, unknown>;

type Args = {
  where?: object;
  cursor?: object;
  data?: Row | Row[];
};

function unknownOperation(model: string, operation: string): Error {
  return new Error(`forUser does not scope ${model}.${operation}: add it to forUser first`);
}

/**
 * The one way core reaches `Vacancy`, `StatusChange`, `Comment`, `Tag` and `VacancyTag`
 * (ADR-0038, invariant 11): a client that only sees `userId`'s rows. A query on a model
 * with an owner column (`OWNED`) gets `userId` added to its `where` (and its `cursor`), so
 * another user's row reads as missing — null, a zero count, P2025 on an update. A create
 * must carry this `userId`, every row of it; its `data` nests only a `create`.
 * `StatusChange` and `Comment` have no owner column: a read is scoped through its vacancy,
 * a create connects to a vacancy of this user's (P2025 otherwise). Any other operation,
 * and any other model, throws — a new one is added here, scoped, before a service uses
 * it. The extension stays on inside `$transaction(async (tx) => …)`: `tx` is scoped too.
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
            case 'Tag':
            case 'VacancyTag':
              return query(scopeOwned(model, operation, a, userId) as typeof args);
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

function scopeOwned(model: keyof typeof OWNED, operation: string, a: Args, userId: string): Args {
  const rows = [a.data ?? {}].flat();
  if (OWNED[model].creates.has(operation)) {
    if (rows.some((row) => row.userId !== userId)) {
      throw new Error(`forUser: a ${model} ${operation} must carry the scoped userId`);
    }
  } else if (OWNED[model].filtered.has(operation)) {
    a.where = { ...a.where, userId };
    if (a.cursor) a.cursor = { ...a.cursor, userId };
    if (rows.some((row) => 'userId' in row || 'user' in row)) {
      throw new Error(`forUser: a ${model} update cannot change its owner`);
    }
  } else {
    throw unknownOperation(model, operation);
  }
  // A nested `create` adds a row to this one, so it is this user's; a `connect`,
  // `update`, `set`… could reach another user's row.
  for (const row of rows) {
    for (const [field, value] of Object.entries(row)) {
      const nested = value !== null && typeof value === 'object' && !(value instanceof Date);
      if (nested && Object.keys(value).some((key) => key !== 'create')) {
        throw new Error(`forUser: a ${model} ${operation} nests only a create (${field})`);
      }
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
    const { vacancyId, ...data } = (a.data ?? {}) as Row;
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

/** Prisma's error `code` (P2002 a unique, P2025 no row): what a service maps to a
 * DomainError. */
export function isPrismaError(err: unknown, code: string): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;
}

/** An update through `forUser` on a missing id, or another user's, fails with P2025: that
 * is "not found" — a command's `VacancyNotFoundError` (a query answers null instead). Let
 * the UPDATE fail rather than check first. */
export async function orNotFound<T>(update: Promise<T>, id: number): Promise<T> {
  try {
    return await update;
  } catch (err) {
    if (isPrismaError(err, 'P2025')) {
      throw new VacancyNotFoundError(`Vacancy ${id} not found`);
    }
    throw err;
  }
}
