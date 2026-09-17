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
        <h2 id={titleId} className="text-lg font-semibold text-slate-900">
          Mark as applied
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {title} — {company}
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="apply-salary" className="block text-sm font-medium text-slate-700">
              Salary / rate in the listing
            </label>
            <input
              id="apply-salary"
              type="text"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              placeholder="e.g. 130 PLN/hour"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={usedTailoredResume}
              onChange={(e) => setUsedTailoredResume(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Used a tailored resume
          </label>

          <div>
            <label htmlFor="apply-comment" className="block text-sm font-medium text-slate-700">
              Comment
            </label>
            <textarea
              id="apply-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              rows={3}
              className="mt-1 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            OK
          </button>
        </div>
      </form>
    </Modal>
  );
}
