/**
 * The visual run's "now": global setup dates the seed from it, `visual.spec.ts` fixes
 * the browser's clock at it, and the api's clock starts at it (`shifted-clock.mjs`), so
 * the dates and the timeouts on a screenshot never move.
 */
export const VISUAL_NOW = new Date('2026-03-02T10:00:00Z');

/** The visual run (`npm run test:visual`, CI's e2e job) sets `E2E_VISUAL=1`. */
export const visualRun = process.env.E2E_VISUAL === '1';
