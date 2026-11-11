import { useEffect, useRef, type ReactNode } from "react";

interface ConfirmDialogProps {
  title: string;
  // What will be deleted, shown so the Interviewer can check it before confirming.
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// The one way the app asks before deleting something. It opens as a modal dialog: the page
// behind it cannot be clicked, Escape cancels, and Cancel has the focus, so pressing Enter
// by habit never deletes anything.
export function ConfirmDialog({ title, children, confirmLabel, cancelLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
    cancelButton.current?.focus();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="confirm-dialog"
      aria-labelledby="confirm-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        // Escape here must not also close a dialog this one was opened from.
        event.stopPropagation();
        onCancel();
      }}
    >
      <h2 id="confirm-dialog-title">{title}</h2>
      {children && <div className="confirm-dialog-subject">{children}</div>}
      <div className="confirm-dialog-actions">
        <button type="button" ref={cancelButton} className="quiet" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className="danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
