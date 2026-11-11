import { useEffect, useRef, type ReactNode } from "react";
import { ModalDialog } from "./ModalDialog.tsx";

interface ConfirmDialogProps {
  title: string;
  // What will be deleted, shown so the Interviewer can check it before confirming.
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  // A choice that deletes nothing, shown between Cancel and the confirm button, such as Keep both.
  otherAction?: { label: string; onClick: () => void };
}

// The one way the app asks before deleting something. It opens as a modal dialog: the page
// behind it cannot be clicked, Escape cancels, and Cancel has the focus, so pressing Enter
// by habit never deletes anything.
export function ConfirmDialog({ title, children, confirmLabel, cancelLabel, onConfirm, onCancel, otherAction }: ConfirmDialogProps) {
  const cancelButton = useRef<HTMLButtonElement>(null);

  // Runs after the dialog has opened, since a child's effects run first.
  useEffect(() => {
    cancelButton.current?.focus();
  }, []);

  return (
    <ModalDialog
      title={title}
      onCancel={onCancel}
      actions={
        <>
          <button type="button" ref={cancelButton} className="quiet" onClick={onCancel}>
            {cancelLabel}
          </button>
          {otherAction && (
            <button type="button" className="secondary" onClick={otherAction.onClick}>
              {otherAction.label}
            </button>
          )}
          <button type="button" className="danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </ModalDialog>
  );
}
