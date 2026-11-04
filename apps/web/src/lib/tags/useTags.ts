import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys, staleAfter } from '@/lib/queryKeys';
import { createTag, deleteTag, listTags, updateTag } from './api';

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

/** After a rename, a new tone or a delete, the chips of every list are out of date. */
function useRefetchTagged() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(staleAfter.tagWrite.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

/** Settled for the same reason as `useCreateTag`. Its error is the dialog's to show. */
export function useUpdateTag() {
  const onSettled = useRefetchTagged();
  return useMutation({ mutationFn: updateTag, onSettled });
}

/** The confirmation has closed by the time this fails, so a toast says it. */
export function useDeleteTag() {
  const onSettled = useRefetchTagged();
  return useMutation({
    mutationFn: deleteTag,
    onSettled,
    onError: (error: Error) => toast.error(error.message),
  });
}
