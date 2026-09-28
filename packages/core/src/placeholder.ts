/**
 * The `fullText` a *placeholder* `Vacancy` carries where an analysis would be: a row
 * `ApplicationService.record` has to create for an application that was never
 * analysed (ADR-0019). Such a row has no `ANALYZER` comment unless the caller passed
 * one.
 */
export const PLACEHOLDER_COMMENT = 'N/A';
