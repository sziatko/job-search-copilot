import { type FormEvent, useId, useState } from 'react';
import { Modal } from '@/components/ui/Modal';

export interface ApplyDetails {
  salary: string;
  usedTailoredResume: boolean;
  comment: string;
}

export function ApplyDialog({
  company,
  title,
  onCancel,
  onConfirm,
}: {
  company: string;
  title: string;
  onCancel: () => void;
  onConfirm: (details: ApplyDetails) => void;
}) {
  const [salary, setSalary] = useState('');
  const [usedTailoredResume, setUsedTailoredResume] = useState(false);
  const [comment, setComment] = useState('');
  const salaryId = useId();
  const commentId = useId();
  const titleId = useId();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onConfirm({ salary, usedTailoredResume, comment });
  }

  function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onConfirm({ salary, usedTailoredResume, comment });
    }
  }

  return (
    <Modal onClose={onCancel} labelledBy={titleId} maxWidthClassName="max-w-md">
      <form onSubmit={handleSubmit}>
        <h2 id={titleId} className="dialog-title">
          Mark as applied
        </h2>
        <p className="dialog-sub">
          {title} — {company}
        </p>

        <div className="mt-[16px] space-y-[16px]">
          <div>
            <label htmlFor={salaryId} className="field-label">
              Salary / rate in the listing
            </label>
            <input
              id={salaryId}
              type="text"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              placeholder="e.g. 130 PLN/hour"
              className="field-input"
            />
          </div>

          <label className="field-check">
            <input
              type="checkbox"
              checked={usedTailoredResume}
              onChange={(e) => setUsedTailoredResume(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            Used a tailored resume
          </label>

          <div>
            <label htmlFor={commentId} className="field-label">
              Comment
            </label>
            <textarea
              id={commentId}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              rows={3}
              className="field-input resize-y"
            />
          </div>
        </div>

        <div className="dialog-actions">
          <button type="button" onClick={onCancel} className="btn">
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            OK
          </button>
        </div>
      </form>
    </Modal>
  );
}
