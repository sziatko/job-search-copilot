import { type FormEvent, useId, useState } from 'react';
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
        <h2 id={titleId} className="dialog-title">
          Save for later
        </h2>
        <p className="dialog-sub">
          {title} — {company}
        </p>

        <div className="mt-[16px]">
          <label htmlFor={commentId} className="field-label">
            Comment
          </label>
          <textarea
            id={commentId}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            rows={3}
            placeholder="Why set it aside? (optional)"
            className="field-input resize-y"
          />
        </div>

        <div className="dialog-actions">
          <button type="button" onClick={onCancel} className="btn">
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Save for later
          </button>
        </div>
      </form>
    </Modal>
  );
}
