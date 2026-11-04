import { type FormEvent, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { DialogActions, DialogTitle } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Label } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { type TagRef, type TagTone, tagKey } from '@/lib/tags/types';
import { useCreateTag, useTags } from '@/lib/tags/useTags';
import { TagToneField } from './TagToneField';
import { CHIP_TONE } from './VacancyTags';

/**
 * Picks a tag for a vacancy, or creates one with a tone. The caller owns the write, a row's
 * optimistic one or the vacancy page's, and mounts this at page level: inside a virtual row
 * it would disappear on scroll. `assigned` are the vacancy's tags, which it does not offer.
 */
export function AddTagModal({
  assigned,
  onAdd,
  onClose,
}: {
  assigned: readonly TagRef[];
  onAdd: (tag: TagRef) => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const nameId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [tone, setTone] = useState<TagTone>('GREY');
  const tags = useTags();
  const create = useCreateTag();

  const key = tagKey(text);
  const isAssigned = (tag: TagRef) => assigned.some(({ id }) => id === tag.id);
  const exact = tags.data?.find((tag) => tagKey(tag.name) === key);
  const matches = tags.data?.filter((tag) => !isAssigned(tag) && tagKey(tag.name).includes(key));
  // Only once the list has answered, or a taken name would be offered as new.
  const canCreate = tags.isSuccess && key !== '' && !exact;

  function pick(tag: TagRef) {
    onAdd(tag);
    onClose();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (create.isPending) return;
    if (canCreate) create.mutate({ name: text, tone }, { onSuccess: pick });
    else if (exact && !isAssigned(exact)) pick(exact);
  }

  return (
    <Modal
      onClose={onClose}
      labelledBy={titleId}
      maxWidthClassName="max-w-md"
      initialFocus={nameRef}
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle id={titleId}>Add a tag</DialogTitle>

        <div className="mt-4">
          <Label htmlFor={nameId}>Tag name</Label>
          <Input
            ref={nameRef}
            id={nameId}
            type="text"
            autoComplete="off"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              create.reset();
            }}
            placeholder="Find a tag or name a new one"
          />
        </div>

        {tags.isPending ? (
          <EmptyState>Loading tags…</EmptyState>
        ) : tags.error ? (
          <EmptyState>Failed to load tags: {tags.error.message}</EmptyState>
        ) : matches?.length ? (
          <ul aria-label="Matching tags" className="mt-4 flex flex-wrap gap-2">
            {matches.map((tag) => (
              <li key={tag.id} className="max-w-full">
                <Button variant="ghost" disabled={create.isPending} onClick={() => pick(tag)}>
                  <Chip color={CHIP_TONE[tag.tone]}>{tag.name}</Chip>
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>
            {key === ''
              ? 'No tags to add yet. Type a name to create one.'
              : exact
                ? `“${exact.name}” is already on this vacancy.`
                : 'No tag has this name yet.'}
          </EmptyState>
        )}

        {canCreate && <TagToneField value={tone} onChange={setTone} />}

        {create.error && (
          <p role="alert" className="mt-2 text-small text-bad-ink">
            {create.error.message}
          </p>
        )}

        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          {canCreate && (
            <Button type="submit" variant="primary" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : `Create “${text.trim()}”`}
            </Button>
          )}
        </DialogActions>
      </form>
    </Modal>
  );
}
