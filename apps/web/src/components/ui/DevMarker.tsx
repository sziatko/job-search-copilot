import { isDevServer } from '@/lib/dev-server';

/** On the dev server only: a red line across the top and a "DEV" tab under it, so the
 * local copy can't pass for production. Fixed and click-through: no page moves for it. */
export function DevMarker() {
  if (!isDevServer()) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center border-t-3 border-bad">
      <span className="rounded-b-md bg-bad px-2 font-mono text-caption font-bold text-bg">
        DEV · local copy
      </span>
    </div>
  );
}
