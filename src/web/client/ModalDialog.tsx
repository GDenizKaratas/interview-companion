import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from "react";
import { useText } from "./text.tsx";

// What a dialog is for decides how it closes:
// - "info" only shows something: the × button, Escape, or a click outside it closes it.
// - "form" has something to type in: the × button or Escape closes it, and a click outside does
//   not, so a stray click never loses what was typed.
// - "question" asks the Interviewer to decide: only its buttons or Escape answer it.
export type DialogKind = "info" | "form" | "question";

interface ModalDialogProps {
  title: string;
  kind: DialogKind;
  children?: ReactNode;
  // The buttons at the bottom, in order.
  actions: ReactNode;
  // Escape, the × button, a click outside an "info" dialog, or the Cancel or Close button the actions hold.
  onCancel: () => void;
  // Room for a form or a list, instead of the width of a short question.
  wide?: boolean;
  // Room for a guide with steps side by side.
  large?: boolean;
}

// The app's small modal dialog: the page behind it cannot be clicked, and Escape cancels only this
// dialog, not one it was opened from.
export function ModalDialog({ title, kind, children, actions, onCancel, wide, large }: ModalDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const pressedOutside = useRef(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className={large ? "confirm-dialog wide large" : wide ? "confirm-dialog wide" : "confirm-dialog"}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }}
      // Only a click that both starts and ends on the dimmed page closes the dialog, so selecting
      // text and letting go outside it does not.
      onMouseDown={(event) => {
        pressedOutside.current = isOutside(event);
      }}
      onClick={(event) => kind === "info" && pressedOutside.current && isOutside(event) && onCancel()}
    >
      <h2 id={titleId}>{title}</h2>
      {children && <div className="confirm-dialog-subject">{children}</div>}
      <div className="confirm-dialog-actions">{actions}</div>
      {/* Last in the dialog, so opening it puts the focus in the first field, not on the ×. */}
      {kind !== "question" && <DialogCloseButton onClose={onCancel} />}
    </dialog>
  );
}

// The × at the top right of a dialog.
export function DialogCloseButton({ onClose }: { onClose: () => void }) {
  const { text } = useText();
  return (
    <button type="button" className="icon-button dialog-close" aria-label={text.closeDialog} title={text.closeDialog} onClick={onClose}>
      ×
    </button>
  );
}

// True for a mouse event on the dimmed page around a dialog. A dialog's own padding is part of
// the dialog, so the pointer's place is compared with the dialog's box instead of the target.
function isOutside(event: MouseEvent<HTMLDialogElement>): boolean {
  if (event.target !== event.currentTarget) return false;
  const box = event.currentTarget.getBoundingClientRect();
  return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
}
