import { setupServer } from 'msw/node';

// No default handlers — each test registers exactly the ones it needs via
// `mswServer.use(...buildHandlers(items))`, so a test's data is never a
// coincidence of some shared fixture.
export const mswServer = setupServer();
