import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { api, type Candidate } from "./api.ts";
import { navigate } from "./navigation.ts";
import { text } from "./text.ts";

type Load = { state: "loading" } | { state: "ready"; candidate: Candidate } | { state: "missing" };

export function Workspace({ candidateId }: { candidateId: string }) {
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(() => {
    api.getCandidate(candidateId).then(
      (candidate) => setLoad({ state: "ready", candidate }),
      () => setLoad({ state: "missing" }),
    );
  }, [candidateId]);

  function back(event: MouseEvent) {
    event.preventDefault();
    navigate("/");
  }

  return (
    <main className="workspace">
      <header className="workspace-header">
        <a href="/" onClick={back}>
          {text.workspace.back}
        </a>
        {load.state === "ready" && (
          <h1>
            {load.candidate.name} · <span className="role">{load.candidate.role}</span>
          </h1>
        )}
      </header>
      {load.state === "loading" && <p>{text.workspace.loading}</p>}
      {load.state === "missing" && <p className="error">{text.workspace.notFound}</p>}
      {load.state === "ready" && (
        <div className="panels">
          <Panel area="cv" title={text.panels.cv.title}>
            <p className="empty">{text.panels.cv.empty}</p>
          </Panel>
          <Panel area="notes" title={text.panels.myNotes.title}>
            <p className="empty">{text.panels.myNotes.empty}</p>
          </Panel>
          <Panel area="transcript" title={text.panels.transcript.title}>
            <p className="empty">{text.panels.transcript.empty}</p>
          </Panel>
          <Panel area="ai" title={text.panels.aiNotes.title} label={text.panels.aiNotes.label}>
            <p className="empty">{text.panels.aiNotes.empty}</p>
          </Panel>
          <Panel area="questions" title={text.panels.questions.title}>
            <p className="empty">{text.panels.questions.empty}</p>
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
