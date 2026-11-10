import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { api, ApiError, type Interview, type SavedQuestion } from "./api.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { SuggestedQuestions } from "./SuggestedQuestions.tsx";
import type { Text } from "./languages.ts";
import { useText } from "./text.tsx";

interface SavedQuestionsProps {
  candidateId: string;
  interviews: Interview[];
  transcriptVersion: number;
}

// The Interviewer's own question list for one Candidate, with the collapsed Suggested Questions
// under it. Core keeps the order; after every change the list is fetched again, so the screen
// always shows what core has saved.
export function SavedQuestions({ candidateId, interviews, transcriptVersion }: SavedQuestionsProps) {
  const { text } = useText();
  const t = text.panels.questions;
  const [questions, setQuestions] = useState<SavedQuestion[] | undefined>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<unknown>();
  const [changeError, setChangeError] = useState<unknown>();
  // While a change is on its way, the list may be out of date, so its buttons wait.
  const [busy, setBusy] = useState(false);
  // The question waiting for the Interviewer to confirm its deletion.
  const [toDelete, setToDelete] = useState<SavedQuestion | undefined>();

  const reload = useCallback(
    () =>
      api.listSavedQuestions(candidateId).then(
        (list) => {
          setQuestions(list);
          setLoadFailed(false);
        },
        () => setLoadFailed(true),
      ),
    [candidateId],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  async function add() {
    setSaving(true);
    setAddError(undefined);
    setChangeError(undefined);
    try {
      await api.addSavedQuestion(candidateId, draft);
      setDraft("");
    } catch (error) {
      // The text stays in the box, so nothing the Interviewer wrote is lost.
      setAddError(error);
    } finally {
      setSaving(false);
    }
    await reload();
  }

  // Runs one change to an existing question, then shows the list as core has it.
  async function change(run: () => Promise<unknown>): Promise<boolean> {
    setChangeError(undefined);
    setAddError(undefined);
    setBusy(true);
    let ok = true;
    try {
      await run();
    } catch (error) {
      ok = false;
      setChangeError(error);
    }
    await reload();
    setBusy(false);
    return ok;
  }

  function confirmDelete() {
    if (!toDelete) return;
    const id = toDelete.id;
    setToDelete(undefined);
    change(() => api.deleteSavedQuestion(id));
  }

  return (
    <>
      <textarea
        className="question-input"
        aria-label={t.newLabel}
        placeholder={t.placeholder}
        title={t.hint}
        rows={2}
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onEnter(add)}
      />
      {addError !== undefined && <p className="error">{refusalMessage(t, addError, t.saveFailed)}</p>}
      {changeError !== undefined && <p className="error">{refusalMessage(t, changeError, t.changeFailed)}</p>}
      {loadFailed && <p className="error">{t.loadFailed}</p>}
      {questions && questions.length === 0 && <p className="empty">{t.empty}</p>}
      {questions && questions.length > 0 && (
        <ol className="question-list">
          {questions.map((question, index) => (
            <QuestionItem
              key={question.id}
              question={question}
              isFirst={index === 0}
              isLast={index === questions.length - 1}
              onMove={(position) => change(() => api.moveSavedQuestion(question.id, position)).then(() => {})}
              onEdit={(newText) => change(() => api.editSavedQuestion(question.id, newText))}
              onDelete={() => setToDelete(question)}
              position={index}
              busy={busy}
            />
          ))}
        </ol>
      )}
      <SuggestedQuestions
        candidateId={candidateId}
        interviews={interviews}
        transcriptVersion={transcriptVersion}
        onAccepted={() => void reload()}
      />
      {toDelete && (
        <ConfirmDialog
          title={t.confirmDelete}
          confirmLabel={t.delete}
          cancelLabel={t.cancel}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(undefined)}
        >
          <p className="question-text">{toDelete.text}</p>
        </ConfirmDialog>
      )}
    </>
  );
}

interface QuestionItemProps {
  question: SavedQuestion;
  position: number;
  isFirst: boolean;
  isLast: boolean;
  onMove: (position: number) => void;
  onEdit: (text: string) => Promise<boolean>;
  onDelete: () => void;
  busy: boolean;
}

function QuestionItem({ question, position, isFirst, isLast, onMove, onEdit, onDelete, busy }: QuestionItemProps) {
  const { text } = useText();
  const t = text.panels.questions;
  const [editing, setEditing] = useState<string | undefined>();

  async function save() {
    if (editing === undefined || busy) return;
    // Keep the box open if core refused the text, so the Interviewer can fix it.
    if (await onEdit(editing)) setEditing(undefined);
  }

  function onEditKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") setEditing(undefined);
    else onEnter(save)(event);
  }

  return (
    <li className="question">
      {editing === undefined ? (
        <span className="question-text">{question.text}</span>
      ) : (
        <span className="question-edit">
          <textarea
            className="question-input"
            aria-label={t.edit}
            rows={2}
            value={editing}
            autoFocus
            onChange={(e) => setEditing(e.target.value)}
            onKeyDown={onEditKey}
          />
          <span className="question-actions">
            <button type="button" className="quiet" disabled={busy} onClick={save}>
              {t.save}
            </button>
            <button type="button" className="quiet" onClick={() => setEditing(undefined)}>
              {t.cancel}
            </button>
          </span>
        </span>
      )}
      <span className="question-origin">{question.origin === "written" ? t.writtenByYou : t.fromSuggestion}</span>
      {editing === undefined && (
        <span className="question-actions">
          <button type="button" className="quiet" aria-label={t.moveUp} title={t.moveUp} disabled={busy || isFirst} onClick={() => onMove(position - 1)}>
            ↑
          </button>
          <button type="button" className="quiet" aria-label={t.moveDown} title={t.moveDown} disabled={busy || isLast} onClick={() => onMove(position + 1)}>
            ↓
          </button>
          <button type="button" className="quiet" disabled={busy} onClick={() => setEditing(question.text)}>
            {t.edit}
          </button>
          <button type="button" className="quiet" disabled={busy} onClick={onDelete}>
            {t.delete}
          </button>
        </span>
      )}
    </li>
  );
}

// Enter saves; Shift+Enter adds a line break. Enter while composing (for example with an
// input method editor) is left alone.
function onEnter(run: () => void) {
  return (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      run();
    }
  };
}

// Core decides whether a question is valid; this only says why, in the current language.
function refusalMessage(t: Text["panels"]["questions"], error: unknown, fallback: string): string {
  return error instanceof ApiError && error.field === "text" && error.rule === "required" ? t.required : fallback;
}
