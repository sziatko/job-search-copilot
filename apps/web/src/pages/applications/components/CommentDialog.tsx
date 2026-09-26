import { type FormEvent, useId, useState } from 'react';
import { Modal } from '@/components/ui/Modal';

/** Adds one note to an application's timeline (ADR-0028). Enter submits, Shift+Enter
 * breaks the line — the same keys as the apply dialog's comment. */
export function CommentDialog({
  company,
  title,
  onCancel,
  onConfirm,
}: {
  company: string;
  title: string;
  onCancel: () => void;
  onConfirm: (body: string) => void;
}) {
  const [body, setBody] = useState('');
  const titleId = useId();
  const bodyId = useId();
  const blank = body.trim() === '';

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!blank) onConfirm(body);
  }

  return (
    <Modal onClose={onCancel} labelledBy={titleId} maxWidthClassName="max-w-md">
      <form onSubmit={submit}>
        <h2 id={titleId} className="dialog-title">
          Add a comment
        </h2>
        <p className="dialog-sub">
          {title} — {company}
        </p>

        <div className="mt-[16px]">
          <label htmlFor={bodyId} className="field-label">
            Comment
          </label>
          <textarea
            id={bodyId}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) submit(e);
            }}
            rows={4}
            className="field-input resize-y"
          />
        </div>

        <div className="dialog-actions">
          <button type="button" onClick={onCancel} className="btn">
            Cancel
          </button>
          <button type="submit" disabled={blank} className="btn btn-primary disabled:opacity-50">
            Add
          </button>
        </div>
      </form>
    </Modal>
  );
}
