import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardHead, CardTitle } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { DialogActions, DialogTitle } from '@/components/ui/Dialog';
import { Input, Label } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/vacancies/ConfirmDialog';
import { TagToneField } from '@/components/vacancies/TagToneField';
import { CHIP_TONE } from '@/components/vacancies/VacancyTags';
import { type TagRef, tagKey } from '@/lib/tags/types';
import { useDeleteTag, useTags, useUpdateTag } from '@/lib/tags/useTags';

const vacancies = (count: number) => `${count} ${count === 1 ? 'vacancy' : 'vacancies'}`;

/** Renames a tag and picks its tone. A taken name's 409 stays here, for another try. */
function EditTagDialog({ tag, onClose }: { tag: TagRef; onClose: () => void }) {
  const titleId = useId();
  const nameId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(tag.name);
  const [tone, setTone] = useState(tag.tone);
  const update = useUpdateTag();

  return (
    <Modal
      onClose={onClose}
      labelledBy={titleId}
      maxWidthClassName="max-w-md"
      initialFocus={nameRef}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate({ id: tag.id, name, tone }, { onSuccess: onClose });
        }}
      >
        <DialogTitle id={titleId}>Edit the tag</DialogTitle>
        <div className="mt-4">
          <Label htmlFor={nameId}>Tag name</Label>
          <Input
            ref={nameRef}
            id={nameId}
            type="text"
            autoComplete="off"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              update.reset();
            }}
          />
        </div>
        <TagToneField value={tone} onChange={setTone} />
        {update.error && (
          <p role="alert" className="mt-2 text-small text-bad-ink">
            {update.error.message}
          </p>
        )}
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            variant="primary"
            disabled={update.isPending || tagKey(name) === ''}
          >
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </form>
    </Modal>
  );
}

/** The user's tags (ADR-0042), each with how many vacancies carry it: rename, tone, delete.
 * Putting one on a vacancy is done on the vacancy's row or page. */
export function TagsCard() {
  const tags = useTags();
  const remove = useDeleteTag();
  const [open, setOpen] = useState<{ dialog: 'edit' | 'delete'; id: number } | null>(null);
  const opened = tags.data?.find(({ id }) => id === open?.id);
  const close = () => setOpen(null);

  return (
    <Card>
      <CardHead>
        <CardTitle>Tags</CardTitle>
      </CardHead>
      <div className="flex flex-col gap-2 px-4 pb-4">
        {tags.isPending && <p className="text-ink-muted">Loading…</p>}
        {tags.isError && <p className="text-bad-ink">{tags.error.message}</p>}
        {tags.data?.length === 0 && (
          <p className="text-ink-muted">No tags yet. Add one on a vacancy.</p>
        )}
        {tags.data && tags.data.length > 0 && (
          <ul className="flex flex-col gap-2">
            {tags.data.map((tag) => (
              <li key={tag.id} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <Chip color={CHIP_TONE[tag.tone]}>{tag.name}</Chip>
                  <span className="text-ink-muted">{vacancies(tag.vacancyCount)}</span>
                </span>
                <span className="flex flex-none gap-2">
                  <Button
                    aria-label={`Edit tag ${tag.name}`}
                    onClick={() => setOpen({ dialog: 'edit', id: tag.id })}
                  >
                    Edit
                  </Button>
                  <Button
                    aria-label={`Delete tag ${tag.name}`}
                    disabled={remove.isPending}
                    onClick={() => setOpen({ dialog: 'delete', id: tag.id })}
                  >
                    Delete
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {opened && open?.dialog === 'edit' && <EditTagDialog tag={opened} onClose={close} />}
      {opened && open?.dialog === 'delete' && (
        <ConfirmDialog
          title={`Delete “${opened.name}”?`}
          description={`This takes the tag off ${vacancies(opened.vacancyCount)}. The vacancies stay.`}
          confirmLabel="Delete"
          onConfirm={() => {
            remove.mutate(opened.id);
            close();
          }}
          onCancel={close}
        />
      )}
    </Card>
  );
}
