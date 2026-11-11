import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { AddButton } from "./AddButton.tsx";
import { useAddManyCandidates } from "./AddManyCandidates.tsx";
import { api, ApiError } from "./api.ts";
import { cvRefusalMessage } from "./cv-refusal.ts";
import type { Text } from "./languages.ts";
import { ModalDialog } from "./ModalDialog.tsx";
import type { PickedFiles } from "./picked-files.ts";
import { useText } from "./text.tsx";

// The dialog that adds Candidates, over the Candidate list, in one of two ways: one Candidate
// (name, role, and an optional CV), or many from their CVs with one role. The first also offers
// importing a Candidate export instead. It closes once the Candidates are saved.
export function AddCandidateDialog({
  roles,
  initialFiles,
  onAdded,
  onImport,
  onClose,
}: {
  roles: string[];
  // CVs dropped on the Candidate list: the dialog opens on the many way with them listed.
  initialFiles?: PickedFiles;
  // Candidates were added. With a role, the Interviewer asked to see that role's new Candidates.
  onAdded: (show?: { role: string }) => void;
  // The Interviewer wants to import a Candidate export instead.
  onImport: () => void;
  onClose: () => void;
}) {
  const { text } = useText();
  const formId = useId();
  const rolesId = useId();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [way, setWay] = useState<"one" | "many">(initialFiles ? "many" : "one");
  const [saveError, setSaveError] = useState<unknown>();
  const [saving, setSaving] = useState(false);
  // The optional CV. Choosing one fills the name box with core's guess.
  const [cv, setCv] = useState<File | undefined>();
  const cvInput = useRef<HTMLInputElement>(null);
  // The last guess put in the name box. A name the Interviewer typed is never replaced.
  const lastGuess = useRef("");
  // Only the guess for the most recently chosen file may fill the box.
  const guessFor = useRef<File | undefined>(undefined);
  const roleIsNew = useRoleIsNew(role);

  const roleField = (
    <label>
      {text.candidates.roleLabel}
      <input value={role} onChange={(e) => setRole(e.target.value)} list={rolesId} autoComplete="off" />
      <datalist id={rolesId}>
        {roles.map((knownRole) => (
          <option key={knownRole} value={knownRole} />
        ))}
      </datalist>
      {roleIsNew && <span className="form-hint role-hint">{text.candidates.newRole}</span>}
    </label>
  );

  const many = useAddManyCandidates({ role, roleField, shown: way === "many", initialFiles, onAdded, onClose });

  function handleCvChosen(event: ChangeEvent<HTMLInputElement>) {
    const chosen = [...(event.target.files ?? [])];
    // Several CVs chosen here mean several Candidates: the many way lists them.
    if (chosen.length > 1) {
      many.addFiles(chosen);
      event.target.value = "";
      setWay("many");
      return;
    }
    const file = chosen[0];
    setCv(file);
    setSaveError(undefined);
    guessFor.current = file;
    if (!file) return;
    // The guess is only a suggestion; if it fails, the Interviewer types the name.
    api.guessCandidateName(file).then(({ name: guess }) => {
      if (guessFor.current !== file || guess === "") return;
      setName((current) => (current.trim() === "" || current === lastGuess.current ? guess : current));
      lastGuess.current = guess;
    }, () => {});
  }

  function clearCv() {
    setCv(undefined);
    guessFor.current = undefined;
    lastGuess.current = "";
    if (cvInput.current) cvInput.current.value = "";
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaveError(undefined);
    try {
      if (cv) await api.createCandidateWithCv({ name, role }, cv);
      else await api.createCandidate({ name, role });
      onAdded();
    } catch (error) {
      setSaveError(error);
      setSaving(false);
    }
  }

  const wayChoice = (
    <div className="view-choice add-way-choice" role="group" aria-label={text.candidates.ways.label}>
      {(["one", "many"] as const).map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={way === key}
          className={way === key ? "role-choice chosen" : "role-choice"}
          disabled={many.locked}
          onClick={() => setWay(key)}
        >
          {text.candidates.ways[key]}
        </button>
      ))}
    </div>
  );

  if (way === "many") {
    return (
      <ModalDialog title={text.candidates.addTitle} kind="form" wide large onCancel={many.requestClose} actions={many.actions}>
        {wayChoice}
        {many.content}
        {many.confirmDialog}
      </ModalDialog>
    );
  }

  return (
    <ModalDialog
      title={text.candidates.addTitle}
      kind="form"
      wide
      onCancel={many.close}
      actions={
        <>
          <button type="button" className="secondary" onClick={many.close}>
            {text.candidates.cancel}
          </button>
          <AddButton type="submit" form={formId} disabled={saving}>
            {text.candidates.add}
          </AddButton>
        </>
      }
    >
      {wayChoice}
      <form id={formId} className="candidate-form" onSubmit={handleSubmit}>
        <label>
          {text.candidates.nameLabel}
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        {roleField}
        {/* The browser's own file box speaks the system's language, so it stays hidden behind a button. */}
        <div className="cv-choice">
          <span>{text.candidates.cvLabel}</span>
          <span className="cv-choice-row">
            <input ref={cvInput} type="file" accept="application/pdf,.pdf" multiple hidden onChange={handleCvChosen} />
            {/* Once a file is chosen, the button shows its name; clicking it chooses another. */}
            <button type="button" className="secondary cv-choose" title={cv?.name} onClick={() => cvInput.current?.click()}>
              {cv ? cv.name : text.candidates.cvChoose}
            </button>
            {cv && (
              <button type="button" className="quiet" onClick={clearCv}>
                {text.candidates.cvRemove}
              </button>
            )}
          </span>
        </div>
        {cv && saveError === undefined && <p className="form-hint">{text.candidates.cvHint}</p>}
        {saveError !== undefined && <p className="error">{refusalMessage(text, saveError)}</p>}
      </form>
      <p className="import-instead">
        <button type="button" className="link-button" onClick={onImport}>
          {text.importCandidate.fromFile}
        </button>
      </p>
    </ModalDialog>
  );
}

// Whether no Candidate has the role typed yet. Core compares the roles; the answer comes a moment
// after typing pauses, and an answer to an older role is ignored. Nothing is said about an empty
// role, or when core cannot be asked.
function useRoleIsNew(role: string): boolean {
  const [answer, setAnswer] = useState<{ role: string; isNew: boolean } | undefined>();
  useEffect(() => {
    if (role.trim() === "") return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api.isRoleInUse(role, controller.signal).then(
        ({ inUse }) => setAnswer({ role, isNew: !inUse }),
        () => {},
      );
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [role]);
  return role.trim() !== "" && answer?.role === role && answer.isNew;
}

// Core decides whether a Candidate is valid; this only says why, in the current language.
// The message is worked out when shown, so it follows a change of language.
function refusalMessage(text: Text, error: unknown): string {
  if (error instanceof ApiError && error.field === "cv") return cvRefusalMessage(text, error);
  if (error instanceof ApiError && error.rule === "required") {
    const messages: Record<string, string> = text.candidates.required;
    const message = error.field !== undefined && Object.hasOwn(messages, error.field) ? messages[error.field] : undefined;
    if (message) return message;
  }
  return text.candidates.saveFailed;
}
