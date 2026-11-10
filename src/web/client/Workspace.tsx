import { useEffect, useState, type ReactNode } from "react";
import { api, ApiError, type Candidate } from "./api.ts";
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
      {load.state === "loading" && <p>{text.workspace.loading}</p>}
      {load.state === "notFound" && <p className="error">{text.workspace.notFound}</p>}
      {load.state === "failed" && <p className="error">{text.workspace.loadFailed}</p>}
      {load.state === "ready" && (
        <div className="panels">
          <Panel area="cv" title={text.panels.cv.title}>
            <p className="empty">{text.panels.cv.empty}</p>
          </Panel>
          <Panel area="notes" title={text.panels.interviewerNotes.title}>
            <p className="empty">{text.panels.interviewerNotes.empty}</p>
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
