import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { IconMenu } from '@/components/icons';
import { Button } from '@/components/ui/Button';
import { authClient } from '@/lib/auth';
import { ThemeToggle } from './ThemeToggle';

/** Ends the session on the API (the cookie goes with it), drops the cached data, and
 * leaves for /login. */
function SignOutButton() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  async function signOut() {
    const { error } = await authClient.signOut();
    if (error) {
      toast.error(error.message ?? 'Sign-out failed');
      return;
    }
    queryClient.clear();
    await navigate({ to: '/login' });
  }
  return <Button onClick={signOut}>Sign out</Button>;
}

/**
 * `title` is an <h1> rather than the mockup's <div> — same rendering (preflight
 * inherits font-size/weight, and its classes set both), but keeps a real
 * page heading for screen readers and for the router test.
 */
export function Topbar({ title, onOpenMobile }: { title: string; onOpenMobile: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-border bg-bg/88 px-7 py-4 backdrop-blur-sm transition-[padding] narrow:px-4 narrow:py-4 compact:py-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="hidden size-8.5 flex-none cursor-pointer items-center justify-center rounded-md border border-border bg-surface text-ink-soft narrow:inline-flex"
          onClick={onOpenMobile}
          aria-label="Open navigation"
        >
          <IconMenu />
        </button>
        {/* The title role (15px) on a phone keeps "Application tracker" on one line at 390px. */}
        <h1 className="text-page transition-[font-size] narrow:text-title compact:text-title">
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-4">
        <ThemeToggle />
        <SignOutButton />
      </div>
    </header>
  );
}
