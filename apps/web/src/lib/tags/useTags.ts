import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { createTag, listTags } from './api';

/** Every tag of the user. */
export function useTags() {
  return useQuery({ queryKey: queryKeys.tags(), queryFn: listTags });
}

/** Settled, not only on success: a 409 means the list here is behind the server. */
export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTag,
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.tags() }),
  });
}
