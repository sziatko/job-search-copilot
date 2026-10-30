import { useRouter } from '@tanstack/react-router';
import { IconChevronLeft } from '@/components/icons';

/** Back to wherever the visit came from; a page opened directly goes to /vacancies. */
export function BackLink() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="mb-4 inline-flex cursor-pointer items-center gap-2 text-small font-semibold text-ink-muted no-underline hover:text-accent-ink"
      onClick={() =>
        router.history.canGoBack()
          ? router.history.back()
          : void router.navigate({ to: '/vacancies' })
      }
    >
      <IconChevronLeft className="size-3.5" />
      Back
    </button>
  );
}
