import { useId } from 'react';
import { Button } from '@/components/ui/Button';
import { DialogActions, DialogSub, DialogTitle } from '@/components/ui/Dialog';
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
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <DialogSub>{description}</DialogSub>
      <DialogActions>
        <Button onClick={onCancel}>{cancelLabel}</Button>
        <Button variant="danger" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Modal>
  );
}
