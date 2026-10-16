// Preloaded into the e2e api by the visual run (playwright.config.ts): its clock starts
// at E2E_NOW and runs on from there, so the timeout rule sees the seed as global setup
// dated it. Limit: `Date()` without `new` throws under it; the api's code does not call that.
const offset = Date.parse(process.env.E2E_NOW) - Date.now();
const RealDate = Date;

globalThis.Date = class extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(RealDate.now() + offset);
    else super(...args);
  }

  static now() {
    return RealDate.now() + offset;
  }
};
