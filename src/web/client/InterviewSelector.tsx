import { useEffect, useState, type FormEvent } from "react";
import { api, type Interview } from "./api.ts";
import { text } from "./text.ts";

// Which Interview the Workspace shows: one Interview's id, or every Interview.
export type InterviewChoice = "all" | string;

// The Interview row of the Workspace header: choose "All" or one Interview, or add a new one.
export function InterviewSelector({
  candidateId,
  selected,
  onSelect,
}: {
  candidateId: string;
  selected: InterviewChoice;
  onSelect: (choice: InterviewChoice) => void;
}) {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api.listInterviews(candidateId).then(setInterviews, () => setLoadError(true));
  }, [candidateId]);

  // Core decides the order, so the list is fetched again instead of sorted here.
  async function handleAdded(added: Interview) {
    setAdding(false);
    onSelect(added.id);
    setInterviews(await api.listInterviews(candidateId).catch(() => [...interviews, added]));
  }

  return (
    <div className="interview-bar">
      <label className="interview-select">
        {text.interviews.label}
        <select value={selected} onChange={(e) => onSelect(e.target.value)}>
          <option value="all">{text.interviews.all}</option>
          {interviews.map((interview) => (
            <option key={interview.id} value={interview.id}>
              {interviewName(interview)}
            </option>
          ))}
        </select>
      </label>
      {adding ? (
        <NewInterviewForm candidateId={candidateId} onAdded={handleAdded} onCancel={() => setAdding(false)} />
      ) : (
        <button type="button" className="secondary" onClick={() => setAdding(true)}>
          {text.interviews.add}
        </button>
      )}
      {loadError && <p className="error">{text.interviews.loadFailed}</p>}
    </div>
  );
}

export function interviewName(interview: Interview): string {
  return `${interview.stage} · ${interview.date ?? text.interviews.noDate}`;
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
  const [stage, setStage] = useState("");
  const [date, setDate] = useState("");
  const [stages, setStages] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  // Earlier stages are only suggestions; if they cannot be loaded the form still works.
  useEffect(() => {
    api.listInterviewStages().then(setStages, () => {});
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaveError(undefined);
    try {
      onAdded(await api.addInterview({ candidateId, stage, date }));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : text.interviews.saveFailed);
      setSaving(false);
    }
  }

  return (
    <form className="interview-form" onSubmit={handleSubmit} onKeyDown={(e) => e.key === "Escape" && onCancel()}>
      <label>
        {text.interviews.stageLabel}
        <input
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          list="known-stages"
          autoComplete="off"
          autoFocus
        />
        <datalist id="known-stages">
          {stages.map((knownStage) => (
            <option key={knownStage} value={knownStage} />
          ))}
        </datalist>
      </label>
      <label>
        {text.interviews.dateLabel}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <button type="submit" disabled={saving}>
        {text.interviews.save}
      </button>
      <button type="button" className="secondary" onClick={onCancel}>
        {text.interviews.cancel}
      </button>
      {saveError && <p className="error">{saveError}</p>}
    </form>
  );
}
