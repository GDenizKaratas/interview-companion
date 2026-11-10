import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { AddButton } from "./AddButton.tsx";
import { api, ApiError, type Candidate } from "./api.ts";
import { cvRefusalMessage } from "./cv-refusal.ts";
import { candidatePath, linkTo } from "./navigation.ts";
import type { Text } from "./languages.ts";
import { useText } from "./text.tsx";

export function CandidateList() {
  const { text } = useText();
  const [candidates, setCandidates] = useState<Candidate[] | undefined>();
  const [roles, setRoles] = useState<string[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [saveError, setSaveError] = useState<unknown>();
  const [saving, setSaving] = useState(false);
  // The optional CV. Choosing one fills the name box with core's guess.
  const [cv, setCv] = useState<File | undefined>();
  const cvInput = useRef<HTMLInputElement>(null);
  // The last guess put in the name box. A name the Interviewer typed is never replaced.
  const lastGuess = useRef("");
  // Only the guess for the most recently chosen file may fill the box.
  const guessFor = useRef<File | undefined>(undefined);

  useEffect(() => {
    api.listCandidates().then(setCandidates, () => setLoadError(true));
    loadRoles();
  }, []);

  // Earlier roles are only suggestions; if they cannot be loaded the form still works.
  function loadRoles() {
    api.listCandidateRoles().then(setRoles, () => {});
  }

  function handleCvChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
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
      const created = cv ? await api.createCandidateWithCv({ name, role }, cv) : await api.createCandidate({ name, role });
      setCandidates((current) => [created, ...(current ?? [])]);
      loadRoles();
      setName("");
      setRole("");
      clearCv();
    } catch (error) {
      setSaveError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page">
      <h1 className="page-title">{text.candidates.title}</h1>
      <form className="candidate-form" onSubmit={handleSubmit}>
        <label>
          {text.candidates.nameLabel}
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          {text.candidates.roleLabel}
          <input value={role} onChange={(e) => setRole(e.target.value)} list="known-roles" autoComplete="off" />
          <datalist id="known-roles">
            {roles.map((knownRole) => (
              <option key={knownRole} value={knownRole} />
            ))}
          </datalist>
        </label>
        {/* The browser's own file box speaks the system's language, so it stays hidden behind a button. */}
        <div className="cv-choice">
          <span>{text.candidates.cvLabel}</span>
          <span className="cv-choice-row">
            <input ref={cvInput} type="file" accept="application/pdf,.pdf" hidden onChange={handleCvChosen} />
            {/* Once a file is chosen, the button shows its name; clicking it chooses another. */}
            <button
              type="button"
              className="secondary cv-choose"
              title={cv?.name}
              onClick={() => cvInput.current?.click()}
            >
              {cv ? cv.name : text.candidates.cvChoose}
            </button>
            {cv && (
              <button type="button" className="quiet" onClick={clearCv}>
                {text.candidates.cvRemove}
              </button>
            )}
          </span>
        </div>
        <AddButton type="submit" disabled={saving}>
          {text.candidates.add}
        </AddButton>
      </form>
      {cv && saveError === undefined && <p className="form-hint">{text.candidates.cvHint}</p>}
      {saveError !== undefined && <p className="error">{refusalMessage(text, saveError)}</p>}
      {loadError && <p className="error">{text.candidates.loadFailed}</p>}
      {candidates && candidates.length === 0 && <p className="empty">{text.candidates.empty}</p>}
      {candidates && candidates.length > 0 && (
        <ul className="candidate-list">
          {candidates.map((candidate) => (
            <li key={candidate.id}>
              <a href={candidatePath(candidate.id)} onClick={linkTo(candidatePath(candidate.id))}>
                <strong>{candidate.name}</strong> · {candidate.role}
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
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
