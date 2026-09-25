/**
 * The sentinel a *placeholder* `EstimatedVacancy` carries where an analysis would
 * be. A row the importer (or `ApplicationService.record`) has to create for an
 * application that was never analysed gets `estimationComment: 'N/A'` — and
 * `fullText: 'N/A'`, the same string for the same reason (ADR-0019).
 *
 * One constant, because three places have to agree on it: the two fields' writers,
 * the `hasAnalysis` derivation on the list item, and the importer's `--reset`
 * sweep, which deletes exactly the rows carrying it. As a literal it was three
 * places to update and no place to look it up.
 */
export const PLACEHOLDER_COMMENT = 'N/A';
