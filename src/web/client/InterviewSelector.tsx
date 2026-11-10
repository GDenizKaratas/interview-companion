import { useState, type FormEvent } from "react";
import { AddButton } from "./AddButton.tsx";
import { api, ApiError, type Interview } from "./api.ts";
import { interviewLabel } from "./interview-names.ts";
import type { Text } from "./languages.ts";
import { useText } from "./text.tsx";

// The Interview part of the Workspace bar: choose "All" or one Interview, or add a new one.
export function InterviewSelector({
  interviews,
  loadError,
  candidateId,
  selected,
  onSelect,
  onAdded,
}: {
  interviews: Interview[];
  loadError: boolean;
  candidateId: string;
  // One Interview's id, or null for all Interviews.
  selected: string | null;
  onSelect: (interviewId: string | null) => void;
  onAdded: (interview: Interview) => void;
}) {
  const { text } = useText();
  const [adding, setAdding] = useState(false);

  function handleAdded(added: Interview) {
    setAdding(false);
    onAdded(added);
  }

  return (
    <div className="interview-bar">
      <label className="interview-select">
        <span className="visually-hidden">{text.interviews.label}</span>
        <select value={selected ?? ""} onChange={(e) => onSelect(e.target.value || null)}>
          <option value="">{text.interviews.all}</option>
          {interviews.map((interview) => (
            <option key={interview.id} value={interview.id}>
              {interviewLabel(text, interview)}
            </option>
          ))}
        </select>
      </label>
      {adding ? (
        <NewInterviewForm candidateId={candidateId} onAdded={handleAdded} onCancel={() => setAdding(false)} />
      ) : (
        <AddButton onClick={() => setAdding(true)}>{text.interviews.add}</AddButton>
      )}
      {loadError && <p className="error">{text.interviews.loadFailed}</p>}
    </div>
  );
}

function NewInterviewForm({
  candidateId,
  onAdded,
  onCancel,
}: {
  candidateId: string;
  onAdded: (interview: Interview) => void;
  onCancel: () => void;
}) {
  const { text } = useText();
  const [date, setDate] = useState("");
  const [saveError, setSaveError] = useState<unknown>();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaveError(undefined);
    try {
      onAdded(await api.addInterview({ candidateId, date }));
    } catch (error) {
      setSaveError(error);
      setSaving(false);
    }
  }

  return (
    <form className="interview-form" onSubmit={handleSubmit} onKeyDown={(e) => e.key === "Escape" && onCancel()}>
      <label>
        <span className="visually-hidden">{text.interviews.dateLabel}</span>
        <input type="date" value={date} title={text.interviews.dateLabel} onChange={(e) => setDate(e.target.value)} autoFocus />
      </label>
      <AddButton type="submit" disabled={saving}>
        {text.interviews.save}
      </AddButton>
      <button type="button" className="secondary" onClick={onCancel}>
        {text.interviews.cancel}
      </button>
      {saveError !== undefined && <p className="error">{refusalMessage(text, saveError)}</p>}
    </form>
  );
}

// Core decides whether a date is valid; this only says why, in the current language.
function refusalMessage(text: Text, error: unknown): string {
  if (error instanceof ApiError && error.field === "date" && error.rule === "format") {
    return text.interviews.invalidDate;
  }
  return text.interviews.saveFailed;
}
