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

/** The `recommendation` input isn't one of the accepted spellings — see recommendation.ts. */
export class InvalidRecommendationError extends DomainError {}

/** company/title blank, or an explicit estimatedVacancyId that doesn't exist. */
export class InvalidApplicationInputError extends DomainError {}

/** (company, title) matched more than one EstimatedVacancy — the caller must pick one. */
export class AmbiguousVacancyMatchError extends DomainError {}

/** That EstimatedVacancy already has an Application (strict 1:1 — see ADR-0017). */
export class ApplicationAlreadyExistsError extends DomainError {}

/** A vacancy-log check without an http(s) url — the log's key. */
export class InvalidVacancyLogEntryError extends DomainError {}
