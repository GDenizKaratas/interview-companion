import { useEffect, useId, useRef, type ReactNode } from "react";

interface ModalDialogProps {
  title: string;
  children?: ReactNode;
  // The buttons at the bottom, in order.
  actions: ReactNode;
  // Escape, or the Cancel or Close button the actions hold.
  onCancel: () => void;
  // Room for a form or a list, instead of the width of a short question.
  wide?: boolean;
}

// The app's small modal dialog: the page behind it cannot be clicked, and Escape cancels only this
// dialog, not one it was opened from. ConfirmDialog and the Candidate export and import use it.
export function ModalDialog({ title, children, actions, onCancel, wide }: ModalDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className={wide ? "confirm-dialog wide" : "confirm-dialog"}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      {children && <div className="confirm-dialog-subject">{children}</div>}
      <div className="confirm-dialog-actions">{actions}</div>
    </dialog>
  );
}
