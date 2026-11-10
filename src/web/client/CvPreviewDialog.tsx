import { useEffect, useRef } from "react";
import type { Candidate } from "./api.ts";
import { CvPanel } from "./CvPanel.tsx";
import { useText } from "./text.tsx";

// A Candidate's CV, opened from the Candidate list almost full screen, without going to the
// Workspace. It is the same CV panel as in the Workspace, so the CV can also be replaced here.
// Escape, the close button, or a click outside closes it.
export function CvPreviewDialog({
  candidate,
  onClose,
  onChanged,
}: {
  candidate: Candidate;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { text } = useText();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="cv-preview-dialog"
      aria-labelledby="cv-preview-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // A click on the dialog itself, not on its content, is a click on the dimmed page around it.
      onClick={(event) => event.target === dialog.current && onClose()}
    >
      <header className="panel-head">
        <h2 id="cv-preview-title">
          {candidate.name}
          <span className="role">{text.panels.cv.title}</span>
        </h2>
        <button type="button" className="icon-button" aria-label={text.home.closeCv} title={text.home.closeCv} onClick={onClose}>
          ×
        </button>
      </header>
      <div className="panel-body">
        <CvPanel candidateId={candidate.id} onChanged={onChanged} />
      </div>
    </dialog>
  );
}
