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
      <h2 id={titleId} className="dialog-title">
        {title}
      </h2>
      <p className="dialog-sub">{description}</p>
      <div className="dialog-actions">
        <button type="button" onClick={onCancel} className="btn">
          {cancelLabel}
        </button>
        <button type="button" onClick={onConfirm} className="btn btn-danger">
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
