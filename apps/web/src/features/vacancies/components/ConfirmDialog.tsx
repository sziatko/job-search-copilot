import { useId } from 'react';
import { Modal } from '@/components/ui/Modal';

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  return (
    <Modal onClose={onCancel} labelledBy={titleId}>
      <h2 id={titleId} className="text-lg font-semibold text-slate-900">
        {title}
      </h2>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
