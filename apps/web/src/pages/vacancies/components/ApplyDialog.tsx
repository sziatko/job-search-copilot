import { type FormEvent, useId, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { DialogActions, DialogSub, DialogTitle } from '@/components/ui/Dialog';
import { Checkbox, Input, Label, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';

export interface ApplyDetails {
  salary: string;
  usedTailoredResume: boolean;
  comment: string;
}

/** Opened from /vacancies to record an application, and from /applications, pre-filled
 * with `initial`, to edit one. The comment is never pre-filled: comments are
 * append-only, so in edit mode it is a new one, added beside the others. */
export function ApplyDialog({
  company,
  title,
  heading = 'Mark as applied',
  initial,
  onCancel,
  onConfirm,
}: {
  company: string;
  title: string;
  heading?: string;
  initial?: Omit<ApplyDetails, 'comment'>;
  onCancel: () => void;
  onConfirm: (details: ApplyDetails) => void;
}) {
  const [salary, setSalary] = useState(initial?.salary ?? '');
  const [usedTailoredResume, setUsedTailoredResume] = useState(
    initial?.usedTailoredResume ?? false,
  );
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
        <DialogTitle id={titleId}>{heading}</DialogTitle>
        <DialogSub>
          {title} — {company}
        </DialogSub>

        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor={salaryId}>Salary / rate</Label>
            <Input
              id={salaryId}
              type="text"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              placeholder="e.g. 130 PLN/hour"
            />
          </div>

          <Checkbox
            label="Used a tailored resume"
            checked={usedTailoredResume}
            onChange={(e) => setUsedTailoredResume(e.target.checked)}
          />

          <div>
            <Label htmlFor={commentId}>{initial ? 'Add a comment' : 'Comment'}</Label>
            <Textarea
              id={commentId}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              rows={3}
            />
          </div>
        </div>

        <DialogActions>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="primary">
            OK
          </Button>
        </DialogActions>
      </form>
    </Modal>
  );
}
