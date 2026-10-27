/** True on the Vite dev server — the local copy, not production. A function, read on each
 * call, so a test can stub `MODE`. e2e runs `--mode e2e`: its screenshots stay prod's. */
export const isDevServer = () => import.meta.env.MODE === 'development';
