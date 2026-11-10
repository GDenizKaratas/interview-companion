import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { api, ApiError, type AskedQuestion, type Interview, type SavedQuestion, type SavedQuestionCheck } from "./api.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { ExchangeDialog } from "./ExchangeDialog.tsx";
import { interviewName } from "./interview-names.ts";
import { InterviewTagSelect } from "./InterviewTagSelect.tsx";
import { SuggestedQuestions } from "./SuggestedQuestions.tsx";
import { fill, type Text } from "./languages.ts";
import { useText } from "./text.tsx";

interface SavedQuestionsProps {
  candidateId: string;
  interviews: Interview[];
  // The Interview chosen in the Workspace header, or null for all.
  selectedInterviewId: string | null;
  // Switches the Workspace header to all Interviews.
  onShowAll: () => void;
  // Changes whenever a CV or Transcript changes.
  sourceVersion: number;
  // Changes whenever Asked Questions are found or a Transcript changes.
  askedVersion: number;
  // Shows one segment of an Interview's Transcript.
  onShowInTranscript: (interviewId: string, segmentNumber: number) => void;
}

// The Interviewer's own question list for one Candidate, with the collapsed Suggested Questions
// under it. Core keeps the order; after every change the list is fetched again, so the screen
// always shows what core has saved. Core applies the header's Interview filter, as for My Notes.
export function SavedQuestions({
  candidateId,
  interviews,
  selectedInterviewId,
  onShowAll,
  sourceVersion,
  askedVersion,
  onShowInTranscript,
}: SavedQuestionsProps) {
  const { text } = useText();
  const t = text.panels.questions;
  const [questions, setQuestions] = useState<SavedQuestion[] | undefined>();
  // The Interview filter the shown list was loaded with. A move sends this one, not the header's
  // newest selection, so a click before a new list arrives counts places in the list on screen.
  const [shownFilter, setShownFilter] = useState<string | null>(selectedInterviewId);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<unknown>();
  const [changeError, setChangeError] = useState<unknown>();
  // While a change is on its way, the list may be out of date, so its buttons wait.
  const [busy, setBusy] = useState(false);
  // The question waiting for the Interviewer to confirm its deletion.
  const [toDelete, setToDelete] = useState<SavedQuestion | undefined>();
  // The Interview new questions are tagged with. It follows the header's selection.
  const [tag, setTag] = useState<string | null>(selectedInterviewId);
  const [followedSelection, setFollowedSelection] = useState(selectedInterviewId);
  // The Interview a just-added or re-tagged question went to, when the current filter hides it.
  const [hiddenInterviewId, setHiddenInterviewId] = useState<string | null>(null);
  if (followedSelection !== selectedInterviewId) {
    setFollowedSelection(selectedInterviewId);
    setTag(selectedInterviewId);
    setHiddenInterviewId(null);
  }
  // Where each question was asked, or not found, in the Interviews whose Asked Questions were found.
  const [checks, setChecks] = useState<SavedQuestionCheck[]>([]);
  // The exchange opened from "Asked in …".
  const [exchange, setExchange] = useState<AskedQuestion | undefined>();
  // Only the newest list request may fill the list, so a slow answer for an earlier selection
  // cannot show the wrong Interview's questions.
  const latestLoad = useRef(0);

  // If core's new list leaves out a question that was just added or re-tagged, the filter hides
  // it, and the panel says where it went instead of letting the question seem to vanish.
  const reload = useCallback(
    (changed?: SavedQuestion) => {
      const thisLoad = ++latestLoad.current;
      return api.listSavedQuestions(candidateId, selectedInterviewId).then(
        (list) => {
          if (thisLoad !== latestLoad.current) return;
          setQuestions(list);
          setShownFilter(selectedInterviewId);
          setLoadFailed(false);
          setHiddenInterviewId(changed && !list.some((q) => q.id === changed.id) ? changed.interviewId : null);
        },
        () => {
          if (thisLoad !== latestLoad.current) return;
          setLoadFailed(true);
          setHiddenInterviewId(null);
        },
      );
    },
    [candidateId, selectedInterviewId],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  // Read again when questions are found and after every change here, since a deleted question loses its checks.
  const [changeCount, setChangeCount] = useState(0);
  useEffect(() => {
    api.listSavedQuestionChecks(candidateId).then(setChecks, () => setChecks([]));
  }, [candidateId, askedVersion, changeCount]);

  async function add() {
    setSaving(true);
    setAddError(undefined);
    setChangeError(undefined);
    let added: SavedQuestion | undefined;
    try {
      added = await api.addSavedQuestion(candidateId, tag, draft);
      setDraft("");
    } catch (error) {
      // The text stays in the box, so nothing the Interviewer wrote is lost.
      setAddError(error);
    } finally {
      setSaving(false);
    }
    await reload(added);
  }

  // Runs one change to an existing question, then shows the list as core has it. A change that
  // gives back the question is checked against the new list, so a re-tag the filter hides is told.
  async function change(run: () => Promise<SavedQuestion | void>): Promise<boolean> {
    setChangeError(undefined);
    setAddError(undefined);
    setBusy(true);
    let ok = true;
    let changed: SavedQuestion | undefined;
    try {
      changed = (await run()) ?? undefined;
    } catch (error) {
      ok = false;
      setChangeError(error);
    }
    await reload(changed);
    setChangeCount((count) => count + 1);
    setBusy(false);
    return ok;
  }

  function confirmDelete() {
    if (!toDelete) return;
    const id = toDelete.id;
    setToDelete(undefined);
    change(() => api.deleteSavedQuestion(id));
  }

  const hiddenInterview = interviews.find((interview) => interview.id === hiddenInterviewId);

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
        // Wrapped so the React lint does not take add, which reads a ref, as called during render.
        onKeyDown={(event) => onEnter(add)(event)}
      />
      <div className="question-entry-meta">
        <InterviewTagSelect interviews={interviews} value={tag} onChange={setTag} />
      </div>
      {addError !== undefined && <p className="error">{refusalMessage(t, addError, t.saveFailed)}</p>}
      {changeError !== undefined && <p className="error">{refusalMessage(t, changeError, t.changeFailed)}</p>}
      {hiddenInterview && (
        <p className="notice" role="status">
          {fill(t.hiddenByFilter, { interview: interviewName(text, hiddenInterview) })}{" "}
          <button type="button" className="link-button" onClick={onShowAll}>
            {t.showAll}
          </button>
        </p>
      )}
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
              interviews={interviews}
              checks={checks.filter((check) => check.savedQuestionId === question.id)}
              onOpenExchange={setExchange}
              onMove={(position) => change(() => api.moveSavedQuestion(question.id, position, shownFilter)).then(() => {})}
              onEdit={(newText) => change(() => api.editSavedQuestion(question.id, newText))}
              onTag={(interviewId) => change(() => api.tagSavedQuestion(question.id, interviewId)).then(() => {})}
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
        sourceVersion={sourceVersion}
        onAccepted={() => void reload()}
      />
      {exchange && (
        <ExchangeDialog
          askedQuestion={exchange}
          onOpenInTranscript={() => onShowInTranscript(exchange.interviewId, exchange.firstSegment)}
          onClose={() => setExchange(undefined)}
        />
      )}
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
  interviews: Interview[];
  checks: SavedQuestionCheck[];
  onOpenExchange: (askedQuestion: AskedQuestion) => void;
  position: number;
  isFirst: boolean;
  isLast: boolean;
  onMove: (position: number) => void;
  onEdit: (text: string) => Promise<boolean>;
  onTag: (interviewId: string | null) => void;
  onDelete: () => void;
  busy: boolean;
}

function QuestionItem({ question, interviews, checks, onOpenExchange, position, isFirst, isLast, onMove, onEdit, onTag, onDelete, busy }: QuestionItemProps) {
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
      <span className="question-meta">
        <InterviewTagSelect interviews={interviews} value={question.interviewId} onChange={onTag} />
        <span className="question-origin">{question.origin === "written" ? t.writtenByYou : t.fromSuggestion}</span>
      </span>
      {checks.length > 0 && (
        <span className="question-checks">
          {checks.map((check) => {
            const interview = interviews.find((i) => i.id === check.interviewId);
            if (!interview) return null;
            const name = interviewName(text, interview);
            return check.askedQuestion ? (
              <button
                key={check.interviewId}
                type="button"
                className="link-button question-asked"
                onClick={() => onOpenExchange(check.askedQuestion!)}
              >
                {fill(t.askedIn, { interview: name })}
              </button>
            ) : (
              <span
                key={check.interviewId}
                className={check.stale ? "question-not-found stale" : "question-not-found"}
                title={check.stale ? text.panels.askedQuestions.stale : t.notFoundHint}
              >
                {fill(t.notFoundIn, { interview: name })}
              </span>
            );
          })}
        </span>
      )}
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
