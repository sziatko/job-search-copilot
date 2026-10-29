import { z } from 'zod';

// Zod 4 probes `new Function` when a z.object is created, to pick a faster parser; the
// site's CSP has no 'unsafe-eval', so each probe is a console violation. Jitless skips
// the probe. A side-effect module, imported first in main.tsx: the schemas are built at
// module load, before main.tsx's own code runs.
z.config({ jitless: true });
