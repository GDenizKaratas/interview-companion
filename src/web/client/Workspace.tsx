import { useEffect, useState, type ReactNode } from "react";
import { api, ApiError, type Candidate, type Interview } from "./api.ts";
import { InterviewSelector } from "./InterviewSelector.tsx";
import { NotesPanel } from "./NotesPanel.tsx";
import { linkTo } from "./navigation.ts";
import { SavedQuestions } from "./SavedQuestions.tsx";
import { useText } from "./text.tsx";

type Load =
  | { state: "loading" }
  | { state: "ready"; candidate: Candidate }
  | { state: "notFound" }
  | { state: "failed" };

export function Workspace({ candidateId }: { candidateId: string }) {
  const { text } = useText();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  // The selected Interview's id, or null for all Interviews. The panels show only its content.
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [interviewsFailed, setInterviewsFailed] = useState(false);

  function loadInterviews(id: string): Promise<void> {
    return api.listInterviews(id).then(
      (list) => {
        setInterviews(list);
        setInterviewsFailed(false);
      },
      () => setInterviewsFailed(true),
    );
  }

  useEffect(() => {
    void loadInterviews(candidateId);
  }, [candidateId]);

  // Adding an Interview can change the numbers of the others, and core decides them, so the
  // list is fetched again before the new Interview is selected. If that fails, the new one is
  // still shown and selected, next to the load error.
  async function handleInterviewAdded(added: Interview) {
    await loadInterviews(candidateId);
    setInterviews((current) => (current.some((i) => i.id === added.id) ? current : [...current, added]));
    setInterviewId(added.id);
  }

  useEffect(() => {
    api.getCandidate(candidateId).then(
      (candidate) => setLoad({ state: "ready", candidate }),
      (error) => setLoad({ state: error instanceof ApiError && error.status === 404 ? "notFound" : "failed" }),
    );
  }, [candidateId]);

  return (
    <main className="workspace">
      <header className="workspace-header">
        <a href="/" onClick={linkTo("/")}>
          {text.workspace.back}
        </a>
        {load.state === "ready" && (
          <h1>
            {load.candidate.name} · <span className="role">{load.candidate.role}</span>
          </h1>
        )}
      </header>
      {load.state === "ready" && (
        <InterviewSelector
          interviews={interviews}
          loadError={interviewsFailed}
          candidateId={candidateId}
          selected={interviewId}
          onSelect={setInterviewId}
          onAdded={handleInterviewAdded}
        />
      )}
      {load.state === "loading" && <p>{text.workspace.loading}</p>}
      {load.state === "notFound" && <p className="error">{text.workspace.notFound}</p>}
      {load.state === "failed" && <p className="error">{text.workspace.loadFailed}</p>}
      {load.state === "ready" && (
        <div className="panels">
          <Panel area="cv" title={text.panels.cv.title}>
            <p className="empty">{text.panels.cv.empty}</p>
          </Panel>
          <Panel area="notes" title={text.panels.interviewerNotes.title}>
            <NotesPanel
              candidateId={candidateId}
              interviews={interviews}
              selectedInterviewId={interviewId}
              onShowAll={() => setInterviewId(null)}
            />
          </Panel>
          <Panel area="transcript" title={text.panels.transcript.title}>
            <p className="empty">{text.panels.transcript.empty}</p>
          </Panel>
          <Panel area="ai" title={text.panels.aiNotes.title} label={text.panels.aiNotes.label}>
            <p className="empty">{text.panels.aiNotes.empty}</p>
          </Panel>
          <Panel area="questions" title={text.panels.questions.title}>
            <SavedQuestions candidateId={load.candidate.id} />
          </Panel>
        </div>
      )}
    </main>
  );
}

function Panel({ area, title, label, children }: { area: string; title: string; label?: string; children: ReactNode }) {
  return (
    <section className={`panel panel-${area}`} aria-label={title}>
      <h2>
        {title}
        {label && <span className="ai-label">{label}</span>}
      </h2>
      {children}
    </section>
  );
}
