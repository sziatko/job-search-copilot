/**
 * Errors that represent a caller mistake (bad input, a rule violation) rather than
 * a bug or an infrastructure failure. Transports map these to a client error:
 * Nest via DomainExceptionFilter (422), the MCP server to an `isError` tool result.
 * Anything that is NOT a DomainError should surface as a 500 / thrown protocol error.
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The `recommendation` input isn't one of the enum's values — see recommendation.ts. */
export class InvalidRecommendationError extends DomainError {}

/** company/title blank, or a blank comment body. */
export class InvalidApplicationInputError extends DomainError {}

/** (company, title) matched more than one Vacancy — the caller must pick one. */
export class AmbiguousVacancyMatchError extends DomainError {}

/** That Vacancy is already in the pipeline — it has been applied to. */
export class AlreadyAppliedError extends DomainError {}

/** An intake entry without an http(s) url, a company or a title — what a vacancy needs. */
export class InvalidIntakeEntryError extends DomainError {}

/** A triage status the vacancy already has — a repeat carries no event (ADR-0029). */
export class SameStatusError extends DomainError {}

/** NEW asked for a vacancy that has an analysis: the queue holds only the unanalysed
 * (the `Vacancy_new_is_unanalysed` CHECK, ADR-0033). */
export class AnalysedNotNewError extends DomainError {}

/** The vacancy already has an analysis — it is written once (ADR-0033). */
export class AlreadyAnalysedError extends DomainError {}

/** No vacancy has this id. */
export class VacancyNotFoundError extends DomainError {}

/** An API key over its rate limit (`API_KEY_OPTIONS`, ADR-0039). */
export class RateLimitedError extends DomainError {}
