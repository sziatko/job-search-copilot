import { type FormEvent, useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { DialogActions, DialogSub, DialogTitle } from '@/components/ui/Dialog';
import { Label, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';

/** Save for later, with an optional note on why — saved as a USER comment with the
 * move. A blank one is sent as no comment at all. Enter sends, Shift+Enter breaks the
 * line — the ApplyDialog's keys. */
export function SaveForLaterDialog({
  company,
  title,
  onCancel,
  onConfirm,
}: {
  company: string;
  title: string;
  onCancel: () => void;
  onConfirm: (comment: string | undefined) => void;
}) {
  const [comment, setComment] = useState('');
  const commentId = useId();
  const titleId = useId();

  const confirm = () => onConfirm(comment.trim() || undefined);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    confirm();
  }

  function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      confirm();
    }
  }

  return (
    <Modal onClose={onCancel} labelledBy={titleId} maxWidthClassName="max-w-md">
      <form onSubmit={handleSubmit}>
        <DialogTitle id={titleId}>Save for later</DialogTitle>
        <DialogSub>
          {title} — {company}
        </DialogSub>

        <div className="mt-4">
          <Label htmlFor={commentId}>Comment</Label>
          <Textarea
            id={commentId}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            rows={3}
            placeholder="Why set it aside? (optional)"
          />
        </div>

        <DialogActions>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="primary">
            Save for later
          </Button>
        </DialogActions>
      </form>
    </Modal>
  );
}
