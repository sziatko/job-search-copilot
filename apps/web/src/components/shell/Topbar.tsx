import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { IconMenu } from '@/components/icons';
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
  return (
    <button type="button" className="btn" onClick={signOut}>
      Sign out
    </button>
  );
}

/**
 * `title` is an <h1> rather than the mockup's <div> — same rendering (preflight
 * inherits font-size/weight, and `.topbar-title` sets both), but keeps a real
 * page heading for screen readers and for the router test.
 */
export function Topbar({ title, onOpenMobile }: { title: string; onOpenMobile: () => void }) {
  return (
    <header className="topbar">
      <div className="flex items-center gap-[12px]">
        <button
          type="button"
          className="menu-toggle"
          onClick={onOpenMobile}
          aria-label="Open navigation"
        >
          <IconMenu />
        </button>
        <h1 className="topbar-title">{title}</h1>
      </div>
      <div className="flex items-center gap-[14px]">
        <ThemeToggle />
        <SignOutButton />
      </div>
    </header>
  );
}
