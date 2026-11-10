import { useState, type KeyboardEvent } from "react";
import { api, ApiError, type AiNote } from "./api.ts";
import { fill, type Text } from "./languages.ts";
import { useText } from "./text.tsx";
import { formatTime } from "./transcript-text.ts";

interface AiNoteItemProps {
  note: AiNote;
  // Each quoted segment's start time, or null when the Transcript has no times.
  segmentTimes: Map<number, number | null>;
  onShowEvidence: (segmentNumber: number) => void;
  onChanged: (note: AiNote) => void;
}

// One AI Note: its statement (or the Interviewer's correction above the AI's text), its quotes,
// its Review State, and the review actions that fit that state.
export function AiNoteItem({ note, segmentTimes, onShowEvidence, onChanged }: AiNoteItemProps) {
  const { text } = useText();
  const t = text.panels.aiNotes;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function run(action: () => Promise<AiNote>) {
    setBusy(true);
    setError(undefined);
    try {
      onChanged(await action());
      setEditing(false);
    } catch (caught) {
      setError(reviewErrorMessage(text, caught));
    } finally {
      setBusy(false);
    }
  }

  function startEditing() {
    setDraft(note.correction ?? note.statement);
    setError(undefined);
    setEditing(true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      setEditing(false);
      setError(undefined);
    }
  }

  const corrected = note.reviewState === "corrected";
  const classes = ["ai-note", note.stale && "stale", note.reviewState === "dismissed" && "dismissed"];

  return (
    <li className={classes.filter(Boolean).join(" ")}>
      {note.stale && <p className="stale-warning">{t.stale}</p>}
      {editing ? (
        <div className="ai-note-edit">
          <textarea
            value={draft}
            aria-label={t.correctionLabel}
            rows={3}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <div className="ai-note-actions">
            <button type="button" disabled={busy} onClick={() => void run(() => api.correctAiNote(note.id, draft))}>
              {t.save}
            </button>
            <button type="button" className="link-button" onClick={() => setEditing(false)}>
              {t.cancel}
            </button>
          </div>
        </div>
      ) : corrected && note.correction !== null ? (
        <>
          <p className="ai-note-statement">{note.correction}</p>
          <p className="ai-note-original">
            <span>{t.aiWrote}</span> {note.statement}
          </p>
        </>
      ) : (
        <p className="ai-note-statement">{note.statement}</p>
      )}
      {note.evidence.map((evidence, i) => {
        const startMs = segmentTimes.get(evidence.segmentNumber);
        return (
          <button
            key={i}
            type="button"
            className="ai-note-quote"
            title={t.showInTranscript}
            onClick={() => onShowEvidence(evidence.segmentNumber)}
          >
            <span className="ai-note-quote-mark">❝</span>
            <span className="ai-note-quote-text">{evidence.quote}</span>
            <span className="ai-note-quote-where">
              {startMs === null || startMs === undefined
                ? fill(t.segment, { number: String(evidence.segmentNumber) })
                : formatTime(startMs)}
            </span>
          </button>
        );
      })}
      <div className="ai-note-actions">
        <span className="review-state">{t.reviewStates[note.reviewState]}</span>
        {!editing && note.reviewState === "unreviewed" && (
          <button
            type="button"
            className="link-button"
            title={t.confirmHint}
            disabled={busy}
            onClick={() => void run(() => api.confirmAiNote(note.id))}
          >
            {t.confirm}
          </button>
        )}
        {!editing && note.reviewState !== "dismissed" && (
          <button type="button" className="link-button" disabled={busy} onClick={startEditing}>
            {corrected ? t.editCorrection : t.correct}
          </button>
        )}
        {!editing && note.reviewState !== "dismissed" && (
          <button
            type="button"
            className="link-button"
            disabled={busy}
            onClick={() => void run(() => api.dismissAiNote(note.id))}
          >
            {t.dismiss}
          </button>
        )}
        {note.reviewState === "dismissed" && (
          <button
            type="button"
            className="link-button"
            disabled={busy}
            onClick={() => void run(() => api.restoreAiNote(note.id))}
          >
            {t.restore}
          </button>
        )}
      </div>
      {error !== undefined && <p className="error">{error}</p>}
    </li>
  );
}

function reviewErrorMessage(text: Text, error: unknown): string {
  const t = text.panels.aiNotes;
  if (error instanceof ApiError) {
    if (error.field === "correction" && error.rule === "required") return t.correctionRequired;
    if (error.reason === "noteCorrected") return t.errors.reasons.noteCorrected;
  }
  return t.reviewFailed;
}
