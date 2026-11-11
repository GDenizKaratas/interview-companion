import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { api, ApiError, type AskedQuestion, type Interview, type QuestionMark, type SavedQuestion, type SavedQuestionCheck, type SavedQuestionState } from "./api.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { onEnter } from "./enter-key.ts";
import { ExchangeDialog } from "./ExchangeDialog.tsx";
import { interviewName } from "./interview-names.ts";
import { InterviewTagSelect } from "./InterviewTagSelect.tsx";
import { RoleQuestionsDialog } from "./RoleQuestionsDialog.tsx";
import { SuggestedQuestions } from "./SuggestedQuestions.tsx";
import { fill, type Text } from "./languages.ts";
import { useText } from "./text.tsx";

interface SavedQuestionsProps {
  candidateId: string;
  // The Candidate's role, whose Role Questions can be opened and added from here.
  role: string;
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

// The Questions card: the Interviewer's own question list for one Candidate, and the Suggested
// Questions in a second tab. Each question shows whether it was asked, not found, or is planned, on
// a button that sets the Interviewer's own mark; core works out the state. Core keeps the order; after every change the list is fetched again, so the screen
// always shows what core has saved. Core applies the header's Interview filter, as for My Notes.
export function SavedQuestions({
  candidateId,
  role,
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
  // The question waiting for the Interviewer to confirm "not asked" against what the Transcripts say.
  const [toMarkNotAsked, setToMarkNotAsked] = useState<SavedQuestion | undefined>();
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
  // Core's one state for each question: asked, not found, or planned.
  const [states, setStates] = useState<SavedQuestionState[]>([]);
  const [tab, setTab] = useState<"saved" | "suggested">("saved");
  // Suggested Questions load only once their tab has been opened.
  const [suggestionsOpened, setSuggestionsOpened] = useState(false);
  // The exchange opened from "Asked in …".
  const [exchange, setExchange] = useState<AskedQuestion | undefined>();
  // Only the newest list request may fill the list, so a slow answer for an earlier selection
  // cannot show the wrong Interview's questions.
  const latestLoad = useRef(0);
  // How many of the role's questions were never copied to this Candidate.
  const [missingRoleQuestions, setMissingRoleQuestions] = useState(0);
  const [roleQuestionsOpen, setRoleQuestionsOpen] = useState(false);

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
    let current = true;
    api.listSavedQuestionChecks(candidateId).then(
      (loaded) => current && setChecks(loaded),
      () => current && setChecks([]),
    );
    api.listSavedQuestionStates(candidateId).then(
      (loaded) => current && setStates(loaded),
      () => current && setStates([]),
    );
    return () => {
      current = false;
    };
  }, [candidateId, askedVersion, changeCount]);

  // Read again after every change here and whenever the Role Questions dialog closes.
  useEffect(() => {
    if (roleQuestionsOpen) return;
    let current = true;
    api.listMissingRoleQuestions(candidateId).then(
      (missing) => current && setMissingRoleQuestions(missing.length),
      () => current && setMissingRoleQuestions(0),
    );
    return () => {
      current = false;
    };
  }, [candidateId, changeCount, roleQuestionsOpen]);

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

  // Counted over the questions on screen, so the line agrees with the list under it.
  const stateOf = (question: SavedQuestion): SavedQuestionState =>
    states.find((state) => state.savedQuestionId === question.id) ?? {
      savedQuestionId: question.id,
      state: "planned",
      decidedBy: "transcripts",
      transcriptState: "planned",
      differsFromTranscripts: false,
    };
  const askedCount = questions?.filter((question) => stateOf(question).state === "asked").length ?? 0;

  const mark = (question: SavedQuestion, value: QuestionMark | null) => change(() => api.markSavedQuestion(question.id, value)).then(() => {});

  // One click on the state mark: asked, or not asked for a question that counts as asked. Saying
  // "not asked" against an Asked Question found in a Transcript is asked about first.
  function toggleMark(question: SavedQuestion) {
    const state = stateOf(question);
    if (state.state !== "asked") void mark(question, "asked");
    else if (state.transcriptState === "asked") setToMarkNotAsked(question);
    else void mark(question, "notAsked");
  }

  function confirmNotAsked() {
    if (!toMarkNotAsked) return;
    const question = toMarkNotAsked;
    setToMarkNotAsked(undefined);
    void mark(question, "notAsked");
  }

  // The Interviews in which the question waiting for that confirmation was found asked.
  const foundAskedIn = checks
    .filter((check) => check.savedQuestionId === toMarkNotAsked?.id && check.askedQuestion !== null)
    .flatMap((check) => interviews.find((interview) => interview.id === check.interviewId) ?? [])
    .map((interview) => interviewName(text, interview))
    .join(", ");

  return (
    <>
      <div className="card-tabs" role="group" aria-label={t.title}>
        {(["saved", "suggested"] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            className={tab === key ? "ai-tab selected" : "ai-tab"}
            onClick={() => {
              setTab(key);
              if (key === "suggested") setSuggestionsOpened(true);
            }}
          >
            {key === "saved" ? t.savedTab : t.suggestions.open}
          </button>
        ))}
        {tab === "saved" && questions && questions.length > 0 && (
          <span className="asked-count">{fill(t.askedCount, { asked: String(askedCount), total: String(questions.length) })}</span>
        )}
      </div>
      <div className="tab-pane" hidden={tab !== "suggested"}>
        {suggestionsOpened && (
          <SuggestedQuestions
            candidateId={candidateId}
            interviews={interviews}
            sourceVersion={sourceVersion}
            onAccepted={() => {
              void reload();
              // The new question needs its state, too.
              setChangeCount((count) => count + 1);
            }}
          />
        )}
      </div>
      <div className="tab-pane" hidden={tab !== "saved"}>
      <textarea
        className="question-input"
        aria-label={t.newLabel}
        placeholder={t.placeholder}
        title={t.hint}
        rows={1}
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        // Wrapped so the React lint does not take add, which reads a ref, as called during render.
        onKeyDown={(event) => onEnter(add)(event)}
      />
      <div className="question-entry-meta">
        <InterviewTagSelect interviews={interviews} value={tag} onChange={setTag} />
        <button type="button" className="link-button role-questions-open" onClick={() => setRoleQuestionsOpen(true)}>
          {text.roleQuestions.open}
        </button>
      </div>
      {missingRoleQuestions > 0 && (
        <p className="notice" role="status">
          {fill(text.roleQuestions.missingForCandidate, { count: String(missingRoleQuestions) })}{" "}
          <button
            type="button"
            className="link-button"
            disabled={busy}
            onClick={() => void change(() => api.addMissingRoleQuestions(candidateId).then(() => {}))}
          >
            {text.roleQuestions.addMissing}
          </button>
        </p>
      )}
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
              state={stateOf(question)}
              onOpenExchange={setExchange}
              onToggleMark={() => toggleMark(question)}
              onUseFound={() => mark(question, null)}
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
      </div>
      {exchange && (
        <ExchangeDialog
          askedQuestion={exchange}
          onOpenInTranscript={() => onShowInTranscript(exchange.interviewId, exchange.firstSegment)}
          onClose={() => setExchange(undefined)}
        />
      )}
      {roleQuestionsOpen && (
        <RoleQuestionsDialog
          initialRole={role}
          onClose={() => {
            setRoleQuestionsOpen(false);
            void reload();
          }}
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
      {toMarkNotAsked && (
        <ConfirmDialog
          title={t.confirmNotAsked}
          confirmLabel={t.markNotAsked}
          cancelLabel={t.cancel}
          onConfirm={confirmNotAsked}
          onCancel={() => setToMarkNotAsked(undefined)}
        >
          <p className="question-text">{toMarkNotAsked.text}</p>
          <p className="hint">{fill(t.confirmNotAskedDetail, { interviews: foundAskedIn })}</p>
        </ConfirmDialog>
      )}
    </>
  );
}

interface QuestionItemProps {
  question: SavedQuestion;
  interviews: Interview[];
  checks: SavedQuestionCheck[];
  state: SavedQuestionState;
  onOpenExchange: (askedQuestion: AskedQuestion) => void;
  // Sets the Interviewer's mark to the opposite of the state shown.
  onToggleMark: () => void;
  // Removes the Interviewer's mark, so the state follows the Transcripts again.
  onUseFound: () => void;
  position: number;
  isFirst: boolean;
  isLast: boolean;
  onMove: (position: number) => void;
  onEdit: (text: string) => Promise<boolean>;
  onTag: (interviewId: string | null) => void;
  onDelete: () => void;
  busy: boolean;
}

function QuestionItem({ question, interviews, checks, state: questionState, onOpenExchange, onToggleMark, onUseFound, position, isFirst, isLast, onMove, onEdit, onTag, onDelete, busy }: QuestionItemProps) {
  const { text } = useText();
  const t = text.panels.questions;
  const [editing, setEditing] = useState<string | undefined>();
  const { state } = questionState;

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
    <li className={`question ${state}`}>
      <button
        type="button"
        className="question-state"
        aria-pressed={state === "asked"}
        aria-label={t.states.asked}
        title={state === "asked" ? t.markNotAskedTitle : fill(t.markAskedTitle, { state: t.states[state] })}
        disabled={busy}
        onClick={onToggleMark}
      >
        <StateIcon state={state} />
      </button>
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
        <span className="question-origin">{originLabel(t, question)}</span>
      </span>
      {(state === "planned" || questionState.differsFromTranscripts || checks.length > 0) && (
        <span className="question-checks">
          {/* A question the Interviewer marked as not asked says so, in their words, not "planned". */}
          {state === "planned" && <span className="pill planned">{question.mark === "notAsked" ? t.markedNotAsked : t.states.planned}</span>}
          {questionState.differsFromTranscripts && (
            <span className="question-own-mark" title={t.markedByYouHint}>
              {t.markedByYou}
              {" · "}
              <button type="button" className="link-button" disabled={busy} onClick={onUseFound}>
                {t.useFound}
              </button>
            </span>
          )}
          {checks.map((check) => {
            const interview = interviews.find((i) => i.id === check.interviewId);
            if (!interview) return null;
            const name = interviewName(text, interview);
            return check.askedQuestion ? (
              <button
                key={check.interviewId}
                type="button"
                className={check.stale ? "link-button question-asked stale" : "link-button question-asked"}
                title={check.stale ? text.panels.askedQuestions.stale : undefined}
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

// A filled circle with a check for asked, a dashed one for looked for and not found, an empty one for planned.
function StateIcon({ state }: { state: SavedQuestionState["state"] }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      {state === "asked" ? (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="M4.6 8.3l2.2 2.2 4.6-4.8" fill="none" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray={state === "notFound" ? "2.4 2.2" : undefined} />
      )}
    </svg>
  );
}

function originLabel(t: Text["panels"]["questions"], question: SavedQuestion): string {
  if (question.origin === "role") return t.fromRole;
  return question.origin === "written" ? t.writtenByYou : t.fromSuggestion;
}

// Core decides whether a question is valid; this only says why, in the current language.
function refusalMessage(t: Text["panels"]["questions"], error: unknown, fallback: string): string {
  return error instanceof ApiError && error.field === "text" && error.rule === "required" ? t.required : fallback;
}
