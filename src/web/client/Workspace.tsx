import { useEffect, useState, type ReactNode } from "react";
import { AiNotesPanel } from "./AiNotesPanel.tsx";
import { api, ApiError, type Candidate, type EvidenceResult, type Interview } from "./api.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { CvPanel } from "./CvPanel.tsx";
import type { CvFocus } from "./evidence-focus.ts";
import { EvidenceSearch } from "./EvidenceSearch.tsx";
import { InterviewSelector } from "./InterviewSelector.tsx";
import { NotesPanel } from "./NotesPanel.tsx";
import { linkTo, navigate } from "./navigation.ts";
import { SavedQuestions } from "./SavedQuestions.tsx";
import { TranscriptPanel, type SegmentHighlight } from "./TranscriptPanel.tsx";
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
  const [deleting, setDeleting] = useState(false);
  // Counts changes to the selected Interview's Transcript, so the AI Notes panel loads again.
  const [transcriptVersion, setTranscriptVersion] = useState(0);
  // Counts CV uploads, so the Suggested Questions load again.
  const [cvVersion, setCvVersion] = useState(0);
  // The Transcript segment an AI Note's quote points to. `request` changes on every click, so
  // clicking the same quote again scrolls to it again.
  const [highlight, setHighlight] = useState<SegmentHighlight>();
  // The CV match an Evidence search result points to. `id` changes on every click, too.
  const [cvFocus, setCvFocus] = useState<CvFocus>();

  // A Transcript result selects its Interview, since the Transcript panel shows one Interview,
  // and is shown the same way as an AI Note's quote, with the matched words marked.
  function openEvidence(result: EvidenceResult) {
    if (result.source === "cv") {
      // The CV panel marks the match in the page's whole text, not only in the excerpt.
      const highlights = result.highlights.map(({ start, end }) => ({
        start: result.excerptStart + start,
        end: result.excerptStart + end,
      }));
      setCvFocus((current) => ({ id: (current?.id ?? 0) + 1, page: result.page, highlights }));
    } else {
      setInterviewId(result.interviewId);
      setHighlight((current) => ({
        interviewId: result.interviewId,
        segmentNumber: result.segmentNumber,
        request: (current?.request ?? 0) + 1,
        marks: result.highlights,
      }));
    }
  }

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
  // A 404 means the Candidate is already gone, for example deleted in another tab, so it counts
  // as deleted too.
  async function confirmDelete() {
    setConfirmingDelete(false);
    setDeleteFailed(false);
    setDeleting(true);
    try {
      await api.deleteCandidate(candidateId);
      navigate("/");
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        navigate("/");
      } else {
        setDeleteFailed(true);
        setDeleting(false);
      }
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
      {/* One row: who, which Interview, the search, and Delete at the far end. */}
      <header className="workspace-bar">
        <a className="back-link" href="/" onClick={linkTo("/")}>
          {text.workspace.back}
        </a>
        {load.state === "ready" && (
          <h1 title={`${load.candidate.name} · ${load.candidate.role}`}>
            {load.candidate.name} <span className="role">{load.candidate.role}</span>
          </h1>
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
        {load.state === "ready" && (
          <EvidenceSearch candidateId={candidateId} interviews={interviews} onOpen={openEvidence} />
        )}
        {load.state === "ready" && (
          <button
            type="button"
            className="icon-button danger-quiet delete-candidate"
            disabled={deleting}
            aria-label={text.workspace.deleteCandidate}
            title={text.workspace.deleteCandidate}
            onClick={() => setConfirmingDelete(true)}
          >
            <TrashIcon />
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
      {load.state === "loading" && <p>{text.workspace.loading}</p>}
      {load.state === "notFound" && <p className="error">{text.workspace.notFound}</p>}
      {load.state === "failed" && <p className="error">{text.workspace.loadFailed}</p>}
      {load.state === "ready" && (
        <div className="panels">
          <Panel area="cv" title={text.panels.cv.title}>
            <CvPanel candidateId={load.candidate.id} focus={cvFocus} onChanged={() => setCvVersion((version) => version + 1)} />
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
            <TranscriptPanel
              interviews={interviews}
              selectedInterviewId={interviewId}
              highlight={highlight}
              onChanged={() => {
                setTranscriptVersion((version) => version + 1);
                // A replaced Transcript has different segments, so an old highlight would point to the wrong one.
                setHighlight(undefined);
              }}
            />
          </Panel>
          <Panel area="ai" title={text.panels.aiNotes.title} label={text.panels.aiNotes.label}>
            <AiNotesPanel
              interviews={interviews}
              selectedInterviewId={interviewId}
              transcriptVersion={transcriptVersion}
              onShowEvidence={(id, segmentNumber) =>
                setHighlight((current) => ({ interviewId: id, segmentNumber, request: (current?.request ?? 0) + 1 }))
              }
            />
          </Panel>
          <Panel area="questions" title={text.panels.questions.title}>
            <SavedQuestions candidateId={load.candidate.id} interviews={interviews} sourceVersion={transcriptVersion + cvVersion} />
          </Panel>
        </div>
      )}
    </main>
  );
}

// A panel of the Workspace. Its full-screen button shows on hover and opens the panel almost full
// screen, over the rest; the same component stays mounted, so nothing typed or loaded is lost.
function Panel({ area, title, label, children }: { area: string; title: string; label?: string; children: ReactNode }) {
  const { text } = useText();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    // Escape closes the panel, unless it belongs to a field or a dialog inside it.
    function onKey(event: KeyboardEvent) {
      const target = event.target as Element;
      if (event.key !== "Escape" || target.closest("input, textarea, select, dialog")) return;
      setExpanded(false);
    }
    document.addEventListener("keydown", onKey);
    document.body.classList.add("panel-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("panel-open");
    };
  }, [expanded]);

  const toggleLabel = expanded ? text.panels.collapse : text.panels.expand;
  return (
    <>
      {expanded && <div className="panel-backdrop" onClick={() => setExpanded(false)} />}
      <section
        className={`panel panel-${area}${expanded ? " expanded" : ""}`}
        aria-label={title}
        {...(expanded ? { role: "dialog", "aria-modal": true } : {})}
      >
        <header className="panel-head">
          <h2>
            {title}
            {label && <span className="ai-label">{label}</span>}
          </h2>
          <button
            type="button"
            className="icon-button panel-expand"
            aria-label={toggleLabel}
            title={toggleLabel}
            aria-pressed={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <CollapseIcon /> : <ExpandIcon />}
          </button>
        </header>
        <div className="panel-body">{children}</div>
      </section>
    </>
  );
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.75 6.5v4.5M9.25 6.5v4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
