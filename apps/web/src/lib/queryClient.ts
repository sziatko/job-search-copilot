import { QueryClient } from '@tanstack/react-query';

// One client for the app. Defaults kept conservative: a little staleness to avoid
// refetch storms, and a single retry so a transient blip self-heals without making
// a real outage take ~30s of backoff to surface.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});
