import { useEffect, useState, type FormEvent } from "react";
import { AddButton } from "./AddButton.tsx";
import { api, ApiError, type Interview } from "./api.ts";
import type { Text } from "./languages.ts";
import { useText } from "./text.tsx";

// The Interview row of the Workspace header: choose "All" or one Interview, or add a new one.
export function InterviewSelector({
  candidateId,
  selected,
  onSelect,
}: {
  candidateId: string;
  // One Interview's id, or null for all Interviews.
  selected: string | null;
  onSelect: (interviewId: string | null) => void;
}) {
  const { text } = useText();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadInterviews(candidateId);
  }, [candidateId]);

  function loadInterviews(id: string) {
    api.listInterviews(id).then(
      (list) => {
        setInterviews(list);
        setLoadError(false);
      },
      () => setLoadError(true),
    );
  }

  // The new Interview is shown at once, then the list is fetched again because core decides the order.
  function handleAdded(added: Interview) {
    setAdding(false);
    setInterviews((current) => [...current, added]);
    onSelect(added.id);
    loadInterviews(candidateId);
  }

  return (
    <div className="interview-bar">
      <label className="interview-select">
        {text.interviews.label}
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

// "First interview · 2026-11-20 · planned", "Second interview · no date".
function interviewLabel(text: Text, interview: Interview): string {
  const ordinals: Record<string, string> = text.interviews.ordinal;
  const name = ordinals[String(interview.number)] ?? text.interviews.numbered.replace("{number}", String(interview.number));
  if (interview.date === null) return `${name} · ${text.interviews.noDate}`;
  return interview.planned ? `${name} · ${interview.date} · ${text.interviews.planned}` : `${name} · ${interview.date}`;
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
        {text.interviews.dateLabel}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} autoFocus />
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
