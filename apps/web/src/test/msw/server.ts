import { setupServer } from 'msw/node';
import { sessionHandler } from './handlers';

// One default handler: a signed-in session, which every page behind the shell's guard
// needs (`resetHandlers()` keeps it). The rest each test registers itself via
// `mswServer.use(...buildHandlers(items))`, so a test's data is never a coincidence of
// some shared fixture.
export const mswServer = setupServer(sessionHandler());
