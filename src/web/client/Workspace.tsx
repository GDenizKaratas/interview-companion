import { useEffect, useState, type ReactNode } from "react";
import { api, ApiError, type Candidate, type Interview } from "./api.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { InterviewSelector } from "./InterviewSelector.tsx";
import { NotesPanel } from "./NotesPanel.tsx";
import { linkTo, navigate } from "./navigation.ts";
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

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

  // After the Candidate is deleted there is nothing left to show, so the app goes back to the list.
  async function confirmDelete() {
    setConfirmingDelete(false);
    setDeleteFailed(false);
    try {
      await api.deleteCandidate(candidateId);
      navigate("/");
    } catch {
      setDeleteFailed(true);
    }
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
        {load.state === "ready" && (
          <button type="button" className="quiet delete-candidate" onClick={() => setConfirmingDelete(true)}>
            {text.workspace.deleteCandidate}
          </button>
        )}
      </header>
      {deleteFailed && <p className="error">{text.workspace.deleteCandidateFailed}</p>}
      {confirmingDelete && load.state === "ready" && (
        <ConfirmDialog
          title={text.workspace.confirmDeleteCandidate}
          confirmLabel={text.workspace.delete}
          cancelLabel={text.workspace.cancel}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmingDelete(false)}
        >
          <p>
            <strong>{load.candidate.name}</strong> · {load.candidate.role}
          </p>
          <p>{text.workspace.deleteCandidateDetails}</p>
        </ConfirmDialog>
      )}
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
