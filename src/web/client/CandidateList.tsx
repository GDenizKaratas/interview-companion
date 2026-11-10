import { useEffect, useState, type FormEvent } from "react";
import { AddButton } from "./AddButton.tsx";
import { api, ApiError, type Candidate } from "./api.ts";
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

  useEffect(() => {
    api.listCandidates().then(setCandidates, () => setLoadError(true));
    loadRoles();
  }, []);

  // Earlier roles are only suggestions; if they cannot be loaded the form still works.
  function loadRoles() {
    api.listCandidateRoles().then(setRoles, () => {});
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaveError(undefined);
    try {
      const created = await api.createCandidate({ name, role });
      setCandidates((current) => [created, ...(current ?? [])]);
      loadRoles();
      setName("");
      setRole("");
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
        <AddButton type="submit" disabled={saving}>
          {text.candidates.add}
        </AddButton>
      </form>
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
  if (error instanceof ApiError && error.rule === "required") {
    const messages: Record<string, string> = text.candidates.required;
    const message = error.field !== undefined && Object.hasOwn(messages, error.field) ? messages[error.field] : undefined;
    if (message) return message;
  }
  return text.candidates.saveFailed;
}
