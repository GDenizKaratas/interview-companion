import { useState, type FormEvent } from "react";
import { AddButton } from "./AddButton.tsx";
import { api, ApiError, type Interview } from "./api.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { interviewLabel } from "./interview-names.ts";
import type { Text } from "./languages.ts";
import { ModalDialog } from "./ModalDialog.tsx";
import { useText } from "./text.tsx";

// The Interview part of the Workspace bar: choose one Interview or all of them, change or
// delete the chosen one, and add a new one. Adding and changing happen in a dialog.
export function InterviewSelector({
  interviews,
  loadError,
  candidateId,
  selected,
  onSelect,
  onAdded,
  onRescheduled,
  onDeleted,
}: {
  interviews: Interview[];
  loadError: boolean;
  candidateId: string;
  // One Interview's id, or null for all Interviews.
  selected: string | null;
  onSelect: (interviewId: string | null) => void;
  onAdded: (interview: Interview) => void;
  onRescheduled: () => void;
  onDeleted: (interview: Interview) => void;
}) {
  const { text, languageCode } = useText();
  const t = text.interviews;
  // The dialog that is open: for a new Interview, or for the selected one.
  const [dialog, setDialog] = useState<"add" | "edit" | undefined>();
  const selectedInterview = interviews.find((interview) => interview.id === selected);

  return (
    <div className="interview-bar">
      {interviews.length > 0 && (
        <label className="interview-select">
          <span className="visually-hidden">{t.label}</span>
          <select value={selected ?? ""} onChange={(e) => onSelect(e.target.value || null)}>
            {interviews.map((interview) => (
              <option key={interview.id} value={interview.id}>
                {interviewLabel(text, languageCode, interview)}
              </option>
            ))}
            {/* All comes last: the page opens on one Interview, and all of them is the rare choice. */}
            <option value="">{t.all}</option>
          </select>
        </label>
      )}
      {selectedInterview && (
        <button type="button" className="icon-button" aria-label={t.edit} title={t.edit} onClick={() => setDialog("edit")}>
          <PencilIcon />
        </button>
      )}
      <AddButton className="secondary add-interview" title={t.addTitle} onClick={() => setDialog("add")}>
        {t.add}
      </AddButton>
      {loadError && <p className="error">{t.loadFailed}</p>}
      {dialog === "add" && (
        <InterviewDialog
          candidateId={candidateId}
          onClose={() => setDialog(undefined)}
          onSaved={(added) => {
            setDialog(undefined);
            onAdded(added);
          }}
        />
      )}
      {dialog === "edit" && selectedInterview && (
        <InterviewDialog
          candidateId={candidateId}
          interview={selectedInterview}
          onClose={() => setDialog(undefined)}
          onSaved={() => {
            setDialog(undefined);
            onRescheduled();
          }}
          onDeleted={() => {
            setDialog(undefined);
            onDeleted(selectedInterview);
          }}
        />
      )}
    </div>
  );
}

// The date and time of a new Interview, or of an existing one, which can also be deleted here.
// Core decides what is a valid date and time; the dialog only shows its refusal.
function InterviewDialog({
  candidateId,
  interview,
  onSaved,
  onDeleted,
  onClose,
}: {
  candidateId: string;
  // The Interview to change. Without one, the dialog adds a new Interview.
  interview?: Interview;
  onSaved: (interview: Interview) => void;
  onDeleted?: () => void;
  onClose: () => void;
}) {
  const { text, languageCode } = useText();
  const t = text.interviews;
  const [date, setDate] = useState(interview?.date ?? "");
  const [time, setTime] = useState(interview?.time ?? "");
  const [saveError, setSaveError] = useState<unknown>();
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaveError(undefined);
    try {
      onSaved(interview ? await api.rescheduleInterview(interview.id, { date, time }) : await api.addInterview({ candidateId, date, time }));
    } catch (error) {
      setSaveError(error);
      setSaving(false);
    }
  }

  // A 404 means the Interview is already gone, for example deleted in another tab.
  async function deleteInterview() {
    if (!interview) return;
    setConfirmingDelete(false);
    setDeleteFailed(false);
    try {
      await api.deleteInterview(interview.id);
      onDeleted?.();
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) onDeleted?.();
      else setDeleteFailed(true);
    }
  }

  // The question is its own dialog, beside this one and not inside it.
  const confirmBlock = (
    <>
      {confirmingDelete && interview && (
        <ConfirmDialog
          title={t.confirmDelete}
          confirmLabel={t.delete}
          cancelLabel={t.cancel}
          onConfirm={deleteInterview}
          onCancel={() => setConfirmingDelete(false)}
        >
          <p>
            <strong>{interviewLabel(text, languageCode, interview)}</strong>
          </p>
          <p>{t.deleteDetails}</p>
        </ConfirmDialog>
      )}
    </>
  );

  return (
    <>
    <ModalDialog
      title={interview ? interviewLabel(text, languageCode, interview) : t.addTitle}
      wide
      onCancel={onClose}
      actions={
        <>
          {interview && (
            <button type="button" className="danger-quiet secondary delete-interview" onClick={() => setConfirmingDelete(true)}>
              {t.delete}
            </button>
          )}
          <button type="button" className="secondary" onClick={onClose}>
            {t.cancel}
          </button>
          <button type="submit" form="interview-form" disabled={saving}>
            {interview ? t.saveChanges : t.save}
          </button>
        </>
      }
    >
      <form id="interview-form" className="interview-form" onSubmit={handleSubmit}>
        <label>
          {t.dateLabel}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} autoFocus />
        </label>
        <label>
          {t.timeLabel}
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <p className="form-hint">{t.whenHint}</p>
        {saveError !== undefined && <p className="error">{refusalMessage(text, saveError)}</p>}
        {deleteFailed && <p className="error">{t.deleteFailed}</p>}
      </form>
    </ModalDialog>
    {confirmBlock}
    </>
  );
}

// Core decides whether a date and time are valid; this only says why, in the current language.
function refusalMessage(text: Text, error: unknown): string {
  if (error instanceof ApiError && error.field === "date" && error.rule === "format") return text.interviews.invalidDate;
  if (error instanceof ApiError && error.field === "date" && error.rule === "required") return text.interviews.timeNeedsDate;
  if (error instanceof ApiError && error.field === "time") return text.interviews.invalidTime;
  return text.interviews.saveFailed;
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 13.5l.6-2.9 7.6-7.6 2.3 2.3-7.6 7.6zM9.4 4.3l2.3 2.3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}
