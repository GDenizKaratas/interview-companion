import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { api, type Candidate } from "./api.ts";
import { candidatePath, navigate } from "./navigation.ts";
import { text } from "./text.ts";

export function CandidateList() {
  const [candidates, setCandidates] = useState<Candidate[] | undefined>();
  const [loadError, setLoadError] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [saveError, setSaveError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.listCandidates().then(setCandidates, () => setLoadError(true));
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaveError(undefined);
    try {
      const created = await api.createCandidate({ name, role });
      setCandidates((current) => [created, ...(current ?? [])]);
      setName("");
      setRole("");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : text.candidates.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  function open(event: MouseEvent, id: string) {
    event.preventDefault();
    navigate(candidatePath(id));
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1>{text.appName}</h1>
      </header>
      <h2>{text.candidates.title}</h2>
      <form className="candidate-form" onSubmit={handleSubmit}>
        <label>
          {text.candidates.nameLabel}
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          {text.candidates.roleLabel}
          <input value={role} onChange={(e) => setRole(e.target.value)} />
        </label>
        <button type="submit" disabled={saving}>
          {text.candidates.add}
        </button>
      </form>
      {saveError && <p className="error">{saveError}</p>}
      {loadError && <p className="error">{text.candidates.loadFailed}</p>}
      {candidates && candidates.length === 0 && <p className="empty">{text.candidates.empty}</p>}
      {candidates && candidates.length > 0 && (
        <ul className="candidate-list">
          {candidates.map((candidate) => (
            <li key={candidate.id}>
              <a href={candidatePath(candidate.id)} onClick={(e) => open(e, candidate.id)}>
                <strong>{candidate.name}</strong> · {candidate.role}
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
