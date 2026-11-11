import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { api, ApiError, type RoleQuestion, type RoleQuestionList } from "./api.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { fill } from "./languages.ts";
import { useText } from "./text.tsx";

interface RoleQuestionsDialogProps {
  // The role shown first, such as the open Candidate's role. Empty to let the Interviewer choose.
  initialRole: string;
  onClose: () => void;
  // Called after any change that may have given Candidates new Saved Questions.
  onChanged?: () => void;
}

// The one place to manage each role's questions, opened as a modal from the Candidate list and
// from the Questions panel. Core matches the role and keeps the order; after every change the
// list is fetched again, so the dialog always shows what core has saved.
export function RoleQuestionsDialog({ initialRole, onClose, onChanged }: RoleQuestionsDialogProps) {
  const { text } = useText();
  const t = text.roleQuestions;
  const dialog = useRef<HTMLDialogElement>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [role, setRole] = useState(initialRole);
  const [list, setList] = useState<RoleQuestionList | undefined>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [addedTo, setAddedTo] = useState<number | undefined>();
  const [toDelete, setToDelete] = useState<RoleQuestion | undefined>();
  // Only the newest request may fill the list, so typing a role quickly never shows another role's list.
  const latestLoad = useRef(0);

  useEffect(() => {
    dialog.current?.showModal();
    // Earlier roles are only suggestions; if they cannot be loaded, a role can still be written.
    api.listCandidateRoles().then(setRoles, () => setRoles([]));
  }, []);

  const reload = useCallback(() => {
    const thisLoad = ++latestLoad.current;
    if (role.trim() === "") {
      setList(undefined);
      setLoadFailed(false);
      return Promise.resolve();
    }
    return api.listRoleQuestions(role).then(
      (loaded) => {
        if (thisLoad !== latestLoad.current) return;
        setList(loaded);
        setLoadFailed(false);
      },
      () => {
        if (thisLoad !== latestLoad.current) return;
        setLoadFailed(true);
      },
    );
  }, [role]);

  // Waits a moment after typing, so each letter does not start a request.
  useEffect(() => {
    const timer = setTimeout(() => void reload(), 200);
    return () => clearTimeout(timer);
  }, [reload]);

  async function change(run: () => Promise<unknown>, failure = t.changeFailed): Promise<boolean> {
    setBusy(true);
    setError(undefined);
    setAddedTo(undefined);
    let ok = true;
    try {
      await run();
    } catch (caught) {
      ok = false;
      setError(caught instanceof ApiError && caught.field === "text" && caught.rule === "required" ? t.required : failure);
    }
    await reload();
    setBusy(false);
    return ok;
  }

  async function add() {
    if (busy) return;
    if (await change(() => api.addRoleQuestion(role, draft))) {
      setDraft("");
      // A new role appears among the suggestions once it has a question.
      api.listCandidateRoles().then(setRoles, () => {});
    }
  }

  async function addToCandidates() {
    let count = 0;
    if (await change(async () => (count = (await api.addRoleQuestionsToCandidates(role)).candidates))) {
      setAddedTo(count);
      onChanged?.();
    }
  }

  function confirmDelete() {
    if (!toDelete) return;
    const id = toDelete.id;
    setToDelete(undefined);
    void change(() => api.deleteRoleQuestion(id));
  }

  const questions = list?.questions ?? [];
  const missing = list?.candidatesMissingQuestions ?? 0;

  return (
    <dialog
      ref={dialog}
      className="confirm-dialog settings-dialog role-questions-dialog"
      aria-labelledby="role-questions-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2 id="role-questions-title">{t.title}</h2>
      <label className="role-questions-role">
        {t.roleLabel}
        <input
          value={role}
          placeholder={t.rolePlaceholder}
          list="role-questions-roles"
          autoComplete="off"
          autoFocus={initialRole === ""}
          onChange={(event) => setRole(event.target.value)}
        />
        <datalist id="role-questions-roles">
          {roles.map((knownRole) => (
            <option key={knownRole} value={knownRole} />
          ))}
        </datalist>
      </label>
      <p className="settings-detail">{t.intro}</p>
      {role.trim() === "" && <p className="empty">{t.chooseRole}</p>}
      {loadFailed && <p className="error">{t.loadFailed}</p>}
      {list && (
        <>
          {questions.length === 0 ? (
            <p className="empty">{t.empty}</p>
          ) : (
            <ol className="question-list">
              {questions.map((question, index) => (
                <RoleQuestionItem
                  key={question.id}
                  question={question}
                  isFirst={index === 0}
                  isLast={index === questions.length - 1}
                  busy={busy}
                  onMove={(position) => void change(() => api.moveRoleQuestion(question.id, position))}
                  onEdit={(newText) => change(() => api.editRoleQuestion(question.id, newText))}
                  onDelete={() => setToDelete(question)}
                  position={index}
                />
              ))}
            </ol>
          )}
          <textarea
            className="question-input"
            aria-label={t.newLabel}
            placeholder={t.placeholder}
            title={text.panels.questions.hint}
            rows={2}
            value={draft}
            autoFocus={initialRole !== ""}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => onEnter(add)(event)}
          />
          {missing > 0 && (
            <p className="notice" role="status">
              {missing === 1 ? t.missingOne : fill(t.missing, { count: String(missing) })}{" "}
              <button type="button" className="link-button" disabled={busy} onClick={() => void addToCandidates()}>
                {t.addToThem}
              </button>
            </p>
          )}
          {addedTo !== undefined && addedTo > 0 && (
            <p className="notice" role="status">
              {addedTo === 1 ? t.addedToOne : fill(t.addedTo, { count: String(addedTo) })}
            </p>
          )}
        </>
      )}
      {error && <p className="error">{error}</p>}
      <div className="confirm-dialog-actions">
        <button type="button" onClick={onClose}>
          {t.close}
        </button>
      </div>
      {toDelete && (
        <ConfirmDialog
          title={t.confirmDelete}
          confirmLabel={t.delete}
          cancelLabel={t.cancel}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(undefined)}
        >
          <p className="question-text">{toDelete.text}</p>
          <p>{t.confirmDeleteDetail}</p>
        </ConfirmDialog>
      )}
    </dialog>
  );
}

interface RoleQuestionItemProps {
  question: RoleQuestion;
  position: number;
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
  onMove: (position: number) => void;
  onEdit: (text: string) => Promise<boolean>;
  onDelete: () => void;
}

function RoleQuestionItem({ question, position, isFirst, isLast, busy, onMove, onEdit, onDelete }: RoleQuestionItemProps) {
  const { text } = useText();
  const t = text.roleQuestions;
  const [editing, setEditing] = useState<string | undefined>();

  async function save() {
    if (editing === undefined || busy) return;
    // Keep the box open if core refused the text, so the Interviewer can fix it.
    if (await onEdit(editing)) setEditing(undefined);
  }

  function onEditKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Escape closes only the edit box, not the whole dialog.
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setEditing(undefined);
    } else onEnter(save)(event);
  }

  if (editing !== undefined) {
    return (
      <li className="question">
        <span className="question-edit">
          <textarea
            className="question-input"
            aria-label={t.edit}
            rows={2}
            value={editing}
            autoFocus
            onChange={(event) => setEditing(event.target.value)}
            onKeyDown={onEditKey}
          />
          <span className="question-actions">
            <button type="button" className="quiet" disabled={busy} onClick={() => void save()}>
              {t.save}
            </button>
            <button type="button" className="quiet" onClick={() => setEditing(undefined)}>
              {t.cancel}
            </button>
          </span>
        </span>
      </li>
    );
  }

  return (
    <li className="question">
      <span className="question-text">{question.text}</span>
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
    </li>
  );
}

// Enter saves; Shift+Enter adds a line break. Enter while composing is left alone.
function onEnter(run: () => void) {
  return (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      run();
    }
  };
}
