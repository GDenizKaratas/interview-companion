import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { api, ApiError, type Interview, type InterviewerNote } from "./api.ts";
import { interviewName } from "./InterviewSelector.tsx";
import type { Text } from "./languages.ts";
import { useText } from "./text.tsx";

// The "My Notes" panel: a box that saves on Enter, and the Candidate's Interviewer Notes below it.
// Core splits the box into one note per line, filters by Interview, and decides the order.
export function NotesPanel({
  candidateId,
  interviews,
  selectedInterviewId,
}: {
  candidateId: string;
  interviews: Interview[];
  // The Interview chosen in the Workspace header, or null for all.
  selectedInterviewId: string | null;
}) {
  const { text } = useText();
  const [notes, setNotes] = useState<InterviewerNote[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState("");
  // The Interview new notes are tagged with. It follows the header's selection.
  const [tag, setTag] = useState<string | null>(selectedInterviewId);
  // When the header's selection changes, the tag for new notes follows it (React's way of
  // adjusting state when a prop changes, without an extra render from an effect).
  const [followedSelection, setFollowedSelection] = useState(selectedInterviewId);
  if (followedSelection !== selectedInterviewId) {
    setFollowedSelection(selectedInterviewId);
    setTag(selectedInterviewId);
  }
  const [saveError, setSaveError] = useState<unknown>();
  const saving = useRef(false);

  useEffect(() => {
    loadNotes(candidateId, selectedInterviewId);
  }, [candidateId, selectedInterviewId]);

  function loadNotes(id: string, interviewId: string | null) {
    api.listInterviewerNotes(id, interviewId).then(
      (list) => {
        setNotes(list);
        setLoadFailed(false);
      },
      () => setLoadFailed(true),
    );
  }

  function reload() {
    loadNotes(candidateId, selectedInterviewId);
  }

  // The box is never disabled while saving, so it keeps focus and the Interviewer can keep typing.
  // Only the text that was sent is removed; anything typed meanwhile stays.
  async function save() {
    if (saving.current) return;
    saving.current = true;
    const sent = draft;
    try {
      await api.addInterviewerNotes({ candidateId, interviewId: tag, text: sent });
      setDraft((current) => (current.startsWith(sent) ? current.slice(sent.length).replace(/^\r?\n/, "") : current));
      setSaveError(undefined);
      reload();
    } catch (error) {
      setSaveError(error);
    } finally {
      saving.current = false;
    }
  }

  // Enter saves. Shift+Enter starts a new line, which becomes its own note. Enter that confirms
  // a word in an input method (for example while composing accented letters) is left alone.
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void save();
    }
  }

  const lineCount = draft.split("\n").length;

  return (
    <div className="notes">
      <div className="note-entry">
        <textarea
          className="note-box"
          value={draft}
          rows={Math.min(Math.max(lineCount, 1), 6)}
          placeholder={text.panels.interviewerNotes.placeholder}
          aria-label={text.panels.interviewerNotes.placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="note-entry-meta">
          <TagSelect text={text} interviews={interviews} value={tag} onChange={setTag} />
          <span className="hint">{text.panels.interviewerNotes.hint}</span>
        </div>
        {saveError !== undefined && <p className="error">{refusalMessage(text, saveError)}</p>}
      </div>
      {loadFailed && <p className="error">{text.panels.interviewerNotes.loadFailed}</p>}
      {!loadFailed && notes.length === 0 && <p className="empty">{text.panels.interviewerNotes.empty}</p>}
      <ul className="note-list">
        {notes.map((note) => (
          <NoteItem key={note.id} note={note} interviews={interviews} onChanged={reload} />
        ))}
      </ul>
    </div>
  );
}

function NoteItem({
  note,
  interviews,
  onChanged,
}: {
  note: InterviewerNote;
  interviews: Interview[];
  onChanged: () => void;
}) {
  const { text } = useText();
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(note.text);
  const [error, setError] = useState<string>();

  async function run(change: () => Promise<unknown>, failed: string) {
    try {
      await change();
      setError(undefined);
      setEditing(false);
      onChanged();
    } catch (caught) {
      setError(caught instanceof ApiError && caught.rule === "required" ? text.panels.interviewerNotes.required : failed);
    }
  }

  function startEditing() {
    setEditText(note.text);
    setError(undefined);
    setEditing(true);
  }

  function handleEditKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void run(() => api.editInterviewerNote(note.id, editText), text.panels.interviewerNotes.saveFailed);
    } else if (event.key === "Escape") {
      setEditing(false);
      setError(undefined);
    }
  }

  function handleDelete() {
    if (!window.confirm(text.panels.interviewerNotes.confirmDelete)) return;
    void run(() => api.deleteInterviewerNote(note.id), text.panels.interviewerNotes.deleteFailed);
  }

  return (
    <li className="note">
      {editing ? (
        <input
          className="note-edit"
          value={editText}
          aria-label={text.panels.interviewerNotes.edit}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={handleEditKeyDown}
          autoFocus
        />
      ) : (
        <p className="note-text">{note.text}</p>
      )}
      <div className="note-meta">
        <TagSelect
          text={text}
          interviews={interviews}
          value={note.interviewId}
          onChange={(interviewId) =>
            void run(() => api.tagInterviewerNote(note.id, interviewId), text.panels.interviewerNotes.saveFailed)
          }
        />
        <time dateTime={note.savedAt} title={text.panels.interviewerNotes.savedAt}>
          {formatSavedAt(note.savedAt)}
        </time>
        {editing ? (
          <button type="button" className="link-button" onClick={() => setEditing(false)}>
            {text.panels.interviewerNotes.cancel}
          </button>
        ) : (
          <button type="button" className="link-button" onClick={startEditing}>
            {text.panels.interviewerNotes.edit}
          </button>
        )}
        <button type="button" className="link-button" onClick={handleDelete}>
          {text.panels.interviewerNotes.delete}
        </button>
      </div>
      {error !== undefined && <p className="error">{error}</p>}
    </li>
  );
}

// The Interview a note is tagged with, shown as a small dropdown so it can be changed in one click.
function TagSelect({
  text,
  interviews,
  value,
  onChange,
}: {
  text: Text;
  interviews: Interview[];
  value: string | null;
  onChange: (interviewId: string | null) => void;
}) {
  return (
    <select
      className="note-tag"
      value={value ?? ""}
      aria-label={text.panels.interviewerNotes.tagLabel}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{text.panels.interviewerNotes.noInterview}</option>
      {interviews.map((interview) => (
        <option key={interview.id} value={interview.id}>
          {interviewName(text, interview)}
        </option>
      ))}
    </select>
  );
}

// "14:02" for a note saved today, "2026-11-03 14:02" otherwise, in this computer's time zone.
function formatSavedAt(savedAt: string): string {
  const saved = new Date(savedAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(saved.getHours())}:${pad(saved.getMinutes())}`;
  return day(saved) === day(new Date()) ? time : `${day(saved)} ${time}`;
}

function refusalMessage(text: Text, error: unknown): string {
  if (error instanceof ApiError && error.field === "text" && error.rule === "required") {
    return text.panels.interviewerNotes.required;
  }
  return text.panels.interviewerNotes.saveFailed;
}
