import { useEffect, useRef, useState, type MouseEvent } from "react";
import { AddButton } from "./AddButton.tsx";
import { AddCandidateDialog } from "./AddCandidateDialog.tsx";
import { api, type CandidateOverview, type DatedInterview, type Interview } from "./api.ts";
import { CvPreviewDialog } from "./CvPreviewDialog.tsx";
import { localDay, shortDay } from "./dates.ts";
import { ExpandableCard } from "./ExpandableCard.tsx";
import { NoKeyGuide } from "./NoKeyGuide.tsx";
import { ImportCandidate, type ImportCandidateHandle } from "./ImportCandidate.tsx";
import { InterviewCalendar } from "./InterviewCalendar.tsx";
import { interviewName } from "./interview-names.ts";
import { fill } from "./languages.ts";
import { candidatePath, linkTo, navigate } from "./navigation.ts";
import { RoleQuestionsDialog } from "./RoleQuestionsDialog.tsx";
import { useText } from "./text.tsx";

type View = "planned" | "all";

// The home page: the Candidates the Interviewer meets next, or all of them, in one table, and
// beside it the calendar of all Interviews.
export function CandidateList() {
  const { text } = useText();
  const [candidates, setCandidates] = useState<CandidateOverview[] | undefined>();
  const [dated, setDated] = useState<DatedInterview[] | undefined>();
  const [search, setSearch] = useState("");
  // The view the Interviewer chose. Until they choose, the page decides.
  const [chosenView, setChosenView] = useState<View | undefined>();
  // The Candidate whose CV is open over the list.
  const [cvOf, setCvOf] = useState<CandidateOverview["candidate"] | undefined>();
  const [roles, setRoles] = useState<string[]>([]);
  const [roleQuestionsOpen, setRoleQuestionsOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Opens the file chooser of the import, which lives on this page so it outlasts the add dialog.
  const importCandidate = useRef<ImportCandidateHandle>(null);

  useEffect(() => {
    loadCandidates();
    loadRoles();
  }, []);

  function loadCandidates() {
    Promise.all([api.listCandidateOverviews(), api.listDatedInterviews()]).then(
      ([overviews, interviews]) => {
        setCandidates(overviews);
        setDated(interviews);
      },
      () => setLoadError(true),
    );
  }

  // Earlier roles are only suggestions; if they cannot be loaded the form still works.
  function loadRoles() {
    api.listCandidateRoles().then(setRoles, () => {});
  }

  const t = text.home;
  // Candidates met today or with a Planned Interview, the one who is met soonest first. Core
  // gives the order, and says which Interviews are today or Planned. Today's stay all day, so
  // the list does not lose a Candidate when their Interview's time passes.
  const byId = new Map(candidates?.map((overview) => [overview.candidate.id, overview]));
  const plannedIds = [...new Set(dated?.filter((entry) => entry.today || entry.interview.planned).map(({ candidate }) => candidate.id))];
  const planned = plannedIds.flatMap((id) => byId.get(id) ?? []);
  // Opens on who comes next; with nothing Planned, on everyone, so the page is never empty.
  const view = chosenView ?? (planned.length > 0 ? "planned" : "all");
  const needle = folded(search.trim());
  // A search looks through every Candidate, whichever view is chosen: someone who is in the app
  // is always found.
  const shown = (view === "planned" && needle === "" ? planned : (candidates ?? [])).filter(
    ({ candidate }) => needle === "" || folded(candidate.name).includes(needle) || folded(candidate.role).includes(needle),
  );
  const undated = candidates?.reduce((n, overview) => n + overview.interviews.filter((i) => i.date === null).length, 0) ?? 0;

  return (
    <main className="home">
      <section className="home-main" aria-labelledby="candidates-title">
        <header className="section-head">
          <h1 id="candidates-title">
            {text.candidates.title}
            {candidates && <span className="count">{candidates.length}</span>}
          </h1>
          <span className="section-actions">
            <button type="button" className="secondary with-icon" title={text.roleQuestions.hint} onClick={() => setRoleQuestionsOpen(true)}>
              <ListIcon />
              {text.roleQuestions.open}
            </button>
            <AddButton onClick={() => setAdding(true)}>{text.candidates.add}</AddButton>
          </span>
        </header>
        <ImportCandidate ref={importCandidate} />
        {loadError && <p className="error">{text.candidates.loadFailed}</p>}
        {candidates && candidates.length === 0 && <p className="empty">{text.candidates.empty}</p>}
        {candidates && candidates.length > 0 && (
          <div className="candidate-tools">
            <label className="search-field">
              <SearchIcon />
              <input
                type="search"
                value={search}
                placeholder={t.searchPlaceholder}
                aria-label={t.searchLabel}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className="view-choice" role="group" aria-label={t.views.label}>
              {(["planned", "all"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={view === key}
                  className={view === key ? "role-choice chosen" : "role-choice"}
                  onClick={() => setChosenView(key)}
                >
                  {t.views[key]}
                  <span className="view-count">{key === "planned" ? planned.length : candidates.length}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {candidates && candidates.length > 0 && shown.length === 0 && (
          <p className="empty">
            {needle !== "" ? t.noMatch : t.noPlanned}{" "}
            {view === "planned" && needle === "" && (
              <button type="button" className="link-button" onClick={() => setChosenView("all")}>
                {t.showAll}
              </button>
            )}
          </p>
        )}
        {shown.length > 0 && (
          <table className="candidate-table card">
            <thead>
              <tr>
                <th>{t.columns.candidate}</th>
                <th>{t.columns.interview}</th>
                <th>{t.columns.shortcuts}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((overview) => (
                <CandidateRow key={overview.candidate.id} overview={overview} onViewCv={() => setCvOf(overview.candidate)} />
              ))}
            </tbody>
          </table>
        )}
        {adding && (
          <AddCandidateDialog
            roles={roles}
            onClose={() => setAdding(false)}
            onImport={() => {
              importCandidate.current?.chooseFile();
              setAdding(false);
            }}
            onAdded={() => {
              setAdding(false);
              // The new Candidate has no Planned Interview yet, so they show among all Candidates.
              setChosenView("all");
              loadCandidates();
              loadRoles();
            }}
          />
        )}
        {roleQuestionsOpen && (
          <RoleQuestionsDialog
            initialRole=""
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
        {dated && <InterviewCalendar interviews={dated} undated={undated} />}
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
  const { text } = useText();
  const t = text.home;
  const { candidate, cv, interviews, nextPlanned, latestTakenPlace } = overview;
  const path = candidatePath(candidate.id);
  return (
    <tr onClick={(event) => openRow(event, path)}>
      <td>
        <a className="candidate-name" href={path} onClick={linkTo(path)}>
          {candidate.name}
        </a>
        <span className="candidate-role">
          {candidate.role}
          {interviews.length > 1 && <span className="interview-count"> · {fill(t.interviewCount, { count: String(interviews.length) })}</span>}
        </span>
      </td>
      <td className="interview-cell">
        {nextPlanned && <InterviewWhen interview={nextPlanned} planned />}
        {latestTakenPlace && <InterviewWhen interview={latestTakenPlace} />}
        {!nextPlanned && !latestTakenPlace && <span className="muted">{interviews.length === 0 ? t.noInterviews : t.noDate}</span>}
      </td>
      <td className="shortcuts">
        {cv ? (
          <button type="button" className="quiet cv-shortcut" title={cv.fileName} onClick={onViewCv}>
            <DocumentIcon />
            {t.viewCv}
          </button>
        ) : (
          <span className="muted shortcut-none">{t.noCv}</span>
        )}
        <a className="shortcut-link" href={`${path}#questions`} onClick={linkTo(`${path}#questions`)} title={t.openQuestions}>
          <QuestionIcon />
          {fill(t.questions, { count: String(overview.savedQuestionCount) })}
        </a>
      </td>
    </tr>
  );
}

// One line of the Interview cell: "Planned · Today · 14:00 · Second Interview", or the same for
// the latest Interview that has taken place. Today stands out.
function InterviewWhen({ interview, planned = false }: { interview: Interview; planned?: boolean }) {
  const { text, languageCode } = useText();
  const t = text.home;
  const today = localDay(new Date());
  const isToday = interview.date === today;
  return (
    <span className={planned ? "interview-when planned" : "interview-when"}>
      <span className={planned ? (isToday ? "pill today" : "pill planned") : "pill"}>{planned ? t.planned : t.takenPlace}</span>
      <span className="interview-day">{isToday ? t.today : shortDay(languageCode, interview.date!, today)}</span>
      {interview.time !== null && <span className="interview-time">{interview.time}</span>}
      <span className="muted interview-which">{interviewName(text, interview)}</span>
    </span>
  );
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 1.75h5.25L12.5 5v9.25H4zM9 1.75V5.25h3.5M6 8.25h4.5M6 10.75h4.5" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
    </svg>
  );
}

function QuestionIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 3h11v8h-6l-3 2.5V11h-2z" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M6.6 6.1a1.5 1.5 0 1 1 2.1 1.4c-.5.3-.7.5-.7 1M8 9.6v.1" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.2 10.2 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 4h1M6 4h7.5M2.5 8h1M6 8h7.5M2.5 12h1M6 12h7.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

// Text for the search, so that case and the dotted and dotless i do not matter: "elif" finds
// "ELİF", and "ivan" finds "IVAN". Only for this search; the Evidence search has its own rule in core.
function folded(value: string): string {
  return value.toLocaleLowerCase("tr").replaceAll("ı", "i");
}
