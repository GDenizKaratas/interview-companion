import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { api, ApiError, type Interview, type InterviewerNote } from "./api.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { interviewName } from "./interview-names.ts";
import { fill, type Text } from "./languages.ts";
import { useText } from "./text.tsx";

// The "My Notes" panel: a box that saves on Enter, and the Candidate's Interviewer Notes below it.
// Core splits the box into one note per line, filters by Interview, and decides the order.
export function NotesPanel({
  candidateId,
  interviews,
  selectedInterviewId,
  onShowAll,
}: {
  candidateId: string;
  interviews: Interview[];
  // The Interview chosen in the Workspace header, or null for all.
  selectedInterviewId: string | null;
  // Switches the Workspace header to all Interviews.
  onShowAll: () => void;
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
  // The Interview a just-saved or re-tagged note went to, when the current filter hides it.
  const [hiddenInterviewId, setHiddenInterviewId] = useState<string | null>(null);
  if (followedSelection !== selectedInterviewId) {
    setFollowedSelection(selectedInterviewId);
    setTag(selectedInterviewId);
    setHiddenInterviewId(null);
  }
  const [saveError, setSaveError] = useState<unknown>();
  const box = useRef<HTMLTextAreaElement>(null);
  // The box text, also kept outside React state so a save that finishes can read what is there now.
  const draftNow = useRef("");
  const saving = useRef(false);
  // Enter was pressed while a save was running; save again when it finishes.
  const saveAgain = useRef(false);
  // Only the newest list request may fill the list, so a slow older answer cannot overwrite it.
  const latestLoad = useRef(0);
  // Notes saved or re-tagged since the list was last filled. They are checked against whichever
  // list request answers last, so a newer request cannot drop the notice for an earlier save.
  const changedSinceLoad = useRef<InterviewerNote[]>([]);
  // The selection as it is now. A save that finishes after the selection changed must fetch
  // the list for the new selection, not the one it started under.
  const selectionNow = useRef(selectedInterviewId);

  useEffect(() => {
    selectionNow.current = selectedInterviewId;
    changedSinceLoad.current = [];
    loadNotes(candidateId);
  }, [candidateId, selectedInterviewId]);

  // If core's new list leaves out a note that was just saved or re-tagged, the filter hides it,
  // and the panel says where it went instead of letting the note seem to vanish.
  function loadNotes(id: string, changed: InterviewerNote[] = []) {
    changedSinceLoad.current = [...changedSinceLoad.current, ...changed];
    const thisLoad = ++latestLoad.current;
    api.listInterviewerNotes(id, selectionNow.current).then(
      (list) => {
        if (thisLoad !== latestLoad.current) return;
        setNotes(list);
        setLoadFailed(false);
        const hidden = changedSinceLoad.current.find((note) => !list.some((shown) => shown.id === note.id));
        changedSinceLoad.current = [];
        setHiddenInterviewId(hidden?.interviewId ?? null);
      },
      () => {
        if (thisLoad !== latestLoad.current) return;
        changedSinceLoad.current = [];
        setLoadFailed(true);
        setHiddenInterviewId(null);
      },
    );
  }

  function changeDraft(value: string) {
    draftNow.current = value;
    setDraft(value);
  }

  // The box is never disabled while saving, so it keeps focus and the Interviewer can keep typing.
  // Only the text that was sent is removed; anything typed meanwhile stays.
  async function save() {
    if (saving.current) {
      saveAgain.current = true;
      return;
    }
    saving.current = true;
    const sent = draftNow.current;
    let saved = false;
    try {
      const added = await api.addInterviewerNotes({ candidateId, interviewId: tag, text: sent });
      const current = draftNow.current;
      changeDraft(current.startsWith(sent) ? current.slice(sent.length).replace(/^\r?\n/, "") : current);
      setSaveError(undefined);
      saved = true;
      loadNotes(candidateId, added);
    } catch (error) {
      setSaveError(error);
    } finally {
      saving.current = false;
    }
    if (saved && saveAgain.current) {
      saveAgain.current = false;
      if (draftNow.current.trim() !== "") void save();
    }
    saveAgain.current = false;
  }

  // Enter saves. Shift+Enter starts a new line, which becomes its own note. Enter that confirms
  // a word in an input method (for example while composing accented letters) is left alone.
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void save();
    }
  }

  // After a note is edited, re-tagged, or deleted, the list is fetched again and the box is
  // ready for the next note. changed is the note as it is now, unless it was deleted.
  function handleNoteChanged(changed?: InterviewerNote) {
    loadNotes(candidateId, changed ? [changed] : []);
    box.current?.focus();
  }

  const hiddenInterview = interviews.find((interview) => interview.id === hiddenInterviewId);

  const lineCount = draft.split("\n").length;

  return (
    <div className="notes">
      <div className="note-entry">
        <textarea
          ref={box}
          className="note-box"
          value={draft}
          rows={Math.min(Math.max(lineCount, 1), 6)}
          placeholder={text.panels.interviewerNotes.placeholder}
          aria-label={text.panels.interviewerNotes.placeholder}
          onChange={(e) => {
            changeDraft(e.target.value);
            setSaveError(undefined);
          }}
          onKeyDown={handleKeyDown}
        />
        <div className="note-entry-meta">
          <TagSelect text={text} interviews={interviews} value={tag} onChange={setTag} />
          <span className="hint">{text.panels.interviewerNotes.hint}</span>
        </div>
        {saveError !== undefined && <p className="error">{refusalMessage(text, saveError, text.panels.interviewerNotes.saveFailed)}</p>}
      </div>
      {hiddenInterview && (
        <p className="notice" role="status">
          {fill(text.panels.interviewerNotes.hiddenByFilter, { interview: interviewName(text, hiddenInterview) })}{" "}
          <button type="button" className="link-button" onClick={onShowAll}>
            {text.panels.interviewerNotes.showAll}
          </button>
        </p>
      )}
      {loadFailed && <p className="error">{text.panels.interviewerNotes.loadFailed}</p>}
      {!loadFailed && notes.length === 0 && <p className="empty">{text.panels.interviewerNotes.empty}</p>}
      <ul className="note-list">
        {notes.map((note) => (
          <NoteItem key={note.id} note={note} interviews={interviews} onChanged={handleNoteChanged} />
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
  // Called after a change, with the note as it is now when it still exists.
  onChanged: (note?: InterviewerNote) => void;
}) {
  const { text } = useText();
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(note.text);
  const [error, setError] = useState<string>();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Changing the tag leaves an open edit alone, so unsaved text is not lost.
  async function run(change: () => Promise<InterviewerNote | undefined>, failed: string, { closeEditor = true } = {}) {
    try {
      const changed = await change();
      setError(undefined);
      if (closeEditor) setEditing(false);
      onChanged(changed);
    } catch (caught) {
      setError(refusalMessage(text, caught, failed));
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
    setConfirmingDelete(false);
    void run(
      () => api.deleteInterviewerNote(note.id).then(() => undefined),
      text.panels.interviewerNotes.deleteFailed,
    );
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
            void run(() => api.tagInterviewerNote(note.id, interviewId), text.panels.interviewerNotes.saveFailed, {
              closeEditor: false,
            })
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
        <button type="button" className="link-button" onClick={() => setConfirmingDelete(true)}>
          {text.panels.interviewerNotes.delete}
        </button>
      </div>
      {error !== undefined && <p className="error">{error}</p>}
      {confirmingDelete && (
        <ConfirmDialog
          title={text.panels.interviewerNotes.confirmDelete}
          confirmLabel={text.panels.interviewerNotes.delete}
          cancelLabel={text.panels.interviewerNotes.cancel}
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        >
          <p className="note-text">{note.text}</p>
        </ConfirmDialog>
      )}
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

// Core decides whether a note's text is valid; this only says why, in the current language.
function refusalMessage(text: Text, error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.field === "text" && error.rule === "required") {
    return text.panels.interviewerNotes.required;
  }
  return fallback;
}
