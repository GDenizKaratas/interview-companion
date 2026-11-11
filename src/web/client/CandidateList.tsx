import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent } from "react";
import { AddButton } from "./AddButton.tsx";
import { api, ApiError, type CandidateOverview } from "./api.ts";
import { cvRefusalMessage } from "./cv-refusal.ts";
import { CvPreviewDialog } from "./CvPreviewDialog.tsx";
import { ExpandableCard } from "./ExpandableCard.tsx";
import { InterviewCalendar } from "./InterviewCalendar.tsx";
import { interviewName } from "./interview-names.ts";
import { candidatePath, linkTo, navigate } from "./navigation.ts";
import { fill, type Text } from "./languages.ts";
import { NoKeyGuide } from "./NoKeyGuide.tsx";
import { RoleQuestionsDialog } from "./RoleQuestionsDialog.tsx";
import { useText } from "./text.tsx";

// The home page: every Candidate in one table with the form to add one, and beside it the
// calendar of all Interviews and how to use AI without an API key.
export function CandidateList() {
  const { text } = useText();
  const [candidates, setCandidates] = useState<CandidateOverview[] | undefined>();
  const [filter, setFilter] = useState("");
  // The Candidate whose CV is open over the list.
  const [cvOf, setCvOf] = useState<CandidateOverview["candidate"] | undefined>();
  const [roles, setRoles] = useState<string[]>([]);
  const [roleQuestionsOpen, setRoleQuestionsOpen] = useState(false);
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
    loadCandidates();
    loadRoles();
  }, []);

  function loadCandidates() {
    api.listCandidateOverviews().then(setCandidates, () => setLoadError(true));
  }

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
      if (cv) await api.createCandidateWithCv({ name, role }, cv);
      else await api.createCandidate({ name, role });
      loadCandidates();
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

  const t = text.home;
  const needle = folded(filter.trim());
  const shown = candidates?.filter(
    ({ candidate }) => needle === "" || folded(candidate.name).includes(needle) || folded(candidate.role).includes(needle),
  );

  return (
    <main className="home">
      <section className="home-main" aria-labelledby="candidates-title">
        <header className="section-head">
          <h1 id="candidates-title">
            {text.candidates.title}
            {candidates && <span className="count">{candidates.length}</span>}
          </h1>
          <input
            type="search"
            className="filter"
            value={filter}
            placeholder={t.filterPlaceholder}
            aria-label={t.filterLabel}
            onChange={(event) => setFilter(event.target.value)}
          />
          <button type="button" className="quiet" onClick={() => setRoleQuestionsOpen(true)}>
            {text.roleQuestions.open}
          </button>
        </header>
        <form className="candidate-form card" onSubmit={handleSubmit}>
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
        {shown && candidates!.length > 0 && shown.length === 0 && <p className="empty">{t.noMatch}</p>}
        {shown && shown.length > 0 && (
          <table className="candidate-table card">
            <thead>
              <tr>
                <th>{t.columns.candidate}</th>
                <th>{t.columns.interviews}</th>
                <th>{t.columns.next}</th>
                <th>{t.columns.cv}</th>
                <th className="number">{t.columns.notes}</th>
                <th className="number">{t.columns.questions}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((overview) => (
                <CandidateRow key={overview.candidate.id} overview={overview} onViewCv={() => setCvOf(overview.candidate)} />
              ))}
            </tbody>
          </table>
        )}
        {roleQuestionsOpen && (
          <RoleQuestionsDialog
            initialRole={role.trim()}
            onClose={() => {
              setRoleQuestionsOpen(false);
              // A role that now has questions is suggested in the form; copies change question counts.
              loadRoles();
              loadCandidates();
            }}
          />
        )}
        {cvOf && <CvPreviewDialog candidate={cvOf} onClose={() => setCvOf(undefined)} onChanged={loadCandidates} />}
      </section>
      <aside className="home-side">
        {candidates && <InterviewCalendar overviews={candidates} />}
        <ExpandableCard className="panel no-key-card" title={text.noKey.title}>
          <NoKeyGuide withTitle={false} />
        </ExpandableCard>
      </aside>
    </main>
  );
}

// One Candidate in the table. The whole row opens the Workspace; the name is the real link,
// so it also works with the keyboard and opens in a new tab.
function CandidateRow({ overview, onViewCv }: { overview: CandidateOverview; onViewCv: () => void }) {
  const { text, languageCode } = useText();
  const t = text.home;
  const { candidate, cv, interviews } = overview;
  const path = candidatePath(candidate.id);
  const planned = interviews.filter((interview) => interview.planned);
  // Core lists Interviews in date order, so the first Planned one is the next.
  const next = planned[0];
  const dateFormat = new Intl.DateTimeFormat(languageCode, { day: "numeric", month: "short", weekday: "short", timeZone: "UTC" });
  return (
    <tr onClick={(event) => openRow(event, path)}>
      <td>
        <a className="candidate-name" href={path} onClick={linkTo(path)}>
          {candidate.name}
        </a>
        <span className="candidate-role">{candidate.role}</span>
      </td>
      <td>
        <Count value={interviews.length} />
        {planned.length > 0 && <span className="pill planned">{fill(t.plannedCount, { count: String(planned.length) })}</span>}
      </td>
      <td>
        {next ? (
          <>
            {dateFormat.format(new Date(`${next.date}T00:00:00Z`))}
            <span className="muted"> · {interviewName(text, next)}</span>
          </>
        ) : (
          <span className="muted">{t.noNext}</span>
        )}
      </td>
      <td>
        {cv ? (
          <button type="button" className="quiet cv-shortcut" title={cv.fileName} onClick={onViewCv}>
            <DocumentIcon />
            {t.viewCv}
          </button>
        ) : (
          <Count value={0} />
        )}
      </td>
      <td className="number">
        <Count value={overview.interviewerNoteCount} />
      </td>
      <td className="number">
        <Count value={overview.savedQuestionCount} />
      </td>
    </tr>
  );
}

// A number in the table, or a quiet dash for none, so the eye finds what is there.
function Count({ value }: { value: number }) {
  return value === 0 ? <span className="muted">—</span> : <>{value}</>;
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 1.75h5.25L12.5 5v9.25H4zM9 1.75V5.25h3.5M6 8.25h4.5M6 10.75h4.5" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  );
}

// A click anywhere on a row opens the Workspace, like its name link: with Ctrl or Cmd in a new
// tab. A click that ends a text selection, or one on a link or button in the row, does nothing more.
function openRow(event: MouseEvent, path: string) {
  if ((event.target as Element).closest("a, button") || window.getSelection()?.toString()) return;
  if (event.metaKey || event.ctrlKey) window.open(path, "_blank");
  else navigate(path);
}

// Text for the filter, so that case and the dotted and dotless i do not matter: "elif" finds
// "ELİF", and "ivan" finds "IVAN". Only for this filter; the Evidence search has its own rule in core.
function folded(value: string): string {
  return value.toLocaleLowerCase("tr").replaceAll("ı", "i");
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
